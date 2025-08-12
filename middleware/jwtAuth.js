const { sign: signJwt, verify: verifyJwt } = require('../utils/jwt');
// JWT verification middleware
const verifyJWT = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({
      status: 'error',
      error_code: 401,
      message: 'Access token required'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.device = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      status: 'error',
      error_code: 401,
      message: 'Invalid or expired token'
    });
  }
};

module.exports = { verifyJWT };