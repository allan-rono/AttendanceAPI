
// tests/global.teardown.js - Global Test Teardown
const { teardownTestDB } = require('./test.setup');

module.exports = async () => {
  console.log('🧹 Cleaning up test environment...');

  try {
    await teardownTestDB();
    console.log('✅ Global test teardown completed');
  } catch (error) {
    console.error('❌ Global test teardown failed:', error);
  }
};
