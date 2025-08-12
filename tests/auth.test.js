
// tests/auth.test.js
const request = require('supertest');
const app = require('../app');
const { setupTestDB, teardownTestDB, getValidToken } = require('./test.setup');

const { clearTestData } = require('./test.setup');


describe('Authentication Endpoints', () => {
  let db;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    db = await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'test_device_1',
          password: 'password123',
          device_type: 'ipad'
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('access_token');
      expect(response.body.data).toHaveProperty('refresh_token');
      expect(response.body.data).toHaveProperty('api_key');
      expect(response.body.data.token_type).toBe('Bearer');
      expect(response.body.data.expires_in).toBe(86400);
    });

    it('should fail with invalid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'invalid_user',
          password: 'wrong_password'
        });

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
      expect(response.body.error_code).toBe('INVALID_CREDENTIALS');
    });

    it('should fail with missing username', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          password: 'password123'
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.error_code).toBe('VALIDATION_ERROR');
    });

    it('should fail with missing password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'test_device_1'
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.error_code).toBe('VALIDATION_ERROR');
    });

    it('should fail with short password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'test_device_1',
          password: '123'
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.error_code).toBe('VALIDATION_ERROR');
    });

    it('should fail with invalid device type', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'test_device_1',
          password: 'password123',
          device_type: 'invalid_type'
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.error_code).toBe('VALIDATION_ERROR');
    });

    it('should handle rate limiting', async () => {
      // Make multiple rapid requests to trigger rate limiting
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app)
            .post('/api/v1/auth/login')
            .send({
              username: 'invalid_user',
              password: 'wrong_password'
            })
        );
      }

      const responses = await Promise.all(promises);
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    let refreshToken;

    beforeEach(async () => {
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'test_device_1',
          password: 'password123'
        });
      refreshToken = loginResponse.body.data.refresh_token;
    });

    it('should refresh token with valid refresh token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({
          refresh_token: refreshToken
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('access_token');
      expect(response.body.data.token_type).toBe('Bearer');
      expect(response.body.data.expires_in).toBe(86400);
    });

    it('should fail with invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({
          refresh_token: 'invalid_token'
        });

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
      expect(response.body.error_code).toBe('INVALID_TOKEN');
    });

    it('should fail with missing refresh token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.error_code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should logout successfully with valid token', async () => {
      const token = await getValidToken(app);

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('Logged out successfully');
    });

    it('should logout successfully even with invalid token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', 'Bearer invalid_token');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    it('should logout successfully without token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });
  });

  describe('GET /api/v1/auth/verify', () => {
    it('should verify valid token', async () => {
      const token = await getValidToken(app);

      const response = await request(app)
        .get('/api/v1/auth/verify')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('device_id');
      expect(response.body.data).toHaveProperty('device_type');
      expect(response.body.data).toHaveProperty('username');
      expect(response.body.data).toHaveProperty('permissions');
      expect(response.body.data).toHaveProperty('expires_at');
    });

    it('should fail with invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/verify')
        .set('Authorization', 'Bearer invalid_token');

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
      expect(response.body.error_code).toBe('INVALID_TOKEN');
    });

    it('should fail with missing token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/verify');

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
      expect(response.body.error_code).toBe('NO_TOKEN');
    });
  });
});
