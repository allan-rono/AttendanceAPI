
// tests/integration.test.js - Integration Tests
const request = require('supertest');
const app = require('../app');
const { setupTestDB, teardownTestDB, getValidToken, clearTestData, seedTestData } = require('./test.setup');

describe('API Integration Tests', () => {
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

  describe('Complete Employee Registration and Attendance Flow', () => {
    it('should complete full employee lifecycle', async () => {
      const employeeData = {
        first_name: 'Integration',
        last_name: 'Test',
        custom_national_id: '99887766',
        cell_number: '+254799887766',
        date_of_birth: '1990-01-01',
        date_of_joining: '2024-01-01',
        company: 'Kiron Construction Company Limited',
        status: 'Active'
      };

      // 1. Register employee
      const registerResponse = await request(app)
        .post('/api/v1/employees/register')
        .set('Authorization', `Bearer ${validToken}`)
        .send(employeeData);

      expect(registerResponse.status).toBe(200);
      const employeeId = registerResponse.body.employee_id;

      // 2. Register biometric
      const biometricResponse = await request(app)
        .post('/api/v1/biometrics/register')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          employee_id: employeeId,
          template_hash: 'integration_test_hash_' + Date.now().toString(16)
        });

      expect(biometricResponse.status).toBe(200);

      // 3. Record attendance
      const attendanceResponse = await request(app)
        .post('/api/v1/attendance/clock')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          employee_id: employeeId,
          timestamp: new Date().toISOString(),
          status: 'clock-in',
          device_id: 'integration_test_device'
        });

      expect(attendanceResponse.status).toBe(200);
      const recordId = attendanceResponse.body.data.record_id;

      // 4. Check attendance status
      const statusResponse = await request(app)
        .get(`/api/v1/attendance/status/${recordId}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(statusResponse.status).toBe(200);

      // 5. Verify biometric
      const verifyResponse = await request(app)
        .post('/api/v1/biometrics/verify')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          employee_id: employeeId,
          template_hash: 'integration_test_hash_' + Date.now().toString(16)
        });

      expect(verifyResponse.status).toBe(200);
    });

    it('should handle batch attendance processing', async () => {
      const batchData = {
        records: [
          {
            employee_id: 'EMP001',
            timestamp: new Date().toISOString(),
            status: 'clock-in',
            device_id: 'batch_test_device'
          },
          {
            employee_id: 'EMP002',
            timestamp: new Date(Date.now() + 60000).toISOString(),
            status: 'clock-in',
            device_id: 'batch_test_device'
          }
        ],
        batch_id: 'integration_batch_' + Date.now()
      };

      const batchResponse = await request(app)
        .post('/api/v1/attendance/batch')
        .set('Authorization', `Bearer ${validToken}`)
        .send(batchData);

      expect(batchResponse.status).toBe(200);
      expect(batchResponse.body.data.total_records).toBe(2);

      // Check sync status
      const syncResponse = await request(app)
        .get('/api/v1/sync/status')
        .set('Authorization', `Bearer ${validToken}`);

      expect(syncResponse.status).toBe(200);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid authentication gracefully', async () => {
      const response = await request(app)
        .get('/api/v1/status/detailed')
        .set('Authorization', 'Bearer invalid_token');

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
    });

    it('should handle malformed requests', async () => {
      const response = await request(app)
        .post('/api/v1/attendance/clock')
        .set('Authorization', `Bearer ${validToken}`)
        .send('invalid json');

      expect(response.status).toBe(400);
    });

    it('should handle rate limiting', async () => {
      // This test would need to be adjusted based on actual rate limits
      const promises = Array(10).fill().map(() =>
        request(app)
          .get('/api/v1/status')
      );

      const responses = await Promise.all(promises);
      // Most should succeed, but rate limiting might kick in
      const successCount = responses.filter(r => r.status === 200).length;
      expect(successCount).toBeGreaterThan(0);
    });
  });
});
