const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { handleError, asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// POST /api/v1/biometrics/register
router.post(
  '/register',
  [
    body('employee_id').notEmpty().withMessage('Employee ID is required'),
    body('template_hash').notEmpty().isHexadecimal().withMessage('Template hash required (hex)'),
    body('registered_at').optional().isISO8601().withMessage('Invalid registration timestamp')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return handleError(res, 400, 'Validation failed', 'VALIDATION_ERROR', errors.array());
    }
    // Store only hash and metadata for audit
    logger.info(`Biometric registered: ${req.body.employee_id}, hash: ${req.body.template_hash}`);
    res.json({
      status: 'success',
      message: 'Biometric template metadata registered'
    });
  })
);

// POST /api/v1/biometrics/verify
router.post(
  '/verify',
  [
    body('employee_id').notEmpty().withMessage('Employee ID is required'),
    body('template_hash').notEmpty().isHexadecimal().withMessage('Template hash required (hex)')
  ],
  asyncHandler(async (req, res) => {
    // In production, verification is local on the device
    // This endpoint is for audit/logging only
    logger.info(`Biometric verification event: ${req.body.employee_id}, hash: ${req.body.template_hash}`);
    res.json({
      status: 'verified',
      message: 'Biometric verification event logged'
    });
  })
);

module.exports = router;