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

  console.log('✅ Environment validation passed');
}

module.exports = { validateEnvironment };