const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { getLastSyncStatus, getBasicStatus, getDetailedStatus } = require('../services/syncStatusService');
const { verifyJWT } = require('../middleware/jwtAuth');

// GET /api/v1/status - Basic status
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const status = getBasicStatus();
    res.json(status);
  })
);

// GET /api/v1/status/detailed - Detailed status (requires auth)
router.get(
  '/detailed',
  verifyJWT,
  asyncHandler(async (req, res) => {
    const detailedStatus = getDetailedStatus();
    res.json(detailedStatus);
  })
);

// Existing endpoint: GET /api/v1/status/sync
router.get(
  '/sync',
  asyncHandler(async (req, res) => {
    const status = await getLastSyncStatus();
    res.json(status);
  })
);

module.exports = router;