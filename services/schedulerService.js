const logger = require('../utils/logger');

function startScheduler() {
  logger.info('Scheduler service started');
  
  // Example: Sync every hour
  const syncInterval = (parseInt(process.env.SYNC_INTERVAL_MINUTES) || 60) * 60 * 1000;
  
  setInterval(() => {
    logger.info('Running scheduled sync...');
    // Add your sync logic here
  }, syncInterval);
}

module.exports = { startScheduler };