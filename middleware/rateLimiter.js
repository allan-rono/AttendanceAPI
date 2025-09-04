
/**
 * Advanced Rate Limiting and DDoS Protection for AttendanceAPI
 * Implements multi-tier rate limiting with Redis backend
 * 
 * Security Features:
 * - Multi-tier rate limiting (global, endpoint-specific, user-specific)
 * - DDoS protection with progressive delays
 * - IP-based and user-based limiting
 * - Whitelist/blacklist support
 * - Suspicious activity detection and blocking
 */

const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const Redis = require('redis');
const { auditLogger } = require('./auditLogger');

class AdvancedRateLimiter {
  constructor() {
    this.initializeRedis();
    this.suspiciousIPs = new Set();
    this.whitelistedIPs = new Set(process.env.WHITELISTED_IPS?.split(',') || []);
    this.blacklistedIPs = new Set();
  }

  async initializeRedis() {
    try {
      this.redis = Redis.createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });

      this.redis.on('error', (error) => {
        console.error('Rate limiter Redis error:', error);
      });

      await this.redis.connect();
    } catch (error) {
      console.error('Failed to initialize Redis for rate limiting:', error);
    }
  }

  /**
   * Custom store using Redis for distributed rate limiting
   */
  createRedisStore() {
    return {
      incr: async (key, cb) => {
        try {
          const current = await this.redis.incr(key);
          if (current === 1) {
            await this.redis.expire(key, 60); // 1 minute window
          }
          cb(null, current, new Date(Date.now() + 60000));
        } catch (error) {
          cb(error);
        }
      },
      decrement: async (key) => {
        try {
          await this.redis.decr(key);
        } catch (error) {
          console.error('Redis decrement error:', error);
        }
      },
      resetKey: async (key) => {
        try {
          await this.redis.del(key);
        } catch (error) {
          console.error('Redis reset error:', error);
        }
      }
    };
  }

  /**
   * Enhanced key generator for rate limiting
   */
  keyGenerator(req) {
    const ip = req.ip || req.connection.remoteAddress;
    const userId = req.user?.id || 'anonymous';
    const userAgent = req.get('User-Agent') || 'unknown';
    
    // Create composite key for more granular control
    return `${ip}:${userId}:${Buffer.from(userAgent).toString('base64').substring(0, 10)}`;
  }

  /**
   * Custom handler for rate limit exceeded
   */
  rateLimitHandler(req, res) {
    const ip = req.ip || req.connection.remoteAddress;
    const userId = req.user?.id || 'anonymous';

    // Log rate limit violation
    auditLogger.logSecurityEvent('RATE_LIMIT_EXCEEDED', {
      correlationId: req.correlationId,
      userId,
      ipAddress: ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl,
      method: req.method,
      severity: 'MEDIUM',
      description: 'Rate limit exceeded'
    });

    // Track suspicious IPs
    this.trackSuspiciousActivity(ip, 'rate_limit_exceeded');

    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: res.get('Retry-After') || '60'
    });
  }

  /**
   * Track suspicious activity and auto-block if necessary
   */
  async trackSuspiciousActivity(ip, reason) {
    try {
      const key = `suspicious:${ip}`;
      const count = await this.redis.incr(key);
      
      if (count === 1) {
        await this.redis.expire(key, 3600); // 1 hour window
      }

      // Auto-block after 10 suspicious activities in 1 hour
      if (count >= 10) {
        await this.blockIP(ip, 'auto_block_suspicious_activity', 3600); // Block for 1 hour
        
        auditLogger.logSecurityEvent('IP_AUTO_BLOCKED', {
          ipAddress: ip,
          reason: 'suspicious_activity',
          count,
          severity: 'HIGH',
          description: `IP automatically blocked after ${count} suspicious activities`
        });
      }
    } catch (error) {
      console.error('Failed to track suspicious activity:', error);
    }
  }

  /**
   * Block IP address
   */
  async blockIP(ip, reason, duration = 3600) {
    try {
      await this.redis.setEx(`blocked:${ip}`, duration, reason);
      this.blacklistedIPs.add(ip);
      
      auditLogger.logSecurityEvent('IP_BLOCKED', {
        ipAddress: ip,
        reason,
        duration,
        severity: 'HIGH'
      });
    } catch (error) {
      console.error('Failed to block IP:', error);
    }
  }

  /**
   * Check if IP is blocked
   */
  async isIPBlocked(ip) {
    try {
      const blocked = await this.redis.get(`blocked:${ip}`);
      return blocked !== null || this.blacklistedIPs.has(ip);
    } catch (error) {
      console.error('Failed to check IP block status:', error);
      return false;
    }
  }

  /**
   * Skip rate limiting for whitelisted IPs and successful requests
   */
  skipSuccessfulRequests(req, res) {
    const ip = req.ip || req.connection.remoteAddress;
    
    // Skip for whitelisted IPs
    if (this.whitelistedIPs.has(ip)) {
      return true;
    }

    // Skip for successful responses (2xx status codes)
    return res.statusCode < 400;
  }

  /**
   * IP blocking middleware
   */
  ipBlockingMiddleware() {
    return async (req, res, next) => {
      const ip = req.ip || req.connection.remoteAddress;
      
      try {
        const isBlocked = await this.isIPBlocked(ip);
        if (isBlocked) {
          auditLogger.logSecurityEvent('BLOCKED_IP_ACCESS_ATTEMPT', {
            correlationId: req.correlationId,
            ipAddress: ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.originalUrl,
            severity: 'HIGH',
            description: 'Blocked IP attempted access'
          });

          return res.status(403).json({
            error: 'Access denied',
            message: 'Your IP address has been blocked due to suspicious activity'
          });
        }
      } catch (error) {
        console.error('IP blocking check failed:', error);
      }

      next();
    };
  }

  /**
   * Global rate limiter
   */
  globalLimiter() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // Limit each IP to 1000 requests per windowMs
      message: {
        error: 'Too many requests',
        message: 'Global rate limit exceeded'
      },
      standardHeaders: true,
      legacyHeaders: false,
      store: this.redis ? this.createRedisStore() : undefined,
      keyGenerator: this.keyGenerator.bind(this),
      handler: this.rateLimitHandler.bind(this),
      skip: this.skipSuccessfulRequests.bind(this)
    });
  }

  /**
   * Authentication endpoint limiter
   */
  authLimiter() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10, // Limit each IP to 10 login attempts per windowMs
      message: {
        error: 'Too many authentication attempts',
        message: 'Please try again later'
      },
      standardHeaders: true,
      legacyHeaders: false,
      store: this.redis ? this.createRedisStore() : undefined,
      keyGenerator: this.keyGenerator.bind(this),
      handler: (req, res) => {
        const ip = req.ip || req.connection.remoteAddress;
        
        // Track failed authentication attempts
        this.trackSuspiciousActivity(ip, 'auth_rate_limit');
        
        auditLogger.logSecurityEvent('AUTH_RATE_LIMIT_EXCEEDED', {
          correlationId: req.correlationId,
          ipAddress: ip,
          userAgent: req.get('User-Agent'),
          severity: 'HIGH',
          description: 'Authentication rate limit exceeded'
        });

        res.status(429).json({
          error: 'Too many authentication attempts',
          message: 'Account temporarily locked. Please try again later.',
          retryAfter: res.get('Retry-After') || '900' // 15 minutes
        });
      },
      skipSuccessfulRequests: true // Only count failed attempts
    });
  }

  /**
   * Biometric endpoint limiter
   */
  biometricLimiter() {
    return rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 30, // Limit biometric operations
      message: {
        error: 'Too many biometric requests',
        message: 'Biometric rate limit exceeded'
      },
      standardHeaders: true,
      legacyHeaders: false,
      store: this.redis ? this.createRedisStore() : undefined,
      keyGenerator: this.keyGenerator.bind(this),
      handler: this.rateLimitHandler.bind(this)
    });
  }

  /**
   * API endpoint limiter
   */
  apiLimiter() {
    return rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 100, // Limit each IP to 100 requests per minute
      message: {
        error: 'API rate limit exceeded',
        message: 'Too many API requests'
      },
      standardHeaders: true,
      legacyHeaders: false,
      store: this.redis ? this.createRedisStore() : undefined,
      keyGenerator: this.keyGenerator.bind(this),
      handler: this.rateLimitHandler.bind(this),
      skip: this.skipSuccessfulRequests.bind(this)
    });
  }

  /**
   * Slow down middleware for progressive delays
   */
  slowDownMiddleware() {
    return slowDown({
      windowMs: 15 * 60 * 1000, // 15 minutes
      delayAfter: 50, // Allow 50 requests per windowMs without delay
      delayMs: 500, // Add 500ms delay per request after delayAfter
      maxDelayMs: 20000, // Maximum delay of 20 seconds
      store: this.redis ? this.createRedisStore() : undefined,
      keyGenerator: this.keyGenerator.bind(this),
      skip: this.skipSuccessfulRequests.bind(this),
      onLimitReached: (req, res, options) => {
        const ip = req.ip || req.connection.remoteAddress;
        
        auditLogger.logSecurityEvent('SLOW_DOWN_ACTIVATED', {
          correlationId: req.correlationId,
          ipAddress: ip,
          userAgent: req.get('User-Agent'),
          delay: options.delay,
          severity: 'MEDIUM',
          description: 'Progressive delay activated due to high request rate'
        });
      }
    });
  }

  /**
   * User-specific rate limiter
   */
  userLimiter(maxRequests = 500, windowMs = 15 * 60 * 1000) {
    return rateLimit({
      windowMs,
      max: maxRequests,
      message: {
        error: 'User rate limit exceeded',
        message: 'Too many requests from this user'
      },
      standardHeaders: true,
      legacyHeaders: false,
      store: this.redis ? this.createRedisStore() : undefined,
      keyGenerator: (req) => {
        const userId = req.user?.id || req.ip;
        return `user:${userId}`;
      },
      handler: this.rateLimitHandler.bind(this),
      skip: this.skipSuccessfulRequests.bind(this)
    });
  }

  /**
   * Create custom rate limiter
   */
  createCustomLimiter(options) {
    return rateLimit({
      windowMs: options.windowMs || 60 * 1000,
      max: options.max || 100,
      message: options.message || { error: 'Rate limit exceeded' },
      standardHeaders: true,
      legacyHeaders: false,
      store: this.redis ? this.createRedisStore() : undefined,
      keyGenerator: options.keyGenerator || this.keyGenerator.bind(this),
      handler: options.handler || this.rateLimitHandler.bind(this),
      skip: options.skip || this.skipSuccessfulRequests.bind(this)
    });
  }
}

// Export singleton instance
const rateLimiter = new AdvancedRateLimiter();

module.exports = {
  AdvancedRateLimiter,
  rateLimiter,
  // Pre-configured limiters
  globalLimiter: rateLimiter.globalLimiter(),
  authLimiter: rateLimiter.authLimiter(),
  biometricLimiter: rateLimiter.biometricLimiter(),
  apiLimiter: rateLimiter.apiLimiter(),
  slowDownMiddleware: rateLimiter.slowDownMiddleware(),
  ipBlockingMiddleware: rateLimiter.ipBlockingMiddleware(),
  userLimiter: rateLimiter.userLimiter.bind(rateLimiter),
  createCustomLimiter: rateLimiter.createCustomLimiter.bind(rateLimiter)
};
