
// tests/run-tests.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting KBAI API Test Suite');
console.log('================================');

// Set test environment
process.env.NODE_ENV = 'test';

// Test categories
const testCategories = {
  unit: [
    'auth.test.js',
    'employees.test.js',
    'attendance.test.js',
    'biometrics.test.js',
    'status.test.js',
    'sync.test.js',
    'devices.test.js'
  ],
  integration: [
    'integration.test.js'
  ],
  performance: [
    'performance.test.js'
  ]
};

// Function to run specific test category
function runTestCategory(category, tests) {
  console.log(`\n📋 Running ${category.toUpperCase()} Tests`);
  console.log('-'.repeat(40));

  tests.forEach(testFile => {
    try {
      console.log(`\n🧪 Running ${testFile}...`);
      execSync(`npx jest tests/${testFile} --verbose`, { 
        stdio: 'inherit',
        cwd: path.join(__dirname, '..')
      });
      console.log(`✅ ${testFile} passed`);
    } catch (error) {
      console.log(`❌ ${testFile} failed`);
      console.error(error.message);
    }
  });
}

// Function to run all tests
function runAllTests() {
  console.log('\n🔄 Running All Tests...');

  try {
    execSync('npx jest --coverage', { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    console.log('\n✅ All tests completed successfully!');
  } catch (error) {
    console.log('\n❌ Some tests failed');
    console.error(error.message);
    process.exit(1);
  }
}

// Function to generate test report
function generateTestReport() {
  console.log('\n📊 Generating Test Report...');

  try {
    execSync('npx jest --coverage --coverageReporters=html --coverageReporters=text', { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });

    console.log('\n📈 Test report generated in coverage/ directory');
    console.log('Open coverage/lcov-report/index.html to view detailed coverage report');
  } catch (error) {
    console.error('Failed to generate test report:', error.message);
  }
}

// Main execution
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'unit':
    runTestCategory('unit', testCategories.unit);
    break;
  case 'integration':
    runTestCategory('integration', testCategories.integration);
    break;
  case 'performance':
    runTestCategory('performance', testCategories.performance);
    break;
  case 'report':
    generateTestReport();
    break;
  case 'all':
  default:
    runAllTests();
    break;
}

console.log('\n🎉 Test execution completed!');
