const logger = require('./logger');

const requiredEnvVars = [
  'ERP_BASE_URL',
  'ERP_API_KEY',
  'ERP_API_SECRET',
  'JWT_SECRET',
  'API_KEY',
  'DB_PASSWORD',
  'DB_USER'
];

const optionalEnvVars = [
  'PORT',
  'NODE_ENV',
  'COMPANY_NAME',
  'COMPANY_CODE',
  'SYNC_INTERVAL_MINUTES',
  'CORS_ORIGIN',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_POOL_MIN',
  'DB_POOL_MAX'
];

function validateEnvironment() {
  const missing = [];
  const warnings = [];

  // Check required variables
  requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
    missing.push(varName);
    }
  });

  // Check optional but recommended variables
  optionalEnvVars.forEach(varName => {
    if (!process.env[varName]) {
    warnings.push(varName);
    }
  });

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(varName => console.error(`   - ${varName}`));
    console.error('\nPlease set these variables in your .env file');
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn('⚠️  Optional environment variables not set (using defaults):');
    warnings.forEach(varName => console.warn(`   - ${varName}`));
  }

  // Validate specific formats
  if (process.env.ERP_BASE_URL && !process.env.ERP_BASE_URL.startsWith('http')) {
    console.error('❌ ERP_BASE_URL must start with http:// or https://');
    process.exit(1);
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.error('❌ JWT_SECRET must be at least 32 characters long');
    process.exit(1);
  }

  // START_SCHEDULER gating and SELF_BASE_URL compatibility
  const startScheduler = String(process.env.START_SCHEDULER || 'false').toLowerCase() === 'true';
  if (startScheduler) {
    const port = process.env.PORT || '3000';
    if (!process.env.SELF_BASE_URL) {
      process.env.SELF_BASE_URL = `http://127.0.0.1:${port}`;
      console.warn(`⚠️  SELF_BASE_URL not set. Defaulting to ${process.env.SELF_BASE_URL} for scheduler callbacks.`);
    }
    if (!/^https?:\/\//i.test(process.env.SELF_BASE_URL)) {
      console.error('❌ SELF_BASE_URL must start with http:// or https://');
      process.exit(1);
    }
  }

  // ENABLE_MOCK must be false in production
  const enableMock = String(process.env.ENABLE_MOCK || 'false').toLowerCase() === 'true';
  if ((process.env.NODE_ENV || 'development') === 'production' && enableMock) {
    console.error('❌ ENABLE_MOCK must be false in production');
    process.exit(1);
  }

  // Normalize and default rate limiting envs
  if (!process.env.RATE_LIMIT_WINDOW_MS) process.env.RATE_LIMIT_WINDOW_MS = '300000';
  if (!process.env.RATE_LIMIT_MAX) process.env.RATE_LIMIT_MAX = '300';

  // Set SYNC_CONCURRENCY default
  if (!process.env.SYNC_CONCURRENCY) process.env.SYNC_CONCURRENCY = '5';

  // Warn if CORS_ORIGIN is not set (permissive in dev, but should be explicit)
  if (!process.env.CORS_ORIGIN) {
    const nodeEnv = process.env.NODE_ENV || 'development';
    if (nodeEnv === 'production') {
      console.warn('⚠️  CORS_ORIGIN not set in production - this allows all origins (security risk)');
    } else {
      console.warn('⚠️  CORS_ORIGIN not set - defaulting to permissive mode (*) in development');
    }
  }

  // Blue/Green ERP key rotation support
  const keyVersion = (process.env.ERP_KEY_VERSION || 'primary').toLowerCase();
  if (keyVersion === 'secondary') {
    if (process.env.ERP_API_KEY_SECONDARY && process.env.ERP_API_SECRET_SECONDARY) {
      process.env.ERP_API_KEY = process.env.ERP_API_KEY_SECONDARY;
      process.env.ERP_API_SECRET = process.env.ERP_API_SECRET_SECONDARY;
      console.warn('⚠️  Using secondary ERP API credentials due to ERP_KEY_VERSION=secondary');
    } else {
      console.warn('⚠️  ERP_KEY_VERSION=secondary set but secondary keys missing; falling back to primary');
    }
  }

  console.log('✅ Environment validation passed');
}

module.exports = { validateEnvironment };