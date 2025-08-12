const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { asyncHandler, handleError } = require('../middleware/errorHandler');
const deviceService = require('../services/deviceService');

// GET /api/v1/devices - List devices
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const devices = await deviceService.listDevices();
    res.json(devices);
  })
);

// POST /api/v1/devices - Register device
router.post(
  '/',
  [
    body('username').notEmpty().withMessage('Username is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('device_type').notEmpty().withMessage('Device type is required'),
    body('device_model').optional(),
    body('description').optional()
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return handleError(res, 400, 'Validation failed', 'VALIDATION_ERROR', errors.array());
    }

    try {
      const device = await deviceService.createDevice(req.body);
      res.status(201).json(device);
    } catch (error) {
      return handleError(res, 400, error.message, 'DEVICE_CREATION_ERROR');
    }
  })
);

// PUT /api/v1/devices/:id - Update device
router.put(
  '/:id',
  [
    body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('device_type').optional(),
    body('device_model').optional(),
    body('description').optional(),
    body('is_active').optional().isBoolean()
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return handleError(res, 400, 'Validation failed', 'VALIDATION_ERROR', errors.array());
    }

    const deviceId = req.params.id;
    const updateData = req.body;

    try {
      // For password update, hash it before saving
      if (updateData.password) {
        const bcrypt = require('bcryptjs');
        const saltRounds = 12;
        updateData.password_hash = await bcrypt.hash(updateData.password, saltRounds);
        delete updateData.password;
      }

      const updatedDevice = await deviceService.updateDevice(deviceId, updateData);
      if (!updatedDevice) {
        return handleError(res, 404, 'Device not found', 'DEVICE_NOT_FOUND');
      }
      res.json(updatedDevice);
    } catch (error) {
      return handleError(res, 400, error.message, 'DEVICE_UPDATE_ERROR');
    }
  })
);

// DELETE /api/v1/devices/:id - Delete device
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const deviceId = req.params.id;
    try {
      await deviceService.deleteDevice(deviceId);
      res.status(204).send();
    } catch (error) {
      return handleError(res, 400, error.message, 'DEVICE_DELETE_ERROR');
    }
  })
);

module.exports = router;