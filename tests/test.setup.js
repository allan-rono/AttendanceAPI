const request = require('supertest');
const app = require('../app'); // Assuming your Express app is exported from app.js
const knex = require('knex');
const config = require('../knexfile');
const bcrypt = require('bcrypt');


// Use PostgreSQL for tests (matching production)
const testConfig = config.test;

let db;

// Setup test database
const setupTestDB = async () => {
  try {
    db = knex(testConfig);

    // Test database connection
    await db.raw('SELECT 1');
    console.log('✅ Test database connected');

    // Run migrations
    await db.migrate.latest();
    console.log('✅ Test migrations completed');

    // Seed test data
    await seedTestData();
    console.log('✅ Test data seeded');

    return db;
  } catch (error) {
    console.error('❌ Test database setup failed:', error.message);
    throw error;
  }
};

// Clean up test database
const teardownTestDB = async () => {
  if (db) {
    try {
      await db.destroy();
      console.log('✅ Test database connection closed');
    } catch (error) {
      console.error('❌ Test database teardown failed:', error.message);
    }
  }
};

// Clear all test data
const clearTestData = async () => {
  if (db) {
    try {
      // Clear tables in correct order (respecting foreign keys)
      await db('system_metrics').del();
      await db('sync_status').del();
      await db('attendance_queue').del();
      await db('attendance').del();
      await db('biometrics').del();
      await db('employees').del();
      await db('device_credentials').del();

      // Reset sequences for PostgreSQL
      if (db.client.config.client === 'pg') {
        await db.raw('ALTER SEQUENCE device_credentials_id_seq RESTART WITH 1');
        await db.raw('ALTER SEQUENCE employees_id_seq RESTART WITH 1');
        await db.raw('ALTER SEQUENCE biometrics_id_seq RESTART WITH 1');
        await db.raw('ALTER SEQUENCE attendance_id_seq RESTART WITH 1');
        await db.raw('ALTER SEQUENCE attendance_queue_id_seq RESTART WITH 1');
        await db.raw('ALTER SEQUENCE sync_status_id_seq RESTART WITH 1');
        await db.raw('ALTER SEQUENCE system_metrics_id_seq RESTART WITH 1');
      }

      console.log('✅ Test data cleared');
    } catch (error) {
      console.error('❌ Clear test data failed:', error.message);
      throw error;
    }
  }
};

// Seed test data
const seedTestData = async () => {
  try {
    // Clear existing data first
    await clearTestData();

    // Hash password for test devices
    const passwordHash = await bcrypt.hash('password123', 10);

    // Insert test device credentials
    await db('device_credentials').insert([
      {
        username: 'test_device_1',
        password_hash: passwordHash,
        device_type: 'ipad',
        device_model: 'iPad Pro 12.9',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        username: 'test_device_2',
        password_hash: passwordHash,
        device_type: 'android',
        device_model: 'Samsung Galaxy Tab S8',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        username: 'inactive_device',
        password_hash: passwordHash,
        device_type: 'ipad',
        device_model: 'iPad Air',
        is_active: false,
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);

    // Insert test employees
    await db('employees').insert([
      {
        employee_id: 'EMP001',
        first_name: 'John',
        last_name: 'Doe',
        middle_name: 'Michael',
        email: 'john.doe@kironccltd.co.ke',
        phone: '+254712345678',
        national_id: '12345678',
        department: 'Engineering',
        position: 'Senior Engineer',
        company: 'Kiron Construction Company Limited',
        site_id: 'SITE001',
        date_of_birth: '1990-01-15',
        date_of_joining: '2020-03-01',
        gender: 'Male',
        status: 'Active',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        employee_id: 'EMP002',
        first_name: 'Jane',
        last_name: 'Smith',
        middle_name: 'Elizabeth',
        email: 'jane.smith@kironccltd.co.ke',
        phone: '+254723456789',
        national_id: '23456789',
        department: 'Human Resources',
        position: 'HR Manager',
        company: 'Kiron Construction Company Limited',
        site_id: 'SITE001',
        date_of_birth: '1988-05-20',
        date_of_joining: '2019-07-15',
        gender: 'Female',
        status: 'Active',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        employee_id: 'EMP003',
        first_name: 'Robert',
        last_name: 'Johnson',
        middle_name: 'William',
        email: 'robert.johnson@kironccltd.co.ke',
        phone: '+254734567890',
        national_id: '34567890',
        department: 'Finance',
        position: 'Senior Accountant',
        company: 'Kiron Construction Company Limited',
        site_id: 'SITE002',
        date_of_birth: '1985-11-10',
        date_of_joining: '2018-01-20',
        gender: 'Male',
        status: 'Inactive',
        is_active: false,
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);

    // Insert biometric data
    await db('biometrics').insert([
      {
        employee_id: 'EMP001',
        template_hash: 'abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567',
        template_type: 'face',
        template_version: 1,
        device_id: 'test_device_1',
        registered_at: new Date(),
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        employee_id: 'EMP002',
        template_hash: 'def456ghi789jkl012mno345pqr678stu901vwx234yz567abc123',
        template_type: 'face',
        template_version: 1,
        device_id: 'test_device_1',
        registered_at: new Date(),
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);

    // Insert sync status records
    await db('sync_status').insert([
      {
        sync_type: 'attendance',
        last_sync: new Date(),
        records_synced: 0,
        records_failed: 0,
        is_running: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        sync_type: 'employees',
        last_sync: new Date(),
        records_synced: 3,
        records_failed: 0,
        is_running: false,
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);

  } catch (error) {
    console.error('❌ Seed test data failed:', error.message);
    throw error;
  }
};

// Token caching variables
let cachedToken = null;
let cachedRefreshToken = null;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

let tokenExpiry = null; // timestamp in ms when token expires

async function fetchToken() {
  // Your existing logic to request a new token from the auth endpoint
  // Example:
  const response = await fetch('http://localhost:3000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'testuser', password: 'testpass' }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch token: ${response.status}`);
  }

  const data = await response.json();
  if (!data.data || !data.data.access_token) {
    throw new Error('Token response missing access_token');
  }

  // Assume token expires in 24h (86400 seconds)
  tokenExpiry = Date.now() + 86400 * 1000 * 0.9; // 90% of expiry time to be safe
  return data.data.access_token;
}

async function getValidToken(retries = 5, delayMs = 1000) {
  // Return cached token if still valid
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  for (let i = 0; i < retries; i++) {
    try {
      const token = await fetchToken();
      cachedToken = token;
      return token;
    } catch (err) {
      if (i === retries - 1) throw err;
      // Exponential backoff delay
      const waitTime = delayMs * Math.pow(2, i);
      await new Promise(res => setTimeout(res, waitTime));
    }
  }
}

// Helper function to get refresh token
const getRefreshToken = async (app) => {
  if (cachedRefreshToken) return cachedRefreshToken;
  await getValidToken(app);
  return cachedRefreshToken;
};

// Helper function to create test employee
const createTestEmployee = async (employeeData = {}) => {
  const defaultEmployee = {
    employee_id: 'TEST_EMP_' + Date.now(),
    first_name: 'Test',
    last_name: 'Employee',
    email: `test.employee.${Date.now()}@kironccltd.co.ke`,
    phone: '+25470000',
    national_id: String(Date.now()).slice(-8),
    department: 'Testing',
    position: 'Test Engineer',
    company: 'Kiron Construction Company Limited',
    site_id: 'TEST_SITE',
    date_of_birth: '1990-01-01',
    date_of_joining: '2024-01-01',
    gender: 'Male',
    status: 'Active',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date()
  };

  const employee = { ...defaultEmployee, ...employeeData };

  await db('employees').insert(employee);
  return employee;
};

// Helper function to create test attendance record
const createTestAttendance = async (attendanceData = {}) => {
  const defaultAttendance = {
    employee_id: 'EMP001',
    timestamp: new Date(),
    status: 'clock-in',
    device_id: 'test_device_1',
    site_id: 'SITE001',
    record_hash: 'test_hash_' + Date.now(),
    synced: false,
    created_at: new Date(),
    updated_at: new Date()
  };

  const attendance = { ...defaultAttendance, ...attendanceData };

  const [id] = await db('attendance').insert(attendance).returning('id');
  return { ...attendance, id: id.id || id };
};

// Get database instance for direct queries in tests
const getDB = () => db;

module.exports = {
  setupTestDB,
  teardownTestDB,
  seedTestData,
  clearTestData,
  getValidToken,
  request,
  app,
  getRefreshToken,
  createTestEmployee,
  createTestAttendance,
  getDB
};