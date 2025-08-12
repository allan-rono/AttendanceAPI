
// tests/global.setup.js - Global Test Setup
const { setupTestDB } = require('./test.setup');

module.exports = async () => {
  console.log('🚀 Setting up test environment...');

  // Set test environment
  process.env.NODE_ENV = 'test';

  // Setup test database
  try {
    await setupTestDB();
    console.log('✅ Global test setup completed');
  } catch (error) {
    console.error('❌ Global test setup failed:', error);
    process.exit(1);
  }
};
