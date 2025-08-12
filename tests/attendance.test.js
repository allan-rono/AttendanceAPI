const request = require('supertest');
const app = require('../app');
const { setupTestDB, teardownTestDB, getValidToken, clearTestData, seedTestData, getDB } = require('./test.setup');

describe('Attendance Management Endpoints', () => {
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

  describe('POST /api/v1/attendance/clock', () => {
    const validAttendanceData = {
      employee_id: 'EMP001',
      timestamp: new Date().toISOString(),
      status: 'clock-in',
      device_id: 'test_device_1',
      site_id: 'SITE001',
      latitude: -1.2921,
      longitude: 36.8219
    };

    it('should record attendance with valid data', async () => {
      const response = await request(app)
        .post('/api/v1/attendance/clock')
        .set('Authorization', `Bearer ${validToken}`)
        .send(validAttendanceData);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('record_id');
      expect(response.body.data).toHaveProperty('synced');
    });

    it('should handle duplicate records (idempotency)', async () => {
      const attendanceWithRecordId = {
        ...validAttendanceData,
        record_id: 'unique_test_record_123'
      };

      // First request
      const response1 = await request(app)
        .post('/api/v1/attendance/clock')
        .set('Authorization', `Bearer ${validToken}`)
        .send(attendanceWithRecordId);

      expect(response1.status).toBe(200);

      // Second request with same record_id
      const response2 = await request(app)
        .post('/api/v1/attendance/clock')
        .set('Authorization', `Bearer ${validToken}`)
        .send(attendanceWithRecordId);

      expect(response2.status).toBe(200);
      expect(response2.body.data.duplicate).toBe(true);
    });

    it('should fail with missing required fields', async () => {
      const incompleteData = {
        employee_id: 'EMP001'
        // Missing timestamp and status
      };

      const response = await request(app)
        .post('/api/v1/attendance/clock')
        .set('Authorization', `Bearer ${validToken}`)
        .send(incompleteData);

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.error_type || response.body.error_code).toBe('VALIDATION_ERROR');
      if (process.env.NODE_ENV === 'development') {
        expect(Array.isArray(response.body.details)).toBe(true);
      }
    });

    it('should fail with invalid status', async () => {
      const invalidData = {
        ...validAttendanceData,
        status: 'invalid-status'
      };

      const response = await request(app)
        .post('/api/v1/attendance/clock')
        .set('Authorization', `Bearer ${validToken}`)
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.error_type || response.body.error_code).toBe('VALIDATION_ERROR');
      if (process.env.NODE_ENV === 'development') {
        expect(Array.isArray(response.body.details)).toBe(true);
      }
    });

    it('should fail with invalid timestamp', async () => {
      const invalidData = {
        ...validAttendanceData,
        timestamp: 'invalid-timestamp'
      };

      const response = await request(app)
        .post('/api/v1/attendance/clock')
        .set('Authorization', `Bearer ${validToken}`)
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.error_type || response.body.error_code).toBe('VALIDATION_ERROR');
      if (process.env.NODE_ENV === 'development') {
        expect(Array.isArray(response.body.details)).toBe(true);
      }
    });

    it('should fail with invalid coordinates', async () => {
      const invalidData = {
        ...validAttendanceData,
        latitude: 200, // Invalid latitude
        longitude: 200 // Invalid longitude
      };

      const response = await request(app)
        .post('/api/v1/attendance/clock')
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
        .post('/api/v1/attendance/clock')
        .send(validAttendanceData);

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/v1/attendance/batch', () => {
    const validBatchData = {
      records: [
        {
          employee_id: 'EMP001',
          timestamp: new Date().toISOString(),
          status: 'clock-in',
          device_id: 'test_device_1',
          site_id: 'SITE001'
        },
        {
          employee_id: 'EMP002',
          timestamp: new Date(Date.now() + 60000).toISOString(),
          status: 'clock-in',
          device_id: 'test_device_1',
          site_id: 'SITE001'
        }
      ],
      batch_id: 'test_batch_' + Date.now(),
      offline_sync: false
    };

    it('should process batch attendance records', async () => {
      const response = await request(app)
        .post('/api/v1/attendance/batch')
        .set('Authorization', `Bearer ${validToken}`)
        .send(validBatchData);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('batch_id');
      expect(response.body.data).toHaveProperty('total_records');
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data).toHaveProperty('results');
      expect(response.body.data.total_records).toBe(2);
    });

    it('should fail with empty records array', async () => {
      const invalidData = {
        records: [],
        batch_id: 'empty_batch'
      };

      const response = await request(app)
        .post('/api/v1/attendance/batch')
        .set('Authorization', `Bearer ${validToken}`)
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.error_type || response.body.error_code).toBe('VALIDATION_ERROR');
      if (process.env.NODE_ENV === 'development') {
        expect(Array.isArray(response.body.details)).toBe(true);
      }
    });

    it('should fail with too many records', async () => {
      const tooManyRecords = Array(201).fill().map((_, i) => ({
        employee_id: 'EMP001',
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
        status: 'clock-in',
        device_id: 'test_device_1'
      }));

      const invalidData = {
        records: tooManyRecords,
        batch_id: 'large_batch'
      };

      const response = await request(app)
        .post('/api/v1/attendance/batch')
        .set('Authorization', `Bearer ${validToken}`)
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.error_type || response.body.error_code).toBe('VALIDATION_ERROR');
      if (process.env.NODE_ENV === 'development') {
        expect(Array.isArray(response.body.details)).toBe(true);
      }
    });

    it('should handle offline sync mode', async () => {
      const offlineData = {
        ...validBatchData,
        offline_sync: true
      };

      const response = await request(app)
        .post('/api/v1/attendance/batch')
        .set('Authorization', `Bearer ${validToken}`)
        .send(offlineData);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.summary.queued).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/attendance/status/:record_id', () => {
    it('should get record status for existing record', async () => {
      // First create a record
      const attendanceData = {
        employee_id: 'EMP001',
        timestamp: new Date().toISOString(),
        status: 'clock-in',
        device_id: 'test_device_1',
        record_id: 'status_test_record'
      };

      const createResponse = await request(app)
        .post('/api/v1/attendance/clock')
        .set('Authorization', `Bearer ${validToken}`)
        .send(attendanceData);

      const recordId = createResponse.body.data.record_id;

      // Then check its status
      const response = await request(app)
        .get(`/api/v1/attendance/status/${recordId}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('record_id');
    });

    it('should return 404 for non-existent record', async () => {
      const response = await request(app)
        .get('/api/v1/attendance/status/non_existent_record')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(404);
      expect(response.body.status).toBe('error');
      expect(response.body.error_type || response.body.error_code).toBe('RECORD_NOT_FOUND');
    });
  });

  describe('GET /api/v1/attendance/pending', () => {
    it('should get pending attendance records', async () => {
      const response = await request(app)
        .get('/api/v1/attendance/pending')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('count');
      expect(response.body.data).toHaveProperty('records');
      expect(Array.isArray(response.body.data.records)).toBe(true);
    });
  });
});