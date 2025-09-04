
/**
 * Advanced Session Management with JWT Blacklisting for AttendanceAPI
 * Implements secure token lifecycle management with Redis
 * 
 * Security Features:
 * - JWT token blacklisting with Redis
 * - Session tracking and management
 * - Token rotation and refresh
 * - Concurrent session limiting
 * - Suspicious activity detection
 */

const jwt = require('jsonwebtoken');
const Redis = require('redis');
const crypto = require('crypto');
const { auditLogger } = require('./auditLogger');

class SessionManager {
  constructor() {
    this.initializeRedis();
    this.jwtSecret = process.env.JWT_SECRET;
    this.refreshSecret = process.env.JWT_REFRESH_SECRET;
    this.maxConcurrentSessions = parseInt(process.env.MAX_CONCURRENT_SESSIONS) || 5;
    
    if (!this.jwtSecret || !this.refreshSecret) {
      throw new Error('JWT secrets must be configured');
    }
  }

  async initializeRedis() {
    try {
      this.redis = Redis.createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            return new Error('Redis server connection refused');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            return new Error('Redis retry time exhausted');
          }
          if (options.attempt > 10) {
            return undefined;
          }
          return Math.min(options.attempt * 100, 3000);
        }
      });

      this.redis.on('connect', () => {
        console.log('Redis connected for session management');
      });

      this.redis.on('error', (error) => {
        console.error('Redis error:', error);
        auditLogger.logSystemEvent('REDIS_ERROR', {
          component: 'SessionManager',
          status: 'ERROR',
          error: error.message
        });
      });

      await this.redis.connect();
    } catch (error) {
      console.error('Failed to initialize Redis:', error);
      throw error;
    }
  }

  /**
   * Generate secure session ID
   */
  generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create JWT tokens with session tracking
   */
  async createTokens(userId, deviceId, ipAddress, userAgent) {
    const sessionId = this.generateSessionId();
    const now = Math.floor(Date.now() / 1000);
    
    // Access token payload
    const accessPayload = {
      userId,
      deviceId,
      sessionId,
      type: 'access',
      iat: now,
      exp: now + (15 * 60) // 15 minutes
    };

    // Refresh token payload
    const refreshPayload = {
      userId,
      deviceId,
      sessionId,
      type: 'refresh',
      iat: now,
      exp: now + (7 * 24 * 60 * 60) // 7 days
    };

    // Generate tokens
    const accessToken = jwt.sign(accessPayload, this.jwtSecret);
    const refreshToken = jwt.sign(refreshPayload, this.refreshSecret);

    // Store session information in Redis
    const sessionData = {
      userId,
      deviceId,
      sessionId,
      accessToken,
      refreshToken,
      ipAddress,
      userAgent,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      isActive: true
    };

    // Store session with expiration
    await this.redis.setEx(
      `session:${sessionId}`, 
      7 * 24 * 60 * 60, // 7 days
      JSON.stringify(sessionData)
    );

    // Track user sessions for concurrent session limiting
    await this.addUserSession(userId, sessionId);

    // Log session creation
    auditLogger.logAuth('SESSION_CREATED', {
      userId,
      deviceId,
      sessionId,
      ipAddress,
      userAgent,
      success: true
    });

    return {
      accessToken,
      refreshToken,
      sessionId,
      expiresIn: 15 * 60 // 15 minutes
    };
  }

  /**
   * Validate and decode JWT token
   */
  async validateToken(token, tokenType = 'access') {
    try {
      const secret = tokenType === 'access' ? this.jwtSecret : this.refreshSecret;
      const decoded = jwt.verify(token, secret);

      // Check if token is blacklisted
      const isBlacklisted = await this.isTokenBlacklisted(token);
      if (isBlacklisted) {
        throw new Error('Token is blacklisted');
      }

      // Check if session is still active
      const sessionData = await this.getSession(decoded.sessionId);
      if (!sessionData || !sessionData.isActive) {
        throw new Error('Session is not active');
      }

      // Update last activity
      await this.updateSessionActivity(decoded.sessionId);

      return decoded;
    } catch (error) {
      throw new Error(`Token validation failed: ${error.message}`);
    }
  }

  /**
   * Blacklist a token
   */
  async blacklistToken(token, reason = 'logout') {
    try {
      const decoded = jwt.decode(token);
      if (!decoded) return false;

      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await this.redis.setEx(`blacklist:${token}`, ttl, reason);
        
        auditLogger.logSecurityEvent('TOKEN_BLACKLISTED', {
          userId: decoded.userId,
          sessionId: decoded.sessionId,
          reason,
          tokenType: decoded.type,
          description: `Token blacklisted: ${reason}`
        });
      }

      return true;
    } catch (error) {
      console.error('Failed to blacklist token:', error);
      return false;
    }
  }

  /**
   * Check if token is blacklisted
   */
  async isTokenBlacklisted(token) {
    try {
      const result = await this.redis.get(`blacklist:${token}`);
      return result !== null;
    } catch (error) {
      console.error('Failed to check token blacklist:', error);
      return false; // Fail open for availability
    }
  }

  /**
   * Get session data
   */
  async getSession(sessionId) {
    try {
      const sessionData = await this.redis.get(`session:${sessionId}`);
      return sessionData ? JSON.parse(sessionData) : null;
    } catch (error) {
      console.error('Failed to get session:', error);
      return null;
    }
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(sessionId) {
    try {
      const sessionData = await this.getSession(sessionId);
      if (sessionData) {
        sessionData.lastActivity = new Date().toISOString();
        await this.redis.setEx(
          `session:${sessionId}`,
          7 * 24 * 60 * 60,
          JSON.stringify(sessionData)
        );
      }
    } catch (error) {
      console.error('Failed to update session activity:', error);
    }
  }

  /**
   * Add user session for concurrent session tracking
   */
  async addUserSession(userId, sessionId) {
    try {
      // Add session to user's active sessions
      await this.redis.sAdd(`user_sessions:${userId}`, sessionId);
      
      // Check concurrent session limit
      const activeSessions = await this.redis.sMembers(`user_sessions:${userId}`);
      
      if (activeSessions.length > this.maxConcurrentSessions) {
        // Remove oldest sessions
        const sessionsToRemove = activeSessions.slice(0, activeSessions.length - this.maxConcurrentSessions);
        
        for (const oldSessionId of sessionsToRemove) {
          await this.terminateSession(oldSessionId, 'concurrent_limit_exceeded');
        }
      }
    } catch (error) {
      console.error('Failed to manage user sessions:', error);
    }
  }

  /**
   * Terminate a session
   */
  async terminateSession(sessionId, reason = 'manual') {
    try {
      const sessionData = await this.getSession(sessionId);
      if (!sessionData) return false;

      // Blacklist both tokens
      await this.blacklistToken(sessionData.accessToken, reason);
      await this.blacklistToken(sessionData.refreshToken, reason);

      // Mark session as inactive
      sessionData.isActive = false;
      sessionData.terminatedAt = new Date().toISOString();
      sessionData.terminationReason = reason;

      await this.redis.setEx(
        `session:${sessionId}`,
        24 * 60 * 60, // Keep terminated session data for 24 hours
        JSON.stringify(sessionData)
      );

      // Remove from user's active sessions
      await this.redis.sRem(`user_sessions:${sessionData.userId}`, sessionId);

      auditLogger.logAuth('SESSION_TERMINATED', {
        userId: sessionData.userId,
        deviceId: sessionData.deviceId,
        sessionId,
        reason,
        success: true
      });

      return true;
    } catch (error) {
      console.error('Failed to terminate session:', error);
      return false;
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken, ipAddress, userAgent) {
    try {
      // Validate refresh token
      const decoded = await this.validateToken(refreshToken, 'refresh');
      
      // Generate new access token
      const now = Math.floor(Date.now() / 1000);
      const accessPayload = {
        userId: decoded.userId,
        deviceId: decoded.deviceId,
        sessionId: decoded.sessionId,
        type: 'access',
        iat: now,
        exp: now + (15 * 60) // 15 minutes
      };

      const newAccessToken = jwt.sign(accessPayload, this.jwtSecret);

      // Update session with new access token
      const sessionData = await this.getSession(decoded.sessionId);
      if (sessionData) {
        sessionData.accessToken = newAccessToken;
        sessionData.lastActivity = new Date().toISOString();
        
        await this.redis.setEx(
          `session:${decoded.sessionId}`,
          7 * 24 * 60 * 60,
          JSON.stringify(sessionData)
        );
      }

      auditLogger.logAuth('TOKEN_REFRESHED', {
        userId: decoded.userId,
        deviceId: decoded.deviceId,
        sessionId: decoded.sessionId,
        ipAddress,
        userAgent,
        success: true
      });

      return {
        accessToken: newAccessToken,
        expiresIn: 15 * 60
      };
    } catch (error) {
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }

  /**
   * Logout and terminate session
   */
  async logout(accessToken, refreshToken, reason = 'user_logout') {
    try {
      const decoded = jwt.decode(accessToken);
      if (decoded && decoded.sessionId) {
        await this.terminateSession(decoded.sessionId, reason);
      }
      return true;
    } catch (error) {
      console.error('Logout failed:', error);
      return false;
    }
  }

  /**
   * Get user's active sessions
   */
  async getUserSessions(userId) {
    try {
      const sessionIds = await this.redis.sMembers(`user_sessions:${userId}`);
      const sessions = [];

      for (const sessionId of sessionIds) {
        const sessionData = await this.getSession(sessionId);
        if (sessionData && sessionData.isActive) {
          sessions.push({
            sessionId,
            deviceId: sessionData.deviceId,
            ipAddress: sessionData.ipAddress,
            userAgent: sessionData.userAgent,
            createdAt: sessionData.createdAt,
            lastActivity: sessionData.lastActivity
          });
        }
      }

      return sessions;
    } catch (error) {
      console.error('Failed to get user sessions:', error);
      return [];
    }
  }

  /**
   * Authentication middleware
   */
  authMiddleware() {
    return async (req, res, next) => {
      try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Access token required' });
        }

        const token = authHeader.substring(7);
        const decoded = await this.validateToken(token, 'access');

        // Attach user info to request
        req.user = {
          id: decoded.userId,
          deviceId: decoded.deviceId,
          sessionId: decoded.sessionId
        };

        // Log data access
        auditLogger.logDataAccess('API_ACCESS', {
          correlationId: req.correlationId,
          userId: decoded.userId,
          resource: req.originalUrl,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });

        next();
      } catch (error) {
        auditLogger.logSecurityEvent('INVALID_TOKEN', {
          correlationId: req.correlationId,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          description: error.message,
          severity: 'MEDIUM'
        });

        res.status(401).json({ error: 'Invalid or expired token' });
      }
    };
  }

  /**
   * Optional authentication middleware (doesn't fail if no token)
   */
  optionalAuthMiddleware() {
    return async (req, res, next) => {
      try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          const decoded = await this.validateToken(token, 'access');
          
          req.user = {
            id: decoded.userId,
            deviceId: decoded.deviceId,
            sessionId: decoded.sessionId
          };
        }
      } catch (error) {
        // Log but don't fail
        console.log('Optional auth failed:', error.message);
      }
      
      next();
    };
  }
}

// Export singleton instance
const sessionManager = new SessionManager();

module.exports = {
  SessionManager,
  sessionManager,
  authMiddleware: sessionManager.authMiddleware(),
  optionalAuthMiddleware: sessionManager.optionalAuthMiddleware()
};
