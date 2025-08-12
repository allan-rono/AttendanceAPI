const cacheService = require('./cacheService');
const erpnext = require('./erpnextService');
const logger = require('../utils/logger');
const { EventEmitter } = require('events');

class SyncService extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.syncInterval = parseInt(process.env.SYNC_INTERVAL) || 30000; // 30 seconds
    this.batchSize = parseInt(process.env.SYNC_BATCH_SIZE) || 20;
    this.maxRetries = parseInt(process.env.SYNC_MAX_RETRIES) || 3;
    this.syncTimer = null;
  }

  // Start automatic sync service
  start() {
    if (this.isRunning) {
      logger.warn('Sync service is already running');
      return;
    }

    this.isRunning = true;
    logger.info(`Starting sync service with ${this.syncInterval}ms interval`);

    // Initial sync
    this.syncPendingRecords();

    // Schedule periodic sync
    this.syncTimer = setInterval(() => {
      this.syncPendingRecords();
    }, this.syncInterval);

    this.emit('started');
  }

  // Stop sync service
  stop() {
    if (!this.isRunning) {
      logger.warn('Sync service is not running');
      return;
    }

    this.isRunning = false;

    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    logger.info('Sync service stopped');
    this.emit('stopped');
  }

  // Sync pending attendance records
  async syncPendingRecords() {
    if (!this.isRunning) return;

    try {
      logger.info('Starting sync of pending attendance records');

      // Get pending records
      const pendingRecords = await cacheService.getPendingAttendance(this.batchSize, this.maxRetries);

      if (pendingRecords.length === 0) {
        logger.debug('No pending records to sync');
        return { success: true, processed: 0 };
      }

      logger.info(`Found ${pendingRecords.length} pending records to sync`);

      // Process records in batch
      const batchResult = await erpnext.submitBatchCheckin(pendingRecords);

      let successCount = 0;
      let failureCount = 0;

      // Update sync status for each record
      for (const result of batchResult.results) {
        const record = pendingRecords.find(r => 
          r.record_hash === result.record_id || r.id === result.index
        );

        if (!record) continue;

        if (result.success) {
          await cacheService.markAttendanceSynced(record.id, record.record_hash);
          successCount++;
          logger.debug(`Record ${record.id} synced successfully`);
        } else {
          await cacheService.markAttendanceFailed(record.id, result.error);
          failureCount++;
          logger.warn(`Record ${record.id} sync failed: ${result.error}`);
        }
      }

      const syncResult = {
        success: failureCount === 0,
        total: pendingRecords.length,
        successful: successCount,
        failed: failureCount,
        timestamp: new Date().toISOString()
      };

      logger.info(`Sync completed: ${successCount} successful, ${failureCount} failed`);

      this.emit('syncCompleted', syncResult);
      return syncResult;

    } catch (error) {
      logger.error('Sync process failed:', error.message);
      this.emit('syncError', error);
      return { success: false, error: error.message };
    }
  }

  // Batch sync employees to ERPNext
  async batchSyncEmployees(employees) {
    try {
      logger.info(`Batch syncing ${employees.length} employees`);
      
      if (!Array.isArray(employees) || employees.length === 0) {
        return { success: false, error: 'Invalid or empty employees array' };
      }

      // Validate employee data
      const validEmployees = employees.filter(emp => 
        emp.employee_id && emp.employee_name
      );

      if (validEmployees.length === 0) {
        return { success: false, error: 'No valid employees found' };
      }

      // Sync employees to ERPNext
      const batchResult = await erpnext.registerBatchEmployees(validEmployees);
      
      let successCount = 0;
      let failureCount = 0;
      const results = [];

      // Process results
      for (let i = 0; i < validEmployees.length; i++) {
        const employee = validEmployees[i];
        const result = batchResult.results ? batchResult.results[i] : null;
        
        if (result && result.success) {
          successCount++;
          results.push({
            employee_id: employee.employee_id,
            success: true,
            message: 'Employee synced successfully'
          });
          logger.debug(`Employee ${employee.employee_id} synced successfully`);
        } else {
          failureCount++;
          const error = result ? result.error : 'Unknown error';
          results.push({
            employee_id: employee.employee_id,
            success: false,
            error: error
          });
          logger.warn(`Employee ${employee.employee_id} sync failed: ${error}`);
        }
      }

      const syncResult = {
        success: failureCount === 0,
        total: validEmployees.length,
        successful: successCount,
        failed: failureCount,
        results: results,
        timestamp: new Date().toISOString()
      };

      logger.info(`Employee batch sync completed: ${successCount} successful, ${failureCount} failed`);
      this.emit('employeeSyncCompleted', syncResult);
      
      return syncResult;

    } catch (error) {
      logger.error('Batch employee sync failed:', error.message);
      this.emit('employeeSyncError', error);
      return { success: false, error: error.message };
    }
  }

  // Batch sync attendance records
  async batchSyncAttendance(attendanceRecords) {
    try {
      logger.info(`Batch syncing ${attendanceRecords.length} attendance records`);
      
      if (!Array.isArray(attendanceRecords) || attendanceRecords.length === 0) {
        return { success: false, error: 'Invalid or empty attendance records array' };
      }

      // Validate attendance data
      const validRecords = attendanceRecords.filter(record => 
        record.employee_id && record.timestamp
      );

      if (validRecords.length === 0) {
        return { success: false, error: 'No valid attendance records found' };
      }

      // Transform records to match ERPNext format if needed
      const transformedRecords = validRecords.map(record => ({
        employee_id: record.employee_id,
        timestamp: record.timestamp,
        device_id: record.device_id || 'API',
        status: record.status || record.log_type || 'IN', // Default to 'IN' if not specified
        time: record.timestamp, // Ensure timestamp is in correct format
        ...record
      }));

      // Sync to ERPNext
      const batchResult = await erpnext.submitBatchCheckin(transformedRecords);
      
      let successCount = 0;
      let failureCount = 0;
      const results = [];

      // Process results
      for (let i = 0; i < transformedRecords.length; i++) {
        const record = transformedRecords[i];
        const result = batchResult.results ? batchResult.results[i] : null;
        
        if (result && result.success) {
          successCount++;
          results.push({
            employee_id: record.employee,
            timestamp: record.time,
            success: true,
            message: 'Attendance synced successfully'
          });
          logger.debug(`Attendance for ${record.employee} synced successfully`);
        } else {
          failureCount++;
          const error = result ? result.error : 'Unknown error';
          results.push({
            employee_id: record.employee,
            timestamp: record.time,
            success: false,
            error: error
          });
          logger.warn(`Attendance for ${record.employee} sync failed: ${error}`);
        }
      }

      const syncResult = {
        success: failureCount === 0,
        total: transformedRecords.length,
        successful: successCount,
        failed: failureCount,
        results: results,
        timestamp: new Date().toISOString()
      };

      logger.info(`Attendance batch sync completed: ${successCount} successful, ${failureCount} failed`);
      this.emit('attendanceSyncCompleted', syncResult);
      
      return syncResult;

    } catch (error) {
      logger.error('Batch attendance sync failed:', error.message);
      this.emit('attendanceSyncError', error);
      return { success: false, error: error.message };
    }
  }

  // Get batch status by batch ID
  async getBatchStatus(batchId) {
    try {
      logger.info(`Getting batch status for batch ID: ${batchId}`);
      
      if (!batchId) {
        return { success: false, error: 'Batch ID is required' };
      }

      // Get batch status from cache/database
      const batchStatus = await new Promise((resolve, reject) => {
        cacheService.db.get(
          `SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN synced = 1 THEN 1 ELSE 0 END) as successful,
            SUM(CASE WHEN synced = 0 AND retry_count >= ? THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN synced = 0 AND retry_count < ? THEN 1 ELSE 0 END) as pending
          FROM attendance_queue 
          WHERE batch_id = ?`,
          [this.maxRetries, this.maxRetries, batchId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!batchStatus || batchStatus.total === 0) {
        return { success: false, error: 'Batch not found' };
      }

      // Get recent records for this batch
      const recentRecords = await new Promise((resolve, reject) => {
        cacheService.db.all(
          `SELECT employee_id, synced, retry_count, error_message, created_at, synced_at
          FROM attendance_queue 
          WHERE batch_id = ? 
          ORDER BY created_at DESC 
          LIMIT 10`,
          [batchId],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });

      const result = {
        success: true,
        batch_id: batchId,
        status: {
          total: batchStatus.total,
          successful: batchStatus.successful,
          failed: batchStatus.failed,
          pending: batchStatus.pending,
          completion_rate: ((batchStatus.successful / batchStatus.total) * 100).toFixed(2)
        },
        recent_records: recentRecords,
        timestamp: new Date().toISOString()
      };

      logger.debug(`Batch status retrieved for ${batchId}:`, result.status);
      return result;

    } catch (error) {
      logger.error(`Failed to get batch status for ${batchId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // Force sync specific records by IDs
  async forceSyncRecords(recordIds) {
    try {
      logger.info(`Force syncing ${recordIds.length} specific records`);

      const records = [];
      for (const id of recordIds) {
        const record = await this.getRecordById(id);
        if (record) records.push(record);
      }

      if (records.length === 0) {
        return { success: false, error: 'No valid records found' };
      }

      const batchResult = await erpnext.submitBatchCheckin(records);

      // Update sync status
      for (const result of batchResult.results) {
        const record = records.find(r => r.record_hash === result.record_id) || records.find(r => r.id === result.index);
        if (!record) continue;

        if (result.success) {
          await cacheService.markAttendanceSynced(record.id, record.record_hash);
        } else {
          await cacheService.markAttendanceFailed(record.id, result.error);
        }
      }

      return {
        success: batchResult.failed === 0,
        total: records.length,
        successful: batchResult.successful,
        failed: batchResult.failed,
        results: batchResult.results
      };

    } catch (error) {
      logger.error('Force sync failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Get record by ID from cache
  async getRecordById(id) {
    return new Promise((resolve, reject) => {
      cacheService.db.get(
        'SELECT * FROM attendance_queue WHERE id = ?',
        [id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  // Retry failed records (records that exceeded max retries)
  async retryFailedRecords() {
    try {
      logger.info('Retrying failed records');

      // Get records that exceeded max retries
      const failedRecords = await new Promise((resolve, reject) => {
        cacheService.db.all(
          `SELECT * FROM attendance_queue 
          WHERE synced = 0 AND retry_count >= ? 
          ORDER BY created_at ASC 
          LIMIT ?`,
          [this.maxRetries, this.batchSize],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });

      if (failedRecords.length === 0) {
        logger.info('No failed records to retry');
        return { success: true, processed: 0 };
      }

      logger.info(`Retrying ${failedRecords.length} failed records`);

      // Reset retry count for these records
      for (const record of failedRecords) {
        await new Promise((resolve, reject) => {
          cacheService.db.run(
            'UPDATE attendance_queue SET retry_count = 0, error_message = NULL WHERE id = ?',
            [record.id],
            function (err) {
              if (err) reject(err);
              else resolve(this.changes);
            }
          );
        });
      }

      // Attempt sync again
      const batchResult = await erpnext.submitBatchCheckin(failedRecords);

      let successCount = 0;
      let failureCount = 0;

      // Update sync status
      for (const result of batchResult.results) {
        const record = failedRecords.find(r => r.record_hash === result.record_id) || failedRecords.find(r => r.id === result.index);
        if (!record) continue;

        if (result.success) {
          await cacheService.markAttendanceSynced(record.id, record.record_hash);
          successCount++;
        } else {
          await cacheService.markAttendanceFailed(record.id, result.error);
          failureCount++;
        }
      }

      const retryResult = {
        success: failureCount === 0,
        total: failedRecords.length,
        successful: successCount,
        failed: failureCount,
        timestamp: new Date().toISOString()
      };

      logger.info(`Retry completed: ${successCount} successful, ${failureCount} failed`);

      this.emit('retryCompleted', retryResult);
      return retryResult;

    } catch (error) {
      logger.error('Retry process failed:', error.message);
      this.emit('retryError', error);
      return { success: false, error: error.message };
    }
  }

  // Get sync statistics
  async getSyncStats() {
    try {
      const stats = await cacheService.getSyncStats();
      const erpHealthCheck = await erpnext.healthCheck();

      return {
        cache_stats: stats,
        erp_connection: erpHealthCheck,
        sync_service: {
          is_running: this.isRunning,
          sync_interval: this.syncInterval,
          batch_size: this.batchSize,
          max_retries: this.maxRetries
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to get sync stats:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Cleanup old synced records
  async cleanupOldRecords(daysOld = 30) {
    try {
      logger.info(`Cleaning up records older than ${daysOld} days`);

      const deletedCount = await cacheService.cleanupOldRecords(daysOld);

      logger.info(`Cleanup completed: ${deletedCount} records deleted`);

      this.emit('cleanupCompleted', { deleted: deletedCount, days: daysOld });

      return { success: true, deleted: deletedCount };
    } catch (error) {
      logger.error('Cleanup failed:', error.message);
      this.emit('cleanupError', error);
      return { success: false, error: error.message };
    }
  }

  // Manual sync trigger
  async triggerSync() {
    if (!this.isRunning) {
      return { success: false, error: 'Sync service is not running' };
    }

    logger.info('Manual sync triggered');
    return await this.syncPendingRecords();
  }

  // Get service status
  getStatus() {
    return {
      is_running: this.isRunning,
      sync_interval: this.syncInterval,
      batch_size: this.batchSize,
      max_retries: this.maxRetries,
      next_sync: this.syncTimer ? new Date(Date.now() + this.syncInterval).toISOString() : null
    };
  }

  // Update configuration
  updateConfig(config) {
    if (config.syncInterval && config.syncInterval > 0) {
      this.syncInterval = config.syncInterval;
    }

    if (config.batchSize && config.batchSize > 0) {
      this.batchSize = config.batchSize;
    }

    if (config.maxRetries && config.maxRetries > 0) {
      this.maxRetries = config.maxRetries;
    }

    // Restart timer with new interval if running
    if (this.isRunning && this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = setInterval(() => {
        this.syncPendingRecords();
      }, this.syncInterval);
    }

    logger.info('Sync service configuration updated', config);
    this.emit('configUpdated', config);
  }

  // Update sync configuration (alias for updateConfig)
  async updateSyncConfig(config) {
    try {
      logger.info('Updating sync configuration:', config);
      
      // Validate config
      const validConfig = {};
      
      if (config.syncInterval && typeof config.syncInterval === 'number' && config.syncInterval > 0) {
        validConfig.syncInterval = config.syncInterval;
      }
      
      if (config.batchSize && typeof config.batchSize === 'number' && config.batchSize > 0) {
        validConfig.batchSize = config.batchSize;
      }
      
      if (config.maxRetries && typeof config.maxRetries === 'number' && config.maxRetries >= 0) {
        validConfig.maxRetries = config.maxRetries;
      }

      if (Object.keys(validConfig).length === 0) {
        return { success: false, error: 'No valid configuration provided' };
      }

      // Update configuration
      this.updateConfig(validConfig);
      
      const updatedConfig = {
        success: true,
        updated_config: validConfig,
        current_config: {
          syncInterval: this.syncInterval,
          batchSize: this.batchSize,
          maxRetries: this.maxRetries,
          isRunning: this.isRunning
        },
        timestamp: new Date().toISOString()
      };

      logger.info('Sync configuration updated successfully');
      return updatedConfig;

    } catch (error) {
      logger.error('Failed to update sync configuration:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new SyncService();