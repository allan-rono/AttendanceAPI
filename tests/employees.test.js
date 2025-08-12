const request = require('supertest');
const app = require('../app');
const { setupTestDB, teardownTestDB, getValidToken, clearTestData, seedTestData, getDB } = require('./test.setup');

describe('Employee Management Endpoints', () => {
  let db;
  let validToken;

  beforeAll(async () => {
    db = await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  beforeEach(async () => {
    await clearTestData();
    await seedTestData();
    validToken = await getValidToken(app);
  });

  describe('GET /api/v1/employees/check-id', () => {
    it('should check if national ID exists', async () => {
      const response = await request(app)
        .get('/api/v1/employees/check-id?id=12345678')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('exists');
      expect(typeof response.body.exists).toBe('boolean');
    });

    it('should return validation error for invalid national ID', async () => {
      const response = await request(app)
        .get('/api/v1/employees/check-id?id=123')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.error_type || response.body.error_code).toBe('VALIDATION_ERROR');
      if (process.env.NODE_ENV === 'development') {
        expect(Array.isArray(response.body.details)).toBe(true);
      }
    });

    it('should return validation error for missing national ID', async () => {
      const response = await request(app)
        .get('/api/v1/employees/check-id')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.error_type || response.body.error_code).toBe('VALIDATION_ERROR');
      if (process.env.NODE_ENV === 'development') {
        expect(Array.isArray(response.body.details)).toBe(true);
      }
    });
  });

  describe('POST /api/v1/employees/register', () => {
    const validEmployeeData = {
      first_name: 'Alice',
      last_name: 'Johnson',
      middle_name: 'Marie',
      custom_national_id: '87654321',
      gender: 'Female',
      cell_number: '+254756789012',
      personal_email: 'alice.johnson@example.com',
      date_of_birth: '1992-03-15',
      date_of_joining: '2024-01-15',
      company: 'Kiron Construction Company Limited',
      custom_site: 'SITE004',
      status: 'Active'
    };

    it('should register a new employee with valid data', async () => {
      const response = await request(app)
        .post('/api/v1/employees/register')
        .set('Authorization', `Bearer ${validToken}`)
        .send(validEmployeeData);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body).toHaveProperty('employee_id');
      expect(response.body).toHaveProperty('employee_name');
      expect(response.body.message).toBe('Employee registered successfully');
    });

    it('should fail with duplicate national ID', async () => {
      // First registration
      await request(app)
        .post('/api/v1/employees/register')
        .set('Authorization', `Bearer ${validToken}`)
        .send(validEmployeeData);

      // Second registration with same national ID
      const response = await request(app)
        .post('/api/v1/employees/register')
        .set('Authorization', `Bearer ${validToken}`)
        .send(validEmployeeData);

      expect(response.status).toBe(409);
      expect(response.body.status).toBe('error');
      expect(response.body.error_type || response.body.error_code).toBe('DUPLICATE_ID');
    });

    it('should fail with missing required fields', async () => {
      const incompleteData = {
        first_name: 'John'
        // Missing required fields
      };

      const response = await request(app)
        .post('/api/v1/employees/register')
        .set('Authorization', `Bearer ${validToken}`)
        .send(incompleteData);

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.error_type || response.body.error_code).toBe('VALIDATION_ERROR');
      if (process.env.NODE_ENV === 'development') {
        expect(Array.isArray(response.body.details)).toBe(true);
      }
    });

    it('should fail with invalid phone number format', async () => {
      const invalidData = {
        ...validEmployeeData,
        cell_number: '123456789' // Invalid Kenyan phone format
      };

      const response = await request(app)
        .post('/api/v1/employees/register')
        .set('Authorization', `Bearer ${validToken}`)
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.error_type || response.body.error_code).toBe('VALIDATION_ERROR');
      if (process.env.NODE_ENV === 'development') {
        expect(Array.isArray(response.body.details)).toBe(true);
      }
    });

    it('should fail with invalid national ID format', async () => {
      const invalidData = {
        ...validEmployeeData,
        custom_national_id: '123' // Too short
      };

      const response = await request(app)
        .post('/api/v1/employees/register')
        .set('Authorization', `Bearer ${validToken}`)
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.error_type || response.body.error_code).toBe('VALIDATION_ERROR');
      if (process.env.NODE_ENV === 'development') {
        expect(Array.isArray(response.body.details)).toBe(true);
      }
    });

    it('should fail with invalid email format', async () => {
      const invalidData = {
        ...validEmployeeData,
        personal_email: 'invalid-email'
      };

      const response = await request(app)
        .post('/api/v1/employees/register')
        .set('Authorization', `Bearer ${validToken}`)
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.error_type || response.body.error_code).toBe('VALIDATION_ERROR');
      if (process.env.NODE_ENV === 'development') {
        expect(Array.isArray(response.body.details)).toBe(true);
      }
    });

    it('should fail with invalid status', async () => {
      const invalidData = {
        ...validEmployeeData,
        status: 'InvalidStatus'
      };

      const response = await request(app)
        .post('/api/v1/employees/register')
        .set('Authorization', `Bearer ${validToken}`)
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.error_type || response.body.error_code).toBe('VALIDATION_ERROR');
      if (process.env.NODE_ENV === 'development') {
        expect(Array.isArray(response.body.details)).toBe(true);
      }
    });

    it('should fail without authentication token', async () => {
      const response = await request(app)
        .post('/api/v1/employees/register')
        .send(validEmployeeData);

      expect(response.status).toBe(401);
    });
  });
});