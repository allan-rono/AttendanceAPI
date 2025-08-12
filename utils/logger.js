const { createLogger, format, transports } = require('winston');
module.exports = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.File({ filename: 'logs/error.log', level: 'error', maxsize: 10_485_760 }),
    new transports.File({ filename: 'logs/combined.log', maxsize: 10_485_760 })
  ],
});
if (process.env.NODE_ENV !== 'production') {
  module.exports.add(new transports.Console({ format: format.simple() }));
}