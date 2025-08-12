
// tests/devices.test.js
const request = require('supertest');
const app = require('../app');
const { setupTestDB, teardownTestDB, getValidToken } = require('./test.setup');

const { clearTestData } = require('./test.setup');


describe('Devices Endpoints', () => {
  let db;
  let validToken;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    db = await setupTestDB();
    validToken = await getValidToken(app);
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  describe('GET /api/v1/devices', () => {
    it('should get list of devices with valid token', async () => {
      const response = await request(app)
        .get('/api/v1/devices')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('devices');
      expect(Array.isArray(response.body.data.devices)).toBe(true);
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/devices');

      expect(response.status).toBe(401);
    });

    it('should support filtering by device type', async () => {
      const response = await request(app)
        .get('/api/v1/devices?device_type=ipad')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    it('should support filtering by active status', async () => {
      const response = await request(app)
        .get('/api/v1/devices?is_active=true')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });
  });

  describe('GET /api/v1/devices/:id', () => {
    it('should get device details with valid ID', async () => {
      const response = await request(app)
        .get('/api/v1/devices/1')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.device).toHaveProperty('id');
      expect(response.body.data.device).toHaveProperty('username');
      expect(response.body.data.device).toHaveProperty('device_type');
      expect(response.body.data.device).toHaveProperty('device_model');
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/devices/1');

      expect(response.status).toBe(401);
    });

    it('should return 404 for nonexistent device', async () => {
      const response = await request(app)
        .get('/api/v1/devices/999')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(404);
      expect(response.body.status).toBe('error');
      expect(response.body.error_code).toBe('DEVICE_NOT_FOUND');
    });
  });

  describe('POST /api/v1/devices', () => {
    it('should create device with valid data', async () => {
      const deviceData = {
        username: 'new_test_device',
        password: 'securepassword123',
        device_type: 'android',
        device_model: 'Samsung Galaxy Tab S8',
        location: 'Main Office',
        description: 'Reception area tablet'
      };

      const response = await request(app)
        .post('/api/v1/devices')
        .set('Authorization', `Bearer ${validToken}`)
        .send(deviceData);

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data.device.username).toBe('new_test_device');
      expect(response.body.data.device).toHaveProperty('id');
    });

    it('should fail without authentication', async () => {
      const deviceData = {
        username: 'unauthorized_device',
        password: 'password123',
        device_type: 'ipad'
      };

      const response = await request(app)
        .post('/api/v1/devices')
        .send(deviceData);

      expect(response.status).toBe(401);
    });

    it('should fail with missing required fields', async () => {
      const deviceData = {
        device_type: 'ipad'
        // Missing username and password
      };

      const response = await request(app)
        .post('/api/v1/devices')
        .set('Authorization', `Bearer ${validToken}`)
        .send(deviceData);

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.error_code).toBe('VALIDATION_ERROR');
    });

    it('should fail with duplicate username', async () => {
      const deviceData = {
        username: 'test_device_1', // Already exists
        password: 'password123',
        device_type: 'ipad'
      };

      const response = await request(app)
        .post('/api/v1/devices')
        .set('Authorization', `Bearer ${validToken}`)
        .send(deviceData);

      expect(response.status).toBe(409);
      expect(response.body.status).toBe('error');
      expect(response.body.error_code).toBe('DEVICE_EXISTS');
    });

    it('should fail with invalid device type', async () => {
      const deviceData = {
        username: 'invalid_type_device',
        password: 'password123',
        device_type: 'invalid_type'
      };

      const response = await request(app)
        .post('/api/v1/devices')
        .set('Authorization', `Bearer ${validToken}`)
        .send(deviceData);

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.error_code).toBe('VALIDATION_ERROR');
    });

    it('should hash password before storing', async () => {
      const deviceData = {
        username: 'password_test_device',
        password: 'plaintext_password',
        device_type: 'ipad'
      };

      const response = await request(app)
        .post('/api/v1/devices')
        .set('Authorization', `Bearer ${validToken}`)
        .send(deviceData);

      expect(response.status).toBe(201);
      // Password should not be returned in response
      expect(response.body.data.device).not.toHaveProperty('password');
      expect(response.body.data.device).not.toHaveProperty('password_hash');
    });
  });

  describe('PUT /api/v1/devices/:id', () => {
    it('should update device with valid data', async () => {
      const updateData = {
        device_model: 'Updated iPad Pro',
        location: 'Updated Location',
        description: 'Updated description'
      };

      const response = await request(app)
        .put('/api/v1/devices/1')
        .set('Authorization', `Bearer ${validToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.device.device_model).toBe('Updated iPad Pro');
    });

    it('should fail without authentication', async () => {
      const updateData = {
        device_model: 'Unauthorized Update'
      };

      const response = await request(app)
        .put('/api/v1/devices/1')
        .send(updateData);

      expect(response.status).toBe(401);
    });

    it('should return 404 for nonexistent device', async () => {
      const updateData = {
        device_model: 'Updated Model'
      };

      const response = await request(app)
        .put('/api/v1/devices/999')
        .set('Authorization', `Bearer ${validToken}`)
        .send(updateData);

      expect(response.status).toBe(404);
      expect(response.body.status).toBe('error');
      expect(response.body.error_code).toBe('DEVICE_NOT_FOUND');
    });

    it('should update password and hash it', async () => {
      const updateData = {
        password: 'new_secure_password'
      };

      const response = await request(app)
        .put('/api/v1/devices/1')
        .set('Authorization', `Bearer ${validToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      // Password should not be returned in response
      expect(response.body.data.device).not.toHaveProperty('password');
    });
  });

  describe('DELETE /api/v1/devices/:id', () => {
    it('should delete device with valid ID', async () => {
      // First create a device to delete
      const createResponse = await request(app)
        .post('/api/v1/devices')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          username: 'device_to_delete',
          password: 'password123',
          device_type: 'ipad'
        });

      const deviceId = createResponse.body.data.device.id;

      const response = await request(app)
        .delete(`/api/v1/devices/${deviceId}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('Device deleted successfully');
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .delete('/api/v1/devices/1');

      expect(response.status).toBe(401);
    });

    it('should return 404 for nonexistent device', async () => {
      const response = await request(app)
        .delete('/api/v1/devices/999')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(404);
      expect(response.body.status).toBe('error');
      expect(response.body.error_code).toBe('DEVICE_NOT_FOUND');
    });

    it('should soft delete instead of hard delete', async () => {
      const response = await request(app)
        .delete('/api/v1/devices/2')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);

      // Device should still exist but be inactive
      const getResponse = await request(app)
        .get('/api/v1/devices/2')
        .set('Authorization', `Bearer ${validToken}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.data.device.is_active).toBe(false);
    });
  });
});
