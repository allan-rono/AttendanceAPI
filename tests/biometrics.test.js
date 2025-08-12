
// tests/biometrics.test.js - Comprehensive Biometrics Tests
const request = require('supertest');
const app = require('../app');
const { setupTestDB, teardownTestDB, getValidToken, clearTestData, seedTestData } = require('./test.setup');

describe('Biometrics Management Endpoints', () => {
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

  describe('POST /api/v1/biometrics/register', () => {
    const validBiometricData = {
      employee_id: 'EMP001',
      template_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      registered_at: new Date().toISOString()
    };

    it('should register biometric template with valid data', async () => {
      const response = await request(app)
        .post('/api/v1/biometrics/register')
        .set('Authorization', `Bearer ${validToken}`)
        .send(validBiometricData);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('Biometric template metadata registered');
    });

    it('should fail with missing employee_id', async () => {
      const invalidData = {
        template_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
      };

      const response = await request(app)
        .post('/api/v1/biometrics/register')
        .set('Authorization', `Bearer ${validToken}`)
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.error_code).toBe('VALIDATION_ERROR');
    });

    it('should fail with missing template_hash', async () => {
      const invalidData = {
        employee_id: 'EMP001'
      };

      const response = await request(app)
        .post('/api/v1/biometrics/register')
        .set('Authorization', `Bearer ${validToken}`)
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.error_code).toBe('VALIDATION_ERROR');
    });

    it('should fail with invalid template_hash format', async () => {
      const invalidData = {
        employee_id: 'EMP001',
        template_hash: 'invalid_hash_format'
      };

      const response = await request(app)
        .post('/api/v1/biometrics/register')
        .set('Authorization', `Bearer ${validToken}`)
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.error_code).toBe('VALIDATION_ERROR');
    });

    it('should fail without authentication token', async () => {
      const response = await request(app)
        .post('/api/v1/biometrics/register')
        .send(validBiometricData);

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/v1/biometrics/verify', () => {
    const validVerificationData = {
      employee_id: 'EMP001',
      template_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
    };

    it('should log biometric verification event', async () => {
      const response = await request(app)
        .post('/api/v1/biometrics/verify')
        .set('Authorization', `Bearer ${validToken}`)
        .send(validVerificationData);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('verified');
      expect(response.body.message).toBe('Biometric verification event logged');
    });

    it('should fail with missing employee_id', async () => {
      const invalidData = {
        template_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
      };

      const response = await request(app)
        .post('/api/v1/biometrics/verify')
        .set('Authorization', `Bearer ${validToken}`)
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.error_code).toBe('VALIDATION_ERROR');
    });

    it('should fail with invalid template_hash', async () => {
      const invalidData = {
        employee_id: 'EMP001',
        template_hash: 'invalid_hash'
      };

      const response = await request(app)
        .post('/api/v1/biometrics/verify')
        .set('Authorization', `Bearer ${validToken}`)
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.error_code).toBe('VALIDATION_ERROR');
    });
  });
});
