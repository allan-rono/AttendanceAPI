const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../utils/logger');
const crypto = require('crypto');

const dbPath = process.env.CACHE_DB_PATH || path.join(__dirname, '../cache/kiron_cache.db');

class CacheService {
  constructor() {
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) logger.error('Failed to open cache DB:', err.message);
      else logger.info('Cache DB initialized');
    });
    this.initTables();
  }

  initTables() {
    this.db.serialize(() => {
      // Employee cache table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS employee_cache (
          national_id TEXT PRIMARY KEY,
          employee_data TEXT,
          last_sync DATETIME DEFAULT CURRENT_TIMESTAMP,
          is_synced INTEGER DEFAULT 0
        )
      `);

      // Enhanced attendance queue with batch support
      this.db.run(`
        CREATE TABLE IF NOT EXISTS attendance_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_id TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          status TEXT NOT NULL,
          site_id TEXT,
          device_id TEXT,
          latitude REAL,
          longitude REAL,
          record_hash TEXT UNIQUE,
          batch_id TEXT,
          retry_count INTEGER DEFAULT 0,
          last_retry DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          synced INTEGER DEFAULT 0,
          synced_at DATETIME,
          error_message TEXT
        )
      `);

      // Record hash table for idempotency
      this.db.run(`
        CREATE TABLE IF NOT EXISTS record_hashes (
          record_hash TEXT PRIMARY KEY,
          record_data TEXT NOT NULL,
          is_synced INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          synced_at DATETIME,
          batch_id TEXT
        )
      `);

      // Sync status table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS sync_status (
          operation_type TEXT PRIMARY KEY,
          last_sync DATETIME,
          status TEXT,
          records_processed INTEGER DEFAULT 0,
          success_count INTEGER DEFAULT 0,
          error_count INTEGER DEFAULT 0
        )
      `);

      // Batch processing log
      this.db.run(`
        CREATE TABLE IF NOT EXISTS batch_log (
          batch_id TEXT PRIMARY KEY,
          total_records INTEGER,
          processed_records INTEGER DEFAULT 0,
          success_count INTEGER DEFAULT 0,
          error_count INTEGER DEFAULT 0,
          status TEXT DEFAULT 'processing',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          completed_at DATETIME
        )
      `);

      // Create indexes for better performance
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_attendance_queue_synced ON attendance_queue(synced)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_attendance_queue_batch ON attendance_queue(batch_id)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_record_hashes_synced ON record_hashes(is_synced)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_attendance_queue_employee ON attendance_queue(employee_id)`);
    });
  }

  // Generate record hash for idempotency
  generateRecordHash(recordData) {
    const hashString = `${recordData.employee_id}-${recordData.timestamp}-${recordData.status}-${recordData.device_id || ''}`;
    return crypto.createHash('sha256').update(hashString).digest('hex');
  }

  // Store record hash for idempotency
  async storeRecordHash(recordHash, recordData, isSynced = false, batchId = null) {
    return new Promise((resolve, reject) => {
      const syncedAt = isSynced ? new Date().toISOString() : null;
      this.db.run(
        `INSERT OR REPLACE INTO record_hashes 
         (record_hash, record_data, is_synced, synced_at, batch_id) 
         VALUES (?, ?, ?, ?, ?)`,
        [recordHash, JSON.stringify(recordData), isSynced ? 1 : 0, syncedAt, batchId],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  // Check for duplicate records
  async checkDuplicateRecord(recordHash) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM record_hashes WHERE record_hash = ?',
        [recordHash],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  // Alternative method name for compatibility
  async isDuplicateRecord(recordHash) {
    return await this.checkDuplicateRecord(recordHash);
  }

  // Get record status
  async getRecordStatus(recordHash) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT rh.*, aq.id as queue_id, aq.synced as queue_synced, 
                aq.retry_count, aq.error_message, aq.last_retry
         FROM record_hashes rh
         LEFT JOIN attendance_queue aq ON rh.record_hash = aq.record_hash
         WHERE rh.record_hash = ?`,
        [recordHash],
        (err, row) => {
          if (err) reject(err);
          else {
            if (row) {
              resolve({
                record_hash: row.record_hash,
                is_synced: row.is_synced === 1,
                created_at: row.created_at,
                synced_at: row.synced_at,
                batch_id: row.batch_id,
                queue_status: row.queue_id ? {
                  queue_id: row.queue_id,
                  synced: row.queue_synced === 1,
                  retry_count: row.retry_count,
                  error_message: row.error_message,
                  last_retry: row.last_retry
                } : null,
                record_data: JSON.parse(row.record_data)
              });
            } else {
              resolve(null);
            }
          }
        }
      );
    });
  }

  // Cache employee data
  async cacheEmployee(nationalId, employeeData) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR REPLACE INTO employee_cache (national_id, employee_data, is_synced) VALUES (?, ?, 1)',
        [nationalId, JSON.stringify(employeeData)],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  // Check if employee exists in cache
  async checkEmployeeCache(nationalId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM employee_cache WHERE national_id = ?',
        [nationalId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row ? JSON.parse(row.employee_data) : null);
        }
      );
    });
  }

  // Enhanced queue attendance with batch support
  async queueAttendance(attendanceData) {
    return new Promise((resolve, reject) => {
      // Generate record hash if not provided
      if (!attendanceData.record_hash) {
        attendanceData.record_hash = this.generateRecordHash(attendanceData);
      }

      this.db.run(
        `INSERT INTO attendance_queue 
         (employee_id, timestamp, status, site_id, device_id, latitude, longitude, record_hash, batch_id) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          attendanceData.employee_id,
          attendanceData.timestamp,
          attendanceData.status,
          attendanceData.site_id || null,
          attendanceData.device_id || null,
          attendanceData.latitude || null,
          attendanceData.longitude || null,
          attendanceData.record_hash,
          attendanceData.batch_id || null
        ],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  // Get pending attendance records with limit and retry logic
  async getPendingAttendance(limit = 50, maxRetries = 3) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM attendance_queue 
         WHERE synced = 0 AND (retry_count < ? OR retry_count IS NULL)
         ORDER BY created_at ASC 
         LIMIT ?`,
        [maxRetries, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Get pending records by batch ID
  async getPendingByBatch(batchId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM attendance_queue WHERE batch_id = ? AND synced = 0',
        [batchId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Mark attendance as synced
  async markAttendanceSynced(id, recordHash = null) {
    return new Promise((resolve, reject) => {
      const syncedAt = new Date().toISOString();

      this.db.serialize(() => {
        // Update attendance queue
        this.db.run(
          'UPDATE attendance_queue SET synced = 1, synced_at = ? WHERE id = ?',
          [syncedAt, id],
          function (err) {
            if (err) {
              reject(err);
              return;
            }
          }
        );

        // Update record hash if provided
        if (recordHash) {
          this.db.run(
            'UPDATE record_hashes SET is_synced = 1, synced_at = ? WHERE record_hash = ?',
            [syncedAt, recordHash],
            function (err) {
              if (err) reject(err);
              else resolve(this.changes);
            }
          );
        } else {
          resolve(1);
        }
      });
    });
  }

  // Mark attendance sync failed and increment retry count
  async markAttendanceFailed(id, errorMessage) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE attendance_queue 
         SET retry_count = COALESCE(retry_count, 0) + 1, 
             last_retry = CURRENT_TIMESTAMP,
             error_message = ?
         WHERE id = ?`,
        [errorMessage, id],
        function (err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  // Batch operations
  async createBatchLog(batchId, totalRecords) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR REPLACE INTO batch_log (batch_id, total_records) VALUES (?, ?)',
        [batchId, totalRecords],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async updateBatchLog(batchId, processedRecords, successCount, errorCount, status = 'processing') {
    return new Promise((resolve, reject) => {
      const completedAt = status === 'completed' ? new Date().toISOString() : null;
      this.db.run(
        `UPDATE batch_log 
         SET processed_records = ?, success_count = ?, error_count = ?, status = ?, completed_at = ?
         WHERE batch_id = ?`,
        [processedRecords, successCount, errorCount, status, completedAt, batchId],
        function (err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  async getBatchStatus(batchId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM batch_log WHERE batch_id = ?',
        [batchId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  // Get all batches with pagination
  async getAllBatches(limit = 50, offset = 0) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM batch_log ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [limit, offset],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Get sync statistics
  async getSyncStats() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT 
           COUNT(*) as total_records,
           SUM(CASE WHEN synced = 1 THEN 1 ELSE 0 END) as synced_records,
           SUM(CASE WHEN synced = 0 THEN 1 ELSE 0 END) as pending_records,
           SUM(CASE WHEN retry_count >= 3 THEN 1 ELSE 0 END) as failed_records
         FROM attendance_queue`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows[0]);
        }
      );
    });
  }

  // Reset failed records for retry
  async resetFailedRecords() {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE attendance_queue SET retry_count = 0, error_message = NULL WHERE retry_count >= 3',
        function (err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  // Cleanup old records (older than specified days)
  async cleanupOldRecords(daysOld = 30) {
    return new Promise((resolve, reject) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      const cutoffISO = cutoffDate.toISOString();

      this.db.serialize(() => {
        let deletedCount = 0;

        // Delete old synced attendance records
        this.db.run(
          'DELETE FROM attendance_queue WHERE synced = 1 AND synced_at < ?',
          [cutoffISO],
          function (err) {
            if (err) {
              reject(err);
              return;
            }
            deletedCount += this.changes;
          }
        );

        // Delete old synced record hashes
        this.db.run(
          'DELETE FROM record_hashes WHERE is_synced = 1 AND synced_at < ?',
          [cutoffISO],
          function (err) {
            if (err) reject(err);
            else {
              deletedCount += this.changes;
              resolve(deletedCount);
            }
          }
        );
      });
    });
  }

  // Close database connection
  close() {
    return new Promise((resolve) => {
      this.db.close((err) => {
        if (err) logger.error('Error closing cache DB:', err.message);
        else logger.info('Cache DB connection closed');
        resolve();
      });
    });
  }
}

// Export singleton instance
module.exports = new CacheService();