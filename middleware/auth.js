require('dotenv').config();

const verifyApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(403).json({
      status: 'error',
      error_code: 403,
      message: 'Unauthorized: Invalid or missing API key'
    });
  }
  
  next();
};

module.exports = { verifyApiKey };