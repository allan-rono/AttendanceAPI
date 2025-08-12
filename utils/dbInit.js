const fs = require('fs');
const path = require('path');
const logger = require('./logger');

function initializeDatabase() {
  try {
    // Create cache directory if it doesn't exist
    const cacheDir = path.join(__dirname, '../cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
      logger.info('Created cache directory');
    }

    // Restrict directory to owner only (rwx------)
    try {
      fs.chmodSync(cacheDir, 0o700);
      logger.info('Set cache directory permissions to 700');
    } catch (e) {
      logger.warn('chmod cacheDir failed:', e.message);
    }

    // Create logs directory if it doesn't exist
    const logsDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
      logger.info('Created logs directory');
    }

    // Restrict logs directory permissions
    try {
      fs.chmodSync(logsDir, 0o750); // rwxr-x---
      logger.info('Set logs directory permissions to 750');
    } catch (e) {
      logger.warn('chmod logsDir failed:', e.message);
    }

    // Set permissions on SQLite database file if it exists
    const dbPath = path.join(cacheDir, 'kiron_cache.db');
    if (fs.existsSync(dbPath)) {
      try {
        fs.chmodSync(dbPath, 0o600); // rw-------
        logger.info('Set SQLite database file permissions to 600');
      } catch (e) {
        logger.warn('chmod database file failed:', e.message);
      }
    }

    logger.info('Database initialization completed');
  } catch (error) {
    logger.error('Database initialization failed:', { error: error.message });
    throw error;
  }
}

module.exports = { initializeDatabase };