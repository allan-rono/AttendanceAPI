const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { handleError, asyncHandler, APIError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const bcrypt = require('bcrypt');
const knex = require('knex')(require('../knexfile')[process.env.NODE_ENV || 'development']);

// Enhanced rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    status: 'error',
    error_code: 429,
    message: 'Too many authentication attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Generate JWT token
const generateToken = (payload, expiresIn = '24h') => {
  return jwt.sign(payload, process.env.JWT_SECRET, { 
    expiresIn,
    issuer: 'kiron-timespring-api',
    audience: 'kiron-devices'
  });
};

// Generate API key for device
const generateApiKey = (deviceId) => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2);
  return `KIR_${deviceId}_${timestamp}_${random}`.toUpperCase();
};

// Device authentication service
const authenticateDevice = async (username, password) => {
  try {
    const device = await knex('device_credentials').where({ username }).first();
    
    if (!device) {
      return null;
    }

    const isValidPassword = await bcrypt.compare(password, device.password_hash);
    if (!isValidPassword) {
      return null;
    }

    return device;
  } catch (error) {
    logger.error('Device authentication error:', error);
    throw error;
  }
};

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate device and get access token
 * @access  Public
 */
router.post(
  '/login',
  authLimiter,
  [
    body('username')
      .notEmpty().withMessage('Username is required')
      .isLength({ min: 3, max: 50 }).withMessage('Username must be between 3 and 50 characters'),
    body('password')
      .notEmpty().withMessage('Password is required')
      .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('device_id')
      .optional()
      .isLength({ min: 3, max: 100 }).withMessage('Device ID must be between 3 and 100 characters'),
    body('device_type')
      .optional()
      .isIn(['ipad', 'android', 'face_terminal', 'web']).withMessage('Invalid device type')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return handleError(res, 400, 'Validation failed', 'VALIDATION_ERROR', errors.array());
    }

    const { username, password, device_id, device_type = 'ipad' } = req.body;

    try {
      const device = await authenticateDevice(username, password);
      if (!device) {
        logger.warn(`Failed login attempt from IP: ${req.ip}, Username: ${username}`);
        throw new APIError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
      }

      const deviceId = device_id || `${device.device_type || device_type}_${device.id}_${Date.now()}`;

      const payload = {
        device_id: deviceId,
        device_db_id: device.id,
        device_type: device.device_type || device_type,
        username: device.username,
        company: process.env.COMPANY_NAME,
        permissions: ['read:employees', 'write:attendance', 'read:biometrics', 'write:biometrics'],
        login_time: new Date().toISOString()
      };

      const accessToken = generateToken(payload, '24h');
      const refreshToken = generateToken({
        device_id: deviceId,
        device_db_id: device.id,
        username: device.username
      }, '7d');
      const apiKey = generateApiKey(deviceId);

      await knex('device_credentials')
        .where({ id: device.id })
        .update({
          last_login: new Date(),
          updated_at: new Date()
        });

      logger.info(`Successful login for device: ${device.username} (${device.device_type || device_type}), IP: ${req.ip}`);

      res.json({
        status: 'success',
        message: 'Authentication successful',
        data: {
          access_token: accessToken,
          refresh_token: refreshToken,
          api_key: apiKey,
          token_type: 'Bearer',
          expires_in: 86400,
          device_id: deviceId,
          device_type: device.device_type || device_type,
          device_model: device.device_model,
          company: process.env.COMPANY_NAME,
          api_version: process.env.API_VERSION || 'v1'
        }
      });

    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      logger.error('Login error:', error);
      throw new APIError('Authentication failed', 500, 'AUTH_ERROR');
    }
  })
);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Private
 */
router.post(
  '/refresh',
  [
    body('refresh_token')
      .notEmpty()
      .withMessage('Refresh token is required')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return handleError(res, 400, 'Validation failed', 'VALIDATION_ERROR', errors.array());
    }

    const { refresh_token } = req.body;

    try {
      // Verify refresh token
      const decoded = jwt.verify(refresh_token, process.env.JWT_SECRET);
      
      // Verify device still exists in database
      const device = await knex('device_credentials')
        .where({ id: decoded.device_db_id })
        .first();

      if (!device) {
        throw new APIError('Device not found', 401, 'DEVICE_NOT_FOUND');
      }

      // Generate new access token
      const payload = {
        device_id: decoded.device_id,
        device_db_id: device.id,
        device_type: device.device_type,
        username: device.username,
        company: process.env.COMPANY_NAME,
        permissions: ['read:employees', 'write:attendance', 'read:biometrics', 'write:biometrics'],
        login_time: new Date().toISOString()
      };

      const newAccessToken = generateToken(payload, '24h');

      logger.info(`Token refreshed for device: ${decoded.device_id}`);

      res.json({
        status: 'success',
        message: 'Token refreshed successfully',
        data: {
          access_token: newAccessToken,
          token_type: 'Bearer',
          expires_in: 86400
        }
      });

    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        throw new APIError('Invalid refresh token', 401, 'INVALID_TOKEN');
      }
      if (error.name === 'TokenExpiredError') {
        throw new APIError('Refresh token expired', 401, 'TOKEN_EXPIRED');
      }
      throw new APIError('Token refresh failed', 500, 'REFRESH_ERROR');
    }
  })
);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout device (invalidate tokens)
 * @access  Private
 */
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    // In a production system, you would add the token to a blacklist
    // For now, we'll just log the logout
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        logger.info(`Device logged out: ${decoded.device_id}`);
      } catch (error) {
        // Token might be invalid, but we still want to respond with success
        logger.warn('Logout attempt with invalid token');
      }
    }

    res.json({
      status: 'success',
      message: 'Logged out successfully'
    });
  })
);

/**
 * @route   GET /api/v1/auth/verify
 * @desc    Verify token validity
 * @access  Private
 */
router.get(
  '/verify',
  asyncHandler(async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      throw new APIError('No token provided', 401, 'NO_TOKEN');
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      res.json({
        status: 'success',
        message: 'Token is valid',
        data: {
          device_id: decoded.device_id,
          device_type: decoded.device_type,
          username: decoded.username,
          permissions: decoded.permissions,
          expires_at: new Date(decoded.exp * 1000).toISOString()
        }
      });

    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        throw new APIError('Invalid token', 401, 'INVALID_TOKEN');
      }
      if (error.name === 'TokenExpiredError') {
        throw new APIError('Token expired', 401, 'TOKEN_EXPIRED');
      }
      throw new APIError('Token verification failed', 500, 'VERIFY_ERROR');
    }
  })
);

module.exports = router;