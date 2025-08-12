const { v4: uuidv4 } = require('uuid');

module.exports = (req, res, next) => {
  req.headers['x-request-id'] = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-Id', req.headers['x-request-id']);
  next();
};