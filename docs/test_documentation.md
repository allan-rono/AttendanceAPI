
# KBAI API Test Suite Documentation

## Overview
This comprehensive test suite covers all aspects of the Kiron Timespring API, including unit tests, integration tests, and performance tests.

## Test Structure

### 1. Test Setup (`setup.js`)
- Database initialization and cleanup
- Test data seeding
- Helper functions for token generation
- Common test utilities

### 2. Unit Tests
- **auth.test.js**: Authentication endpoint tests
- **employees.test.js**: Employee management tests
- **attendance.test.js**: Attendance marking tests
- **biometrics.test.js**: Biometric enrollment/verification tests
- **status.test.js**: Health and status endpoint tests
- **sync.test.js**: ERPNext synchronization tests
- **devices.test.js**: Device management tests

### 3. Integration Tests (`integration.test.js`)
- End-to-end workflow testing
- Cross-service functionality
- Data consistency validation
- Error handling and recovery

### 4. Performance Tests (`performance.test.js`)
- Response time benchmarks
- Concurrent request handling
- Load testing
- Memory usage monitoring

## Running Tests

### Prerequisites
```bash
npm install
```

### Run All Tests
```bash
npm test
# or
node tests/run-tests.js all
```

### Run Specific Test Categories
```bash
# Unit tests only
node tests/run-tests.js unit

# Integration tests only
node tests/run-tests.js integration

# Performance tests only
node tests/run-tests.js performance
```

### Generate Coverage Report
```bash
node tests/run-tests.js report
```

## Test Coverage Goals

### Minimum Coverage Targets
- **Lines**: 70%
- **Functions**: 70%
- **Branches**: 70%
- **Statements**: 70%

### Critical Areas (100% Coverage Required)
- Authentication logic
- Attendance marking
- Biometric verification
- Data validation
- Error handling

## Test Data

### Test Database
- Uses SQLite in-memory database for tests
- Automatically seeded with test data
- Cleaned up after each test suite

### Test Credentials
- **Device Username**: `test_device_1`
- **Device Password**: `password123`
- **Test Employees**: EMP001, EMP002, EMP003

## Environment Variables for Testing

```env
NODE_ENV=test
JWT_SECRET=test_jwt_secret_key
DB_CLIENT=sqlite3
DB_CONNECTION=:memory:
```

## Test Scenarios Covered

### Authentication Tests
- ✅ Valid login credentials
- ✅ Invalid login credentials
- ✅ Token refresh
- ✅ Token verification
- ✅ Logout functionality
- ✅ Rate limiting
- ✅ Password validation

### Employee Management Tests
- ✅ Create employee
- ✅ Get employee list
- ✅ Get employee details
- ✅ Update employee
- ✅ Delete employee
- ✅ Search and filtering
- ✅ Pagination
- ✅ Data validation

### Attendance Tests
- ✅ Mark attendance (check-in/check-out)
- ✅ Get attendance records
- ✅ Date range filtering
- ✅ Location validation
- ✅ Duplicate attendance prevention
- ✅ Biometric verification integration

### Biometric Tests
- ✅ Enroll biometric data
- ✅ Verify biometric data
- ✅ Quality score validation
- ✅ Multiple biometric types
- ✅ Data encryption/security

### Sync Tests
- ✅ Start sync process
- ✅ Monitor sync status
- ✅ Stop sync process
- ✅ Sync logs retrieval
- ✅ ERPNext connectivity
- ✅ Error handling

### Device Management Tests
- ✅ Register device
- ✅ Update device settings
- ✅ Device authentication
- ✅ Device status monitoring
- ✅ Soft delete functionality

### Status and Health Tests
- ✅ API health checks
- ✅ Database connectivity
- ✅ Service status monitoring
- ✅ System metrics
- ✅ Uptime tracking

### Integration Tests
- ✅ Complete user workflows
- ✅ Cross-service data consistency
- ✅ Error propagation
- ✅ Transaction integrity
- ✅ Real-world scenarios

### Performance Tests
- ✅ Response time benchmarks
- ✅ Concurrent request handling
- ✅ Load testing
- ✅ Memory leak detection
- ✅ Database query optimization

## Continuous Integration

### GitHub Actions Workflow
```yaml
name: API Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '16'
      - run: npm install
      - run: npm test
      - run: npm run test:coverage
```

## Test Maintenance

### Adding New Tests
1. Create test file in appropriate category
2. Follow existing naming conventions
3. Include setup/teardown as needed
4. Update this documentation

### Test Data Management
- Keep test data minimal but comprehensive
- Use factories for complex object creation
- Clean up after each test
- Avoid test interdependencies

### Performance Benchmarks
- Update benchmarks when infrastructure changes
- Monitor for performance regressions
- Set realistic expectations based on environment

## Troubleshooting

### Common Issues
1. **Database connection errors**: Check test database setup
2. **Token expiry**: Ensure test tokens are fresh
3. **Port conflicts**: Use different ports for testing
4. **Memory issues**: Increase Node.js memory limit

### Debug Mode
```bash
DEBUG=* npm test
```

### Verbose Output
```bash
npm test -- --verbose
```

## Best Practices

### Test Writing
- Write descriptive test names
- Test both success and failure cases
- Use appropriate assertions
- Keep tests independent
- Mock external dependencies

### Test Organization
- Group related tests in describe blocks
- Use beforeEach/afterEach for setup/cleanup
- Share common utilities
- Maintain test data consistency

### Performance Considerations
- Set reasonable timeouts
- Clean up resources
- Monitor test execution time
- Optimize slow tests

## Reporting Issues

When reporting test failures:
1. Include full error message
2. Specify test environment
3. Provide reproduction steps
4. Include relevant logs
5. Check for known issues first
