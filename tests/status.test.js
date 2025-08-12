
// tests/status.test.js - Comprehensive Status Tests
const request = require('supertest');
const app = require('../app');
const { setupTestDB, teardownTestDB, getValidToken, clearTestData, seedTestData } = require('./test.setup');

describe('System Status Endpoints', () => {
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

  describe('GET /api/v1/status', () => {
    it('should return basic system status', async () => {
      const response = await request(app)
        .get('/api/v1/status');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('service');
      expect(response.body.data).toHaveProperty('timestamp');
      expect(response.body.data.service).toBe('KBAI API');
    });
  });

  describe('GET /api/v1/status/detailed', () => {
    it('should return detailed system status', async () => {
      const response = await request(app)
        .get('/api/v1/status/detailed')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('service');
      expect(response.body.data).toHaveProperty('database');
      expect(response.body.data).toHaveProperty('erp_connection');
      expect(response.body.data).toHaveProperty('sync_service');
      expect(response.body.data).toHaveProperty('statistics');
    });

    it('should require authentication for detailed status', async () => {
      const response = await request(app)
        .get('/api/v1/status/detailed');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /health', () => {
    it('should return basic health check', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});
