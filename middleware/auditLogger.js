
/**
 * Comprehensive Audit Logging Middleware for AttendanceAPI
 * Implements security-focused audit trail with Winston
 * 
 * Security Features:
 * - Complete audit trail for all data access and modifications
 * - Structured logging with correlation IDs
 * - Sensitive data filtering and sanitization
 * - Security event classification and alerting
 * - Compliance-ready log format (GDPR, ISO 27001)
 */

const winston = require('winston');
const crypto = require('crypto');
const path = require('path');

class AuditLogger {
  constructor() {
    this.initializeLogger();
    this.sensitiveFields = [
      'password', 'token', 'secret', 'key', 'authorization',
      'national_id', 'template_hash', 'biometric', 'ssn'
    ];
  }

  initializeLogger() {
    // Create audit-specific logger
    this.auditLogger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss.SSS'
        }),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          return JSON.stringify({
            timestamp,
            level: level.toUpperCase(),
            message,
            ...meta
          });
        })
      ),
      transports: [
        // Audit log file with daily rotation
        new winston.transports.File({
          filename: path.join(process.env.LOG_DIR || './logs', 'audit.log'),
          maxsize: 50 * 1024 * 1024, // 50MB
          maxFiles: 30, // Keep 30 days
          tailable: true
        }),
        // Security events log
        new winston.transports.File({
          filename: path.join(process.env.LOG_DIR || './logs', 'security.log'),
          level: 'warn',
          maxsize: 50 * 1024 * 1024,
          maxFiles: 90 // Keep security logs longer
        })
      ]
    });

    // Add console transport for development
    if (process.env.NODE_ENV === 'development') {
      this.auditLogger.add(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }));
    }
  }

  /**
   * Generate correlation ID for request tracking
   */
  generateCorrelationId() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Sanitize sensitive data from logs
   */
  sanitizeData(data) {
    if (!data || typeof data !== 'object') return data;

    const sanitized = Array.isArray(data) ? [] : {};
    
    for (const [key, value] of Object.entries(data)) {
      const keyLower = key.toLowerCase();
      const isSensitive = this.sensitiveFields.some(field => 
        keyLower.includes(field) || keyLower === field
      );

      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (value && typeof value === 'object') {
        sanitized[key] = this.sanitizeData(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Log authentication events
   */
  logAuth(event, details) {
    const logData = {
      event_type: 'AUTHENTICATION',
      event_subtype: event,
      correlation_id: details.correlationId,
      user_id: details.userId || 'anonymous',
      device_id: details.deviceId,
      ip_address: details.ipAddress,
      user_agent: details.userAgent,
      success: details.success,
      failure_reason: details.failureReason,
      session_id: details.sessionId,
      timestamp: new Date().toISOString()
    };

    const level = details.success ? 'info' : 'warn';
    this.auditLogger.log(level, `Authentication ${event}`, logData);

    // Alert on suspicious authentication patterns
    if (!details.success && event === 'LOGIN_ATTEMPT') {
      this.logSecurityEvent('FAILED_LOGIN', details);
    }
  }

  /**
   * Log data access events
   */
  logDataAccess(action, details) {
    const logData = {
      event_type: 'DATA_ACCESS',
      action: action,
      correlation_id: details.correlationId,
      user_id: details.userId,
      resource: details.resource,
      resource_id: details.resourceId,
      table_name: details.tableName,
      affected_records: details.affectedRecords || 1,
      ip_address: details.ipAddress,
      user_agent: details.userAgent,
      query_params: this.sanitizeData(details.queryParams),
      timestamp: new Date().toISOString()
    };

    this.auditLogger.info(`Data access: ${action}`, logData);

    // Log sensitive data access at higher level
    if (details.resource && details.resource.includes('biometric')) {
      this.logSecurityEvent('BIOMETRIC_ACCESS', details);
    }
  }

  /**
   * Log data modification events
   */
  logDataModification(action, details) {
    const logData = {
      event_type: 'DATA_MODIFICATION',
      action: action,
      correlation_id: details.correlationId,
      user_id: details.userId,
      resource: details.resource,
      resource_id: details.resourceId,
      table_name: details.tableName,
      affected_records: details.affectedRecords || 1,
      old_values: this.sanitizeData(details.oldValues),
      new_values: this.sanitizeData(details.newValues),
      ip_address: details.ipAddress,
      user_agent: details.userAgent,
      timestamp: new Date().toISOString()
    };

    this.auditLogger.info(`Data modification: ${action}`, logData);
  }

  /**
   * Log security events
   */
  logSecurityEvent(eventType, details) {
    const logData = {
      event_type: 'SECURITY_EVENT',
      security_event: eventType,
      correlation_id: details.correlationId,
      user_id: details.userId || 'anonymous',
      ip_address: details.ipAddress,
      user_agent: details.userAgent,
      severity: details.severity || 'MEDIUM',
      description: details.description,
      additional_data: this.sanitizeData(details.additionalData),
      timestamp: new Date().toISOString()
    };

    this.auditLogger.warn(`Security event: ${eventType}`, logData);
  }

  /**
   * Log system events
   */
  logSystemEvent(event, details) {
    const logData = {
      event_type: 'SYSTEM_EVENT',
      system_event: event,
      correlation_id: details.correlationId,
      component: details.component,
      status: details.status,
      message: details.message,
      error_details: details.error,
      timestamp: new Date().toISOString()
    };

    const level = details.status === 'ERROR' ? 'error' : 'info';
    this.auditLogger.log(level, `System event: ${event}`, logData);
  }

  /**
   * Express middleware for request/response logging
   */
  requestMiddleware() {
    return (req, res, next) => {
      // Generate correlation ID
      req.correlationId = this.generateCorrelationId();
      res.setHeader('X-Correlation-ID', req.correlationId);

      // Capture request start time
      req.startTime = Date.now();

      // Extract user information
      const userId = req.user?.id || req.user?.userId || 'anonymous';
      const deviceId = req.headers['x-device-id'] || 'unknown';

      // Log request
      this.auditLogger.info('HTTP Request', {
        event_type: 'HTTP_REQUEST',
        correlation_id: req.correlationId,
        method: req.method,
        url: req.originalUrl,
        user_id: userId,
        device_id: deviceId,
        ip_address: req.ip || req.connection.remoteAddress,
        user_agent: req.get('User-Agent'),
        content_length: req.get('Content-Length'),
        query_params: this.sanitizeData(req.query),
        timestamp: new Date().toISOString()
      });

      // Override res.json to log responses
      const originalJson = res.json;
      res.json = function(data) {
        const responseTime = Date.now() - req.startTime;
        
        // Log response
        req.auditLogger.auditLogger.info('HTTP Response', {
          event_type: 'HTTP_RESPONSE',
          correlation_id: req.correlationId,
          method: req.method,
          url: req.originalUrl,
          status_code: res.statusCode,
          user_id: userId,
          device_id: deviceId,
          response_time_ms: responseTime,
          content_length: JSON.stringify(data).length,
          timestamp: new Date().toISOString()
        });

        return originalJson.call(this, data);
      };

      // Attach audit logger to request
      req.auditLogger = this;
      next();
    };
  }

  /**
   * Database operation middleware
   */
  databaseMiddleware() {
    return {
      beforeQuery: (query, bindings, correlationId, userId) => {
        this.auditLogger.debug('Database Query', {
          event_type: 'DATABASE_QUERY',
          correlation_id: correlationId,
          user_id: userId,
          query: query.replace(/\$\d+/g, '?'), // Sanitize parameter placeholders
          timestamp: new Date().toISOString()
        });
      },

      afterQuery: (query, bindings, result, correlationId, userId) => {
        this.auditLogger.debug('Database Query Result', {
          event_type: 'DATABASE_RESULT',
          correlation_id: correlationId,
          user_id: userId,
          affected_rows: result?.rowCount || 0,
          timestamp: new Date().toISOString()
        });
      }
    };
  }

  /**
   * Error logging middleware
   */
  errorMiddleware() {
    return (error, req, res, next) => {
      const logData = {
        event_type: 'ERROR',
        correlation_id: req.correlationId,
        error_message: error.message,
        error_stack: error.stack,
        method: req.method,
        url: req.originalUrl,
        user_id: req.user?.id || 'anonymous',
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      };

      this.auditLogger.error('Application Error', logData);

      // Check if it's a security-related error
      if (error.name === 'UnauthorizedError' || 
          error.status === 401 || 
          error.status === 403) {
        this.logSecurityEvent('UNAUTHORIZED_ACCESS', {
          correlationId: req.correlationId,
          userId: req.user?.id,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          description: error.message,
          severity: 'HIGH'
        });
      }

      next(error);
    };
  }
}

// Export singleton instance
const auditLogger = new AuditLogger();

module.exports = {
  AuditLogger,
  auditLogger,
  auditMiddleware: {
    request: auditLogger.requestMiddleware(),
    error: auditLogger.errorMiddleware(),
    database: auditLogger.databaseMiddleware()
  }
};
