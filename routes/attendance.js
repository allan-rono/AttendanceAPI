const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { handleError, asyncHandler } = require('../middleware/errorHandler');
const erpnext = require('../services/erpnextService');
const cacheService = require('../services/cacheService');
const logger = require('../utils/logger');
const crypto = require('crypto');

// Generate unique record hash for idempotency
function generateRecordHash(record) {
  const hashString = `${record.employee_id}-${record.timestamp}-${record.status}-${record.device_id || 'default'}`;
  return crypto.createHash('sha256').update(hashString).digest('hex');
}

const DOMPurify = require('isomorphic-dompurify');

// Add sanitization middleware
const sanitizeInput = (req, res, next) => {
  const sanitizeObject = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = DOMPurify.sanitize(obj[key]);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key]);
      }
    }
  };
  
  if (req.body) sanitizeObject(req.body);
  if (req.query) sanitizeObject(req.query);
  if (req.params) sanitizeObject(req.params);
  
  next();
};

// Apply to all routes
router.use(sanitizeInput);

// POST /api/v1/attendance/clock - Single attendance record
router.post(
  '/clock',
  [
    body('employee_id').notEmpty().withMessage('Employee ID is required'),
    body('timestamp').notEmpty().isISO8601().withMessage('Timestamp required (ISO8601)'),
    body('status').notEmpty().isIn(['clock-in', 'clock-out']).withMessage('Status must be clock-in or clock-out'),
    body('device_id').optional(),
    body('site_id').optional(),
    body('latitude').optional().isFloat(),
    body('longitude').optional().isFloat(),
    body('record_id').optional().isString().withMessage('Record ID must be a string')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return handleError(res, 400, 'Validation failed', 'VALIDATION_ERROR', errors.array());
    }

    const record = req.body;
    const recordHash = record.record_id || generateRecordHash(record);

    try {
      // Check for duplicate using record hash
      const existingRecord = await cacheService.checkDuplicateRecord(recordHash);
      if (existingRecord) {
        logger.info(`Duplicate attendance record detected: ${recordHash}`);
        return res.json({
          status: 'success',
          message: 'Record already processed (duplicate)',
          data: { record_id: recordHash, duplicate: true }
        });
      }

      // Attempt direct sync to ERPNext
      const result = await erpnext.submitCheckin(record);

      if (result.success) {
        // Mark as synced and store record hash
        await cacheService.storeRecordHash(recordHash, record, true);
        logger.info(`Attendance synced: ${record.employee_id}, ${record.status}, ${record.timestamp}`);

        res.json({
          status: 'success',
          message: 'Clock event recorded and synced',
          data: { 
            record_id: recordHash,
            erp_response: result.data,
            synced: true
          }
        });
      } else {
        // Queue for offline sync
        const queueId = await cacheService.queueAttendance({
          ...record,
          record_hash: recordHash
        });
        await cacheService.storeRecordHash(recordHash, record, false);

        logger.warn(`Attendance queued for sync: ${record.employee_id} - ${result.error}`);

        res.json({
          status: 'success',
          message: 'Clock event queued for sync',
          data: { 
            record_id: recordHash,
            queue_id: queueId,
            synced: false,
            error: result.error
          }
        });
      }
    } catch (error) {
      logger.error(`Attendance processing error: ${error.message}`);
      return handleError(res, 500, 'Failed to process attendance', 'PROCESSING_ERROR', error.message);
    }
  })
);

// POST /api/v1/attendance/batch - Batch attendance upload
router.post(
  '/batch',
  [
    body('records').isArray({ min: 1, max: 200 }).withMessage('Records must be an array (1-200 items)'),
    body('records.*.employee_id').notEmpty().withMessage('Employee ID is required for all records'),
    body('records.*.timestamp').notEmpty().isISO8601().withMessage('Valid timestamp required for all records'),
    body('records.*.status').notEmpty().isIn(['clock-in', 'clock-out']).withMessage('Status must be clock-in or clock-out for all records'),
    body('records.*.device_id').optional(),
    body('records.*.site_id').optional(),
    body('records.*.latitude').optional().isFloat(),
    body('records.*.longitude').optional().isFloat(),
    body('records.*.record_id').optional().isString(),
    body('batch_id').optional().isString().withMessage('Batch ID must be a string'),
    body('offline_sync').optional().isBoolean().withMessage('Offline sync flag must be boolean')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return handleError(res, 400, 'Validation failed', 'VALIDATION_ERROR', errors.array());
    }

    const { records, batch_id, offline_sync = false } = req.body;
    const batchId = batch_id || crypto.randomUUID();
    const results = [];
    let successCount = 0;
    let duplicateCount = 0;
    let queuedCount = 0;
    let errorCount = 0;

    logger.info(`Processing batch upload: ${records.length} records, batch_id: ${batchId}`);

    for (const record of records) {
      const recordHash = record.record_id || generateRecordHash(record);

      try {
        // Check for duplicates
        const existingRecord = await cacheService.checkDuplicateRecord(recordHash);
        if (existingRecord) {
          results.push({
            record_id: recordHash,
            status: 'duplicate',
            message: 'Record already processed'
          });
          duplicateCount++;
          continue;
        }

        if (offline_sync) {
          // Force queue for offline sync
          const queueId = await cacheService.queueAttendance({
            ...record,
            record_hash: recordHash,
            batch_id: batchId
          });
          await cacheService.storeRecordHash(recordHash, record, false);

          results.push({
            record_id: recordHash,
            status: 'queued',
            queue_id: queueId,
            message: 'Queued for offline sync'
          });
          queuedCount++;
        } else {
          // Attempt direct sync
          const syncResult = await erpnext.submitCheckin(record);

          if (syncResult.success) {
            await cacheService.storeRecordHash(recordHash, record, true);
            results.push({
              record_id: recordHash,
              status: 'synced',
              message: 'Successfully synced to ERPNext',
              erp_response: syncResult.data
            });
            successCount++;
          } else {
            // Queue for retry
            const queueId = await cacheService.queueAttendance({
              ...record,
              record_hash: recordHash,
              batch_id: batchId
            });
            await cacheService.storeRecordHash(recordHash, record, false);

            results.push({
              record_id: recordHash,
              status: 'queued',
              queue_id: queueId,
              message: 'Queued due to sync failure',
              error: syncResult.error
            });
            queuedCount++;
          }
        }
      } catch (error) {
        logger.error(`Batch record processing error: ${error.message}`);
        results.push({
          record_id: recordHash,
          status: 'error',
          message: 'Processing failed',
          error: error.message
        });
        errorCount++;
      }
    }

    // Log batch processing summary
    logger.info(`Batch ${batchId} processed: ${successCount} synced, ${queuedCount} queued, ${duplicateCount} duplicates, ${errorCount} errors`);

    res.json({
      status: 'success',
      message: 'Batch processing completed',
      data: {
        batch_id: batchId,
        total_records: records.length,
        summary: {
          synced: successCount,
          queued: queuedCount,
          duplicates: duplicateCount,
          errors: errorCount
        },
        results
      }
    });
  })
);

// GET /api/v1/attendance/status/:record_id - Check record status
router.get(
  '/status/:record_id',
  asyncHandler(async (req, res) => {
    const { record_id } = req.params;

    try {
      const recordStatus = await cacheService.getRecordStatus(record_id);

      if (!recordStatus) {
        return handleError(res, 404, 'Record not found', 'RECORD_NOT_FOUND');
      }

      res.json({
        status: 'success',
        data: recordStatus
      });
    } catch (error) {
      logger.error(`Status check error: ${error.message}`);
      return handleError(res, 500, 'Failed to check record status', 'STATUS_CHECK_ERROR', error.message);
    }
  })
);

// GET /api/v1/attendance/pending - Get pending sync records
router.get(
  '/pending',
  asyncHandler(async (req, res) => {
    try {
      const pendingRecords = await cacheService.getPendingAttendance();

      res.json({
        status: 'success',
        data: {
          count: pendingRecords.length,
          records: pendingRecords
        }
      });
    } catch (error) {
      logger.error(`Pending records fetch error: ${error.message}`);
      return handleError(res, 500, 'Failed to fetch pending records', 'FETCH_ERROR', error.message);
    }
  })
);

module.exports = router;
