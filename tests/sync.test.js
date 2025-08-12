
// tests/sync.test.js - Comprehensive Sync Tests
const request = require('supertest');
const app = require('../app');
const { setupTestDB, teardownTestDB, getValidToken, clearTestData, seedTestData, createTestAttendance } = require('./test.setup');

describe('Sync Management Endpoints', () => {
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

  describe('GET /api/v1/sync/status', () => {
    it('should get sync service status', async () => {
      const response = await request(app)
        .get('/api/v1/sync/status')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('service');
      expect(response.body.data).toHaveProperty('statistics');
      expect(response.body.data).toHaveProperty('erp_connection');
    });
  });

  describe('POST /api/v1/sync/trigger', () => {
    it('should manually trigger sync process', async () => {
      const response = await request(app)
        .post('/api/v1/sync/trigger')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.message).toContain('sync');
    });
  });

  describe('GET /api/v1/sync/pending', () => {
    it('should get pending sync records', async () => {
      // Create a pending attendance record
      await createTestAttendance({
        employee_id: 'EMP001',
        status: 'clock-in',
        synced: false
      });

      const response = await request(app)
        .get('/api/v1/sync/pending')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('records');
      expect(Array.isArray(response.body.data.records)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/v1/sync/pending?page=1&limit=10')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });
  });

  describe('POST /api/v1/sync/retry-failed', () => {
    it('should retry failed sync records', async () => {
      const response = await request(app)
        .post('/api/v1/sync/retry-failed')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });
  });

  describe('POST /api/v1/sync/cleanup', () => {
    it('should cleanup old synced records', async () => {
      const response = await request(app)
        .post('/api/v1/sync/cleanup')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          older_than_days: 30
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });
  });

  describe('PUT /api/v1/sync/config', () => {
    it('should update sync configuration', async () => {
      const newConfig = {
        sync_interval: 60000,
        batch_size: 15,
        max_retries: 4
      };

      const response = await request(app)
        .put('/api/v1/sync/config')
        .set('Authorization', `Bearer ${validToken}`)
        .send(newConfig);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    it('should fail with invalid configuration', async () => {
      const invalidConfig = {
        sync_interval: -1000, // Invalid negative value
        batch_size: 0 // Invalid zero value
      };

      const response = await request(app)
        .put('/api/v1/sync/config')
        .set('Authorization', `Bearer ${validToken}`)
        .send(invalidConfig);

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
    });
  });
});
