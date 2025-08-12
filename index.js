const app = require('./app');
const logger = require('./utils/logger');
const syncService = require('./services/syncService');
const { startScheduler } = require('./services/schedulerService');

let server;

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  if (server) {
    server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
    });
  }
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  if (server) {
    server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
    });
  }
});

// Start server only if this file is run directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  server = app.listen(PORT, () => {
    logger.info(`🚀 Kiron Timespring API Server started on port ${PORT}`);
    logger.info(`📍 Environment: ${process.env.NODE_ENV}`);
    logger.info(`🏢 Company: ${process.env.COMPANY_NAME}`);
    logger.info(`🔗 ERPNext: ${process.env.ERP_BASE_URL}`);
    logger.info(`📚 API Docs: http://localhost:${PORT}/api/docs`);

    // Start background services
    // Start automatic pending-attendance sync if enabled
    if (process.env.ENABLE_SYNC_SERVICE !== 'false') {
      syncService.start();
    }
    startScheduler();
  });
}

module.exports = app;