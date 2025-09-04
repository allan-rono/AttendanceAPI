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
  logger.error('Error occurred:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Generic error response in production
  if (process.env.NODE_ENV === 'production') {
    return res.status(err.statusCode || 500).json({
      status: 'error',
      error_code: err.statusCode || 500,
      message: 'An error occurred processing your request',
      request_id: req.headers['x-request-id'] || 'unknown'
    });
  }

  // Detailed errors only in development
  res.status(err.statusCode || 500).json({
    status: 'error',
    error_code: err.statusCode || 500,
    message: err.message,
    stack: err.stack
  });
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