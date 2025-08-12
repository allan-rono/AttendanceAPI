
// tests/performance.test.js
const request = require('supertest');
const app = require('../app');
const { setupTestDB, teardownTestDB, getValidToken } = require('./test.setup');

const { clearTestData } = require('./test.setup');


describe('Performance Tests', () => {
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

  describe('Response Time Tests', () => {
    it('should respond to health check within 100ms', async () => {
      const startTime = Date.now();

      const response = await request(app)
        .get('/health');

      const responseTime = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(100);
    });

    it('should respond to auth login within 500ms', async () => {
      const startTime = Date.now();

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'test_device_1',
          password: 'password123'
        });

      const responseTime = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(500);
    });

    it('should respond to employee list within 200ms', async () => {
      const startTime = Date.now();

      const response = await request(app)
        .get('/api/v1/employees')
        .set('Authorization', `Bearer ${validToken}`);

      const responseTime = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(200);
    });

    it('should respond to attendance marking within 300ms', async () => {
      const startTime = Date.now();

      const response = await request(app)
        .post('/api/v1/attendance/mark')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          employee_id: 'EMP001',
          timestamp: new Date().toISOString(),
          device_id: 'test_device_1',
          type: 'check_in'
        });

      const responseTime = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(300);
    });
  });

  describe('Concurrent Request Tests', () => {
    it('should handle 10 concurrent authentication requests', async () => {
      const promises = [];
      const startTime = Date.now();

      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app)
            .post('/api/v1/auth/login')
            .send({
              username: 'test_device_1',
              password: 'password123'
            })
        );
      }

      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Should complete within reasonable time
      expect(totalTime).toBeLessThan(2000);
    });

    it('should handle 20 concurrent employee list requests', async () => {
      const promises = [];
      const startTime = Date.now();

      for (let i = 0; i < 20; i++) {
        promises.push(
          request(app)
            .get('/api/v1/employees')
            .set('Authorization', `Bearer ${validToken}`)
        );
      }

      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Should complete within reasonable time
      expect(totalTime).toBeLessThan(3000);
    });

    it('should handle 15 concurrent attendance marking requests', async () => {
      const promises = [];
      const startTime = Date.now();

      for (let i = 0; i < 15; i++) {
        promises.push(
          request(app)
            .post('/api/v1/attendance/mark')
            .set('Authorization', `Bearer ${validToken}`)
            .send({
              employee_id: 'EMP001',
              timestamp: new Date(Date.now() + i * 1000).toISOString(), // Different timestamps
              device_id: 'test_device_1',
              type: i % 2 === 0 ? 'check_in' : 'check_out'
            })
        );
      }

      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      // Most requests should succeed (some might fail due to business logic)
      const successfulResponses = responses.filter(r => r.status === 200);
      expect(successfulResponses.length).toBeGreaterThan(10);

      // Should complete within reasonable time
      expect(totalTime).toBeLessThan(5000);
    });
  });

  describe('Load Tests', () => {
    it('should handle high volume of health checks', async () => {
      const promises = [];
      const requestCount = 50;
      const startTime = Date.now();

      for (let i = 0; i < requestCount; i++) {
        promises.push(
          request(app).get('/health')
        );
      }

      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      const avgResponseTime = totalTime / requestCount;

      // All requests should succeed
      expect(responses.every(r => r.status === 200)).toBe(true);

      // Average response time should be reasonable
      expect(avgResponseTime).toBeLessThan(50);
    });

    it('should maintain performance under sustained load', async () => {
      const batchSize = 10;
      const batchCount = 5;
      const results = [];

      for (let batch = 0; batch < batchCount; batch++) {
        const promises = [];
        const startTime = Date.now();

        for (let i = 0; i < batchSize; i++) {
          promises.push(
            request(app)
              .get('/api/v1/employees')
              .set('Authorization', `Bearer ${validToken}`)
          );
        }

        const responses = await Promise.all(promises);
        const batchTime = Date.now() - startTime;

        results.push({
          batch: batch + 1,
          time: batchTime,
          successCount: responses.filter(r => r.status === 200).length
        });

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // All batches should have high success rate
      results.forEach(result => {
        expect(result.successCount).toBeGreaterThanOrEqual(batchSize * 0.9);
      });

      // Performance should not degrade significantly
      const firstBatchTime = results[0].time;
      const lastBatchTime = results[results.length - 1].time;
      expect(lastBatchTime).toBeLessThan(firstBatchTime * 2);
    });
  });

  describe('Memory and Resource Tests', () => {
    it('should not have significant memory leaks during repeated requests', async () => {
      const initialMemory = process.memoryUsage();

      // Make many requests
      for (let i = 0; i < 100; i++) {
        await request(app)
          .get('/health');
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    it('should handle large payloads efficiently', async () => {
      const largeEmployeeData = {
        employee_id: 'LARGE_PAYLOAD_TEST',
        first_name: 'Large',
        last_name: 'Payload',
        email: 'large.payload@kironccltd.co.ke',
        description: 'A'.repeat(1000), // 1KB description
        metadata: {
          notes: 'B'.repeat(2000), // 2KB notes
          tags: Array(100).fill('tag').map((tag, i) => `${tag}_${i}`)
        }
      };

      const startTime = Date.now();

      const response = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${validToken}`)
        .send(largeEmployeeData);

      const responseTime = Date.now() - startTime;

      expect(response.status).toBe(201);
      expect(responseTime).toBeLessThan(1000); // Should handle large payload within 1 second
    });
  });

  describe('Database Performance Tests', () => {
    it('should handle database queries efficiently', async () => {
      // Create multiple employees for testing
      const createPromises = [];
      for (let i = 0; i < 20; i++) {
        createPromises.push(
          request(app)
            .post('/api/v1/employees')
            .set('Authorization', `Bearer ${validToken}`)
            .send({
              employee_id: `PERF_EMP_${i.toString().padStart(3, '0')}`,
              first_name: `Employee${i}`,
              last_name: 'Performance',
              email: `perf.emp${i}@kironccltd.co.ke`
            })
        );
      }

      await Promise.all(createPromises);

      // Test pagination performance
      const startTime = Date.now();

      const response = await request(app)
        .get('/api/v1/employees?page=1&limit=50')
        .set('Authorization', `Bearer ${validToken}`);

      const queryTime = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(queryTime).toBeLessThan(200); // Should query efficiently
      expect(response.body.data.employees.length).toBeGreaterThan(15);
    });

    it('should handle search queries efficiently', async () => {
      const startTime = Date.now();

      const response = await request(app)
        .get('/api/v1/employees?search=Performance')
        .set('Authorization', `Bearer ${validToken}`);

      const searchTime = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(searchTime).toBeLessThan(300); // Search should be fast
    });
  });
});
