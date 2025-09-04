
/**
 * Comprehensive Input Validation and Sanitization for AttendanceAPI
 * Implements security-focused validation with XSS and injection protection
 * 
 * Security Features:
 * - XSS protection with HTML sanitization
 * - SQL injection prevention
 * - NoSQL injection prevention
 * - File upload validation
 * - Data type validation and coercion
 * - Custom validation rules for biometric and attendance data
 */

const { body, param, query, validationResult } = require('express-validator');
const DOMPurify = require('isomorphic-dompurify');
const validator = require('validator');
const { auditLogger } = require('./auditLogger');

class InputValidator {
  constructor() {
    this.initializeCustomValidators();
  }

  /**
   * Initialize custom validators
   */
  initializeCustomValidators() {
    // Kenyan National ID validator
    this.isKenyanNationalId = (value) => {
      const pattern = /^\d{7,8}$/;
      return pattern.test(value);
    };

    // Device ID validator
    this.isValidDeviceId = (value) => {
      const pattern = /^[A-Za-z0-9_-]{8,64}$/;
      return pattern.test(value);
    };

    // Biometric template hash validator
    this.isBiometricHash = (value) => {
      const pattern = /^[A-Fa-f0-9]{64,}$/; // Hex string, minimum 64 chars
      return pattern.test(value);
    };

    // Employee ID validator
    this.isEmployeeId = (value) => {
      const pattern = /^[A-Za-z0-9_-]{3,50}$/;
      return pattern.test(value);
    };
  }

  /**
   * Sanitize input to prevent XSS
   */
  sanitizeInput(input) {
    if (typeof input === 'string') {
      // Remove HTML tags and encode special characters
      return DOMPurify.sanitize(input, { 
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: []
      }).trim();
    }
    return input;
  }

  /**
   * Deep sanitize object
   */
  deepSanitize(obj) {
    if (obj === null || obj === undefined) return obj;
    
    if (typeof obj === 'string') {
      return this.sanitizeInput(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.deepSanitize(item));
    }
    
    if (typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = this.deepSanitize(value);
      }
      return sanitized;
    }
    
    return obj;
  }

  /**
   * Check for NoSQL injection patterns
   */
  hasNoSQLInjection(value) {
    if (typeof value !== 'string') return false;
    
    const patterns = [
      /\$where/i,
      /\$ne/i,
      /\$gt/i,
      /\$lt/i,
      /\$regex/i,
      /\$or/i,
      /\$and/i,
      /javascript:/i,
      /eval\(/i,
      /function\(/i
    ];
    
    return patterns.some(pattern => pattern.test(value));
  }

  /**
   * Validation error handler
   */
  handleValidationErrors(req, res, next) {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      const errorDetails = errors.array().map(error => ({
        field: error.param,
        message: error.msg,
        value: error.value
      }));

      // Log validation failure
      auditLogger.logSecurityEvent('VALIDATION_FAILED', {
        correlationId: req.correlationId,
        userId: req.user?.id || 'anonymous',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.originalUrl,
        errors: errorDetails,
        severity: 'MEDIUM',
        description: 'Input validation failed'
      });

      return res.status(400).json({
        error: 'Validation failed',
        details: errorDetails
      });
    }
    
    next();
  }

  /**
   * Sanitization middleware
   */
  sanitizationMiddleware() {
    return (req, res, next) => {
      try {
        // Sanitize request body
        if (req.body) {
          req.body = this.deepSanitize(req.body);
        }

        // Sanitize query parameters
        if (req.query) {
          req.query = this.deepSanitize(req.query);
        }

        // Sanitize URL parameters
        if (req.params) {
          req.params = this.deepSanitize(req.params);
        }

        // Check for NoSQL injection in all inputs
        const checkForInjection = (obj, path = '') => {
          for (const [key, value] of Object.entries(obj || {})) {
            const currentPath = path ? `${path}.${key}` : key;
            
            if (typeof value === 'string' && this.hasNoSQLInjection(value)) {
              auditLogger.logSecurityEvent('NOSQL_INJECTION_ATTEMPT', {
                correlationId: req.correlationId,
                userId: req.user?.id || 'anonymous',
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                endpoint: req.originalUrl,
                field: currentPath,
                value: value,
                severity: 'HIGH',
                description: 'Potential NoSQL injection detected'
              });

              return res.status(400).json({
                error: 'Invalid input detected',
                message: 'Request contains potentially malicious content'
              });
            }
            
            if (typeof value === 'object' && value !== null) {
              const result = checkForInjection(value, currentPath);
              if (result) return result;
            }
          }
        };

        const injectionCheck = checkForInjection(req.body) || 
                              checkForInjection(req.query) || 
                              checkForInjection(req.params);
        
        if (injectionCheck) return injectionCheck;

        next();
      } catch (error) {
        console.error('Sanitization middleware error:', error);
        res.status(500).json({ error: 'Input processing failed' });
      }
    };
  }

  /**
   * Employee registration validation
   */
  validateEmployeeRegistration() {
    return [
      body('first_name')
        .isLength({ min: 2, max: 50 })
        .withMessage('First name must be 2-50 characters')
        .matches(/^[A-Za-z\s'-]+$/)
        .withMessage('First name contains invalid characters'),
      
      body('last_name')
        .isLength({ min: 2, max: 50 })
        .withMessage('Last name must be 2-50 characters')
        .matches(/^[A-Za-z\s'-]+$/)
        .withMessage('Last name contains invalid characters'),
      
      body('email')
        .optional()
        .isEmail()
        .withMessage('Invalid email format')
        .normalizeEmail(),
      
      body('phone')
        .optional()
        .isMobilePhone('any')
        .withMessage('Invalid phone number format'),
      
      body('national_id')
        .custom((value) => {
          if (!this.isKenyanNationalId(value)) {
            throw new Error('Invalid Kenyan National ID format');
          }
          return true;
        }),
      
      body('date_of_birth')
        .optional()
        .isISO8601()
        .withMessage('Invalid date format')
        .custom((value) => {
          const date = new Date(value);
          const now = new Date();
          const age = now.getFullYear() - date.getFullYear();
          if (age < 16 || age > 100) {
            throw new Error('Age must be between 16 and 100 years');
          }
          return true;
        }),
      
      body('employee_id')
        .custom((value) => {
          if (!this.isEmployeeId(value)) {
            throw new Error('Invalid employee ID format');
          }
          return true;
        }),

      this.handleValidationErrors
    ];
  }

  /**
   * Biometric registration validation
   */
  validateBiometricRegistration() {
    return [
      body('employee_id')
        .custom((value) => {
          if (!this.isEmployeeId(value)) {
            throw new Error('Invalid employee ID format');
          }
          return true;
        }),
      
      body('template_hash')
        .custom((value) => {
          if (!this.isBiometricHash(value)) {
            throw new Error('Invalid biometric template hash format');
          }
          return true;
        }),
      
      body('template_type')
        .isIn(['face', 'fingerprint', 'iris'])
        .withMessage('Invalid template type'),

      this.handleValidationErrors
    ];
  }

  /**
   * Attendance record validation
   */
  validateAttendanceRecord() {
    return [
      body('employee_id')
        .custom((value) => {
          if (!this.isEmployeeId(value)) {
            throw new Error('Invalid employee ID format');
          }
          return true;
        }),
      
      body('timestamp')
        .isISO8601()
        .withMessage('Invalid timestamp format')
        .custom((value) => {
          const date = new Date(value);
          const now = new Date();
          const diffHours = Math.abs(now - date) / (1000 * 60 * 60);
          if (diffHours > 24) {
            throw new Error('Timestamp cannot be more than 24 hours old or in the future');
          }
          return true;
        }),
      
      body('action')
        .isIn(['check_in', 'check_out', 'break_start', 'break_end'])
        .withMessage('Invalid attendance action'),
      
      body('location')
        .optional()
        .isLength({ max: 100 })
        .withMessage('Location must be less than 100 characters'),
      
      body('device_id')
        .custom((value) => {
          if (!this.isValidDeviceId(value)) {
            throw new Error('Invalid device ID format');
          }
          return true;
        }),

      this.handleValidationErrors
    ];
  }

  /**
   * Batch attendance validation
   */
  validateBatchAttendance() {
    return [
      body('records')
        .isArray({ min: 1, max: 200 })
        .withMessage('Records must be an array with 1-200 items'),
      
      body('records.*.employee_id')
        .custom((value) => {
          if (!this.isEmployeeId(value)) {
            throw new Error('Invalid employee ID format');
          }
          return true;
        }),
      
      body('records.*.timestamp')
        .isISO8601()
        .withMessage('Invalid timestamp format'),
      
      body('records.*.action')
        .isIn(['check_in', 'check_out', 'break_start', 'break_end'])
        .withMessage('Invalid attendance action'),

      this.handleValidationErrors
    ];
  }

  /**
   * Authentication validation
   */
  validateAuthentication() {
    return [
      body('username')
        .isLength({ min: 3, max: 50 })
        .withMessage('Username must be 3-50 characters')
        .matches(/^[A-Za-z0-9_-]+$/)
        .withMessage('Username contains invalid characters'),
      
      body('password')
        .isLength({ min: 8, max: 128 })
        .withMessage('Password must be 8-128 characters'),
      
      body('device_id')
        .custom((value) => {
          if (!this.isValidDeviceId(value)) {
            throw new Error('Invalid device ID format');
          }
          return true;
        }),

      this.handleValidationErrors
    ];
  }

  /**
   * ID parameter validation
   */
  validateIdParam() {
    return [
      param('id')
        .custom((value) => {
          if (!this.isEmployeeId(value) && !validator.isUUID(value) && !validator.isNumeric(value)) {
            throw new Error('Invalid ID format');
          }
          return true;
        }),

      this.handleValidationErrors
    ];
  }

  /**
   * Query parameter validation
   */
  validateQueryParams() {
    return [
      query('page')
        .optional()
        .isInt({ min: 1, max: 1000 })
        .withMessage('Page must be between 1 and 1000'),
      
      query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
      
      query('sort')
        .optional()
        .isIn(['asc', 'desc'])
        .withMessage('Sort must be asc or desc'),
      
      query('from_date')
        .optional()
        .isISO8601()
        .withMessage('Invalid from_date format'),
      
      query('to_date')
        .optional()
        .isISO8601()
        .withMessage('Invalid to_date format'),

      this.handleValidationErrors
    ];
  }

  /**
   * File upload validation
   */
  validateFileUpload(allowedTypes = [], maxSize = 5 * 1024 * 1024) {
    return (req, res, next) => {
      if (!req.file && !req.files) {
        return next();
      }

      const files = req.files || [req.file];
      
      for (const file of files) {
        // Check file type
        if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) {
          return res.status(400).json({
            error: 'Invalid file type',
            allowed: allowedTypes
          });
        }

        // Check file size
        if (file.size > maxSize) {
          return res.status(400).json({
            error: 'File too large',
            maxSize: `${maxSize / (1024 * 1024)}MB`
          });
        }

        // Check for malicious file names
        if (file.originalname.includes('..') || 
            file.originalname.includes('/') || 
            file.originalname.includes('\\')) {
          return res.status(400).json({
            error: 'Invalid file name'
          });
        }
      }

      next();
    };
  }

  /**
   * Custom validation middleware
   */
  customValidation(validationFn, errorMessage = 'Validation failed') {
    return (req, res, next) => {
      try {
        const isValid = validationFn(req);
        if (!isValid) {
          return res.status(400).json({
            error: errorMessage
          });
        }
        next();
      } catch (error) {
        res.status(400).json({
          error: errorMessage,
          details: error.message
        });
      }
    };
  }
}

// Export singleton instance
const inputValidator = new InputValidator();

module.exports = {
  InputValidator,
  inputValidator,
  // Validation middleware
  sanitizationMiddleware: inputValidator.sanitizationMiddleware(),
  validateEmployeeRegistration: inputValidator.validateEmployeeRegistration(),
  validateBiometricRegistration: inputValidator.validateBiometricRegistration(),
  validateAttendanceRecord: inputValidator.validateAttendanceRecord(),
  validateBatchAttendance: inputValidator.validateBatchAttendance(),
  validateAuthentication: inputValidator.validateAuthentication(),
  validateIdParam: inputValidator.validateIdParam(),
  validateQueryParams: inputValidator.validateQueryParams(),
  validateFileUpload: inputValidator.validateFileUpload.bind(inputValidator),
  customValidation: inputValidator.customValidation.bind(inputValidator)
};
