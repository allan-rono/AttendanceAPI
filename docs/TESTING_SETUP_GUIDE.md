
# KBAI API Testing Setup Guide

## 🎯 Overview
This guide provides step-by-step instructions to set up and run comprehensive tests for the Kiron Biometric Attendance Integration (KBAI) API.

## 📋 Prerequisites

### System Requirements
- Node.js 16+ 
- PostgreSQL 12+
- npm or yarn package manager

### Database Setup
1. **Install PostgreSQL** (if not already installed)
2. **Create test user and databases**:

```bash
# Connect to PostgreSQL as superuser
sudo -u postgres psql

# Create test user
CREATE USER test_user WITH PASSWORD 'test_password';

# Create databases
CREATE DATABASE kbai_db OWNER postgres;
CREATE DATABASE kbai_db_test OWNER test_user;

# Grant permissions
GRANT ALL PRIVILEGES ON DATABASE kbai_db TO postgres;
GRANT ALL PRIVILEGES ON DATABASE kbai_db_test TO test_user;

# Exit PostgreSQL
\q
```

## 🛠️ Setup Instructions

### 1. Replace Migration Files
Replace your existing migration file with the complete schema:

```bash
# Backup existing migration
mv migrations/20240615_init.js migrations/20240615_init.js.backup

# Copy the new complete migration
cp complete_migration.js migrations/20240615_init.js
```

### 2. Update Test Configuration
Replace your test setup files:

```bash
# Update test setup
cp updated_test_setup.js tests/test.setup.js

# Update Jest configuration
cp updated_jest_config.js jest.config.js

# Add global test setup files
cp global_setup.js tests/global.setup.js
cp global_teardown.js tests/global.teardown.js
```

### 3. Update Test Files
Replace your existing test files:

```bash
# Update individual test files
cp comprehensive_employee_test.js tests/employees.test.js
cp comprehensive_attendance_test.js tests/attendance.test.js
cp comprehensive_biometrics_test.js tests/biometrics.test.js
cp comprehensive_sync_test.js tests/sync.test.js
cp comprehensive_status_test.js tests/status.test.js
cp comprehensive_integration_test.js tests/integration.test.js
```

### 4. Environment Configuration
Create a test environment file:

```bash
# Copy test environment configuration
cp updated_env_test.env .env.test
```

### 5. Database Setup Script
Make the database setup script executable and run it:

```bash
# Make executable
chmod +x setup_database.sh

# Run database setup
./setup_database.sh
```

### 6. Install Dependencies
Ensure all required dependencies are installed:

```bash
npm install
```

### 7. Add Missing Dependencies
If any dependencies are missing, install them:

```bash
# Add Joi for validation (if not present)
npm install joi

# Add bcrypt for password hashing (if not present)
npm install bcrypt

# Ensure all test dependencies are installed
npm install --save-dev jest supertest
```

## 🧪 Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test Categories
```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# With coverage report
npm run test:coverage
```

### Run Individual Test Files
```bash
# Authentication tests
npx jest tests/auth.test.js

# Employee tests
npx jest tests/employees.test.js

# Attendance tests
npx jest tests/attendance.test.js
```

## 🔧 Troubleshooting

### Common Issues and Solutions

#### 1. Database Connection Errors
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check connection
psql -h localhost -p 5432 -U test_user -d kbai_db_test
```

#### 2. Migration Errors
```bash
# Reset migrations
npx knex migrate:rollback --all
npx knex migrate:latest
```

#### 3. Permission Errors
```bash
# Grant all permissions to test user
sudo -u postgres psql -d kbai_db_test -c "
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO test_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO test_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO test_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO test_user;
"
```

#### 4. Test Timeout Issues
If tests are timing out, increase the timeout in jest.config.js:

```javascript
module.exports = {
  // ... other config
  testTimeout: 60000, // Increase to 60 seconds
};
```

#### 5. Port Conflicts
If port 3001 is in use, update the test environment:

```bash
# In .env.test
PORT=3002  # Change to available port
```

## 📊 Expected Test Results

After successful setup, you should see:

```
✅ Authentication Tests: 15 passing
✅ Employee Tests: 12 passing  
✅ Attendance Tests: 18 passing
✅ Biometrics Tests: 8 passing
✅ Sync Tests: 10 passing
✅ Status Tests: 6 passing
✅ Integration Tests: 8 passing

Total: 77 tests passing
Coverage: >80%
```

## 🔍 Database Schema Verification

Verify your database schema matches the expected structure:

```sql
-- Connect to test database
psql -h localhost -p 5432 -U test_user -d kbai_db_test

-- List all tables
\dt

-- Expected tables:
-- device_credentials
-- employees  
-- biometrics
-- attendance
-- attendance_queue
-- sync_status
-- system_metrics

-- Check table structure
\d device_credentials
\d employees
\d attendance
```

## 📝 Test Data

The test suite includes comprehensive seed data:
- 3 device credentials (2 active, 1 inactive)
- 3 test employees with different statuses
- 2 biometric templates
- Sample attendance records
- Sync status records

## 🚀 Next Steps

After successful test setup:

1. **Run the full test suite** to ensure everything works
2. **Check test coverage** to identify any gaps
3. **Add custom tests** for your specific business logic
4. **Set up CI/CD** to run tests automatically
5. **Monitor test performance** and optimize as needed

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Verify all prerequisites are met
3. Ensure database permissions are correct
4. Check the application logs for detailed error messages

The test suite is designed to be comprehensive and should catch most issues before they reach production.
