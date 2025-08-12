module.exports = (req, res, next) => {
  // Enforce HTTPS in production
  
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return res.status(403).json({
      status: 'error',
      error_code: 403,
      message: 'HTTPS required'
    });
  }
    
  // Prevent HTTP parameter pollution
  if (Object.keys(req.query).some(key => Array.isArray(req.query[key]))) {
    return res.status(400).json({
      status: 'error',
      error_code: 400,
      message: 'Invalid query parameters'
    });
  }
  next();
};