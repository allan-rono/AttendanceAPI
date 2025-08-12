
// seeds/001_test_data.js - Test Data Seed
const bcrypt = require('bcrypt');

exports.seed = async function(knex) {
  // Clear existing data
  await knex('system_metrics').del();
  await knex('sync_status').del();
  await knex('attendance_queue').del();
  await knex('attendance').del();
  await knex('biometrics').del();
  await knex('employees').del();
  await knex('device_credentials').del();

  // Reset sequences (PostgreSQL)
  if (knex.client.config.client === 'pg') {
    await knex.raw('ALTER SEQUENCE device_credentials_id_seq RESTART WITH 1');
    await knex.raw('ALTER SEQUENCE employees_id_seq RESTART WITH 1');
    await knex.raw('ALTER SEQUENCE biometrics_id_seq RESTART WITH 1');
    await knex.raw('ALTER SEQUENCE attendance_id_seq RESTART WITH 1');
    await knex.raw('ALTER SEQUENCE attendance_queue_id_seq RESTART WITH 1');
    await knex.raw('ALTER SEQUENCE sync_status_id_seq RESTART WITH 1');
    await knex.raw('ALTER SEQUENCE system_metrics_id_seq RESTART WITH 1');
  }

  // Hash password for test devices
  const passwordHash = await bcrypt.hash('password123', 10);

  // Insert device credentials
  await knex('device_credentials').insert([
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
  await knex('employees').insert([
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
    },
    {
      employee_id: 'EMP004',
      first_name: 'Mary',
      last_name: 'Wanjiku',
      middle_name: 'Grace',
      email: 'mary.wanjiku@kironccltd.co.ke',
      phone: '+254745678901',
      national_id: '45678901',
      department: 'Operations',
      position: 'Site Supervisor',
      company: 'Kiron Construction Company Limited',
      site_id: 'SITE003',
      date_of_birth: '1992-08-25',
      date_of_joining: '2021-06-01',
      gender: 'Female',
      status: 'Active',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    }
  ]);

  // Insert biometric data
  await knex('biometrics').insert([
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

  // Insert sample attendance records
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  await knex('attendance').insert([
    {
      employee_id: 'EMP001',
      timestamp: yesterday,
      status: 'clock-in',
      device_id: 'test_device_1',
      site_id: 'SITE001',
      latitude: -1.2921,
      longitude: 36.8219,
      record_hash: 'hash_emp001_clockin_' + yesterday.getTime(),
      synced: true,
      synced_at: yesterday,
      created_at: yesterday,
      updated_at: yesterday
    },
    {
      employee_id: 'EMP001',
      timestamp: new Date(yesterday.getTime() + 8 * 60 * 60 * 1000),
      status: 'clock-out',
      device_id: 'test_device_1',
      site_id: 'SITE001',
      latitude: -1.2921,
      longitude: 36.8219,
      record_hash: 'hash_emp001_clockout_' + (yesterday.getTime() + 8 * 60 * 60 * 1000),
      synced: true,
      synced_at: yesterday,
      created_at: yesterday,
      updated_at: yesterday
    }
  ]);

  // Insert sync status records
  await knex('sync_status').insert([
    {
      sync_type: 'attendance',
      last_sync: new Date(),
      records_synced: 2,
      records_failed: 0,
      is_running: false,
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      sync_type: 'employees',
      last_sync: new Date(),
      records_synced: 4,
      records_failed: 0,
      is_running: false,
      created_at: new Date(),
      updated_at: new Date()
    }
  ]);

  console.log('✅ Test data seeded successfully');
};
