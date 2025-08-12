const knex = require('knex');
const logger = require('./logger');

const config = {
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'kbai_user',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'kbai_db',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  },
  pool: {
    min: parseInt(process.env.DB_POOL_MIN) || 2,
    max: parseInt(process.env.DB_POOL_MAX) || 10,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 100,
  },
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations'
  },
  seeds: {
    directory: './seeds'
  }
};

const db = knex(config);

// Test connection on startup
db.raw('SELECT 1')
  .then(() => logger.info('PostgreSQL connected successfully'))
  .catch(err => {
    logger.error('PostgreSQL connection failed:', err.message);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', () => {
  db.destroy(() => {
    logger.info('PostgreSQL connection closed');
    process.exit(0);
  });
});

module.exports = db;