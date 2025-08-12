const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const syncService = require('../services/syncService');

// Helper function to normalize config from snake_case to camelCase
function normalizeConfig(config) {
  const normalized = {};

  // Handle sync_interval conversion (seconds to milliseconds)
  if (config.sync_interval !== undefined) {
    normalized.syncInterval = parseInt(config.sync_interval, 10) * 1000; // Convert seconds to ms
  }

  // Handle batch_size conversion
  if (config.batch_size !== undefined) {
    normalized.batchSize = parseInt(config.batch_size, 10);
  }

  // Handle max_retries conversion
  if (config.max_retries !== undefined) {
    normalized.maxRetries = parseInt(config.max_retries, 10);
  }

  // Also handle camelCase versions if they're sent directly
  if (config.syncInterval !== undefined) {
    normalized.syncInterval = parseInt(config.syncInterval, 10);
  }

  if (config.batchSize !== undefined) {
    normalized.batchSize = parseInt(config.batchSize, 10);
  }

  if (config.maxRetries !== undefined) {
    normalized.maxRetries = parseInt(config.maxRetries, 10);
  }

  return normalized;
}


// POST /api/v1/sync/employees - Batch employee sync
router.post(
  '/employees',
  asyncHandler(async (req, res) => {
    const result = await syncService.batchSyncEmployees(req.body);
    res.json(result);
  })
);

// POST /api/v1/sync/attendance - Batch attendance sync
router.post(
  '/attendance',
  asyncHandler(async (req, res) => {
    const result = await syncService.batchSyncAttendance(req.body);
    res.json(result);
  })
);

// GET /api/v1/sync/batch/:batch_id - Get batch status
router.get(
  '/batch/:batch_id',
  asyncHandler(async (req, res) => {
    const batchStatus = await syncService.getBatchStatus(req.params.batch_id);
    res.json(batchStatus);
  })
);

// POST /api/v1/sync/cleanup - Cleanup old records
router.post(
  '/cleanup',
  asyncHandler(async (req, res) => {
    const cleanupResult = await syncService.cleanupOldRecords();
    res.json(cleanupResult);
  })
);

// PUT /api/v1/sync/config - Update sync config
router.put(
  '/config',
  asyncHandler(async (req, res) => {
    const updatedConfig = await syncService.updateSyncConfig(req.body);
    res.json(updatedConfig);
  })
);

// Additional useful endpoints
// GET /api/v1/sync/status - Get sync service status
router.get(
  '/status',
  asyncHandler(async (req, res) => {
    const status = await syncService.getSyncStats();
    res.json(status);
  })
);

// POST /api/v1/sync/trigger - Manual sync trigger
router.post(
  '/trigger',
  asyncHandler(async (req, res) => {
    const result = await syncService.triggerSync();
    res.json(result);
  })
);

// POST /api/v1/sync/retry - Retry failed records
router.post(
  '/retry',
  asyncHandler(async (req, res) => {
    const result = await syncService.retryFailedRecords();
    res.json(result);
  })
);

module.exports = router;