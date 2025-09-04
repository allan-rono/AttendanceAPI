// config/index.js
const config = {
  app: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
    apiVersion: process.env.API_VERSION || 'v1'
  },
  database: {
    host: process.env.DB_HOST || 'https://5cb5e1cac-80.preview.abacusai.app',
    port: parseInt(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    name: process.env.DB_NAME || 'kbai_db',
    ssl: process.env.DB_SSL === 'true'
  },
  security: {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    apiKey: process.env.API_KEY,
    encryptionKey: process.env.ENCRYPTION_MASTER_KEY
  },
  erpnext: {
    baseUrl: process.env.ERP_BASE_URL,
    apiKey: process.env.ERP_API_KEY,
    apiSecret: process.env.ERP_API_SECRET,
    timeout: parseInt(process.env.ERP_TIMEOUT) || 30000
  }
};

// Validation
const requiredEnvVars = [
  'JWT_SECRET', 'API_KEY', 'ENCRYPTION_MASTER_KEY',
  'DB_PASSWORD', 'ERP_BASE_URL', 'ERP_API_KEY', 'ERP_API_SECRET'
];

requiredEnvVars.forEach(envVar => {
  if (!process.env[envVar]) {
    throw new Error(`Required environment variable ${envVar} is not set`);
  }
});

module.exports = config;