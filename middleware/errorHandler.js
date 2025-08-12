const logger = require('../utils/logger');

class APIError extends Error {
  constructor(message, statusCode = 500, errorCode = null, details = null) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error details
  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    body: req.body,
    params: req.params,
    query: req.query
  });

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Invalid resource ID format';
    error = new APIError(message, 400, 'INVALID_ID');
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `Duplicate value for field: ${field}`;
    error = new APIError(message, 400, 'DUPLICATE_FIELD');
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = new APIError(message, 400, 'VALIDATION_ERROR');
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = new APIError(message, 401, 'INVALID_TOKEN');
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = new APIError(message, 401, 'TOKEN_EXPIRED');
  }

  // ERPNext API errors
  if (err.response && err.response.data) {
    const message = err.response.data.message || 'ERPNext API error';
    error = new APIError(message, err.response.status || 500, 'ERPNEXT_ERROR');
  }

  // Rate limiting errors
  if (err.status === 429) {
    error = new APIError('Too many requests', 429, 'RATE_LIMIT_EXCEEDED');
  }

  // Default to 500 server error
  const statusCode = error.statusCode || 500;
  const errorCode = error.errorCode || 'INTERNAL_SERVER_ERROR';

  const errorResponse = {
    status: 'error',
    error_code: statusCode,
    message: error.message || 'Internal Server Error',
    timestamp: new Date().toISOString(),
    request_id: req.headers['x-request-id'] || 'unknown'
  };

  // Add error code for client handling
  if (errorCode !== 'INTERNAL_SERVER_ERROR') {
    errorResponse.error_type = errorCode;
  }

  // Add details in development mode
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
    errorResponse.details = error.details;
  }

  // Add retry information for certain errors
  if (statusCode === 429 || statusCode === 503) {
    errorResponse.retry_after = 60; // seconds
  }

  res.status(statusCode).json(errorResponse);
};

// Helper function for consistent error responses
const handleError = (res, statusCode = 500, message = 'Internal Server Error', errorCode = null, details = null) => {
  const errorResponse = {
    status: 'error',
    error_code: statusCode,
    message,
    timestamp: new Date().toISOString()
  };

  if (errorCode) {
    errorResponse.error_type = errorCode;
  }

  if (details && process.env.NODE_ENV === 'development') {
    errorResponse.details = details;
  }

  return res.status(statusCode).json(errorResponse);
};

// Async error wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  errorHandler,
  handleError,
  asyncHandler,
  APIError
};