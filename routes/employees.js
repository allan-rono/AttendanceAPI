const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const { handleError, asyncHandler } = require('../middleware/errorHandler');
const erpnext = require('../services/erpnextService');
const logger = require('../utils/logger');

// Helper: Kenyan phone validation
const isKenyanPhone = (value) => /^(\+254|0)?7\d{8}$/.test(value);

// Helper: Kenyan ID validation
const isKenyanId = (value) => /^\d{7,9}$/.test(value);

// GET /api/v1/employees/check-id?id=12345678
router.get(
  '/check-id',
  [
    query('id')
      .notEmpty().withMessage('National ID is required')
      .custom(isKenyanId).withMessage('Invalid Kenyan National ID format')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return handleError(res, 400, 'Validation failed', 'VALIDATION_ERROR', errors.array());
    }
    const nationalId = req.query.id;
    const result = await erpnext.checkNationalID(nationalId);
    const exists = typeof result === 'boolean' ? result : result.exists;
    res.json({
      exists,
      message: exists ? 'National ID already registered' : 'National ID is available'
    });
  })
);

// POST /api/v1/employees/register
router.post(
  '/register',
  [
    body('first_name').notEmpty().isAlpha().withMessage('First name required, letters only'),
    body('last_name').notEmpty().isAlpha().withMessage('Last name required, letters only'),
    body('middle_name').optional().isAlpha().withMessage('Middle name must be letters only'),
    body('custom_national_id').notEmpty().custom(isKenyanId).withMessage('Invalid Kenyan National ID'),
    body('gender').optional().isAlpha().withMessage('Gender must be letters only'),
    body('cell_number').notEmpty().custom(isKenyanPhone).withMessage('Invalid Kenyan phone number'),
    body('personal_email').optional().isEmail().withMessage('Invalid email address'),
    body('date_of_birth').notEmpty().isISO8601().withMessage('Date of birth required (YYYY-MM-DD)'),
    body('date_of_joining').notEmpty().isISO8601().withMessage('Date of joining required (YYYY-MM-DD)'),
    body('company').notEmpty().withMessage('Company is required'),
    body('custom_site').optional(),
    body('status').notEmpty().isIn(['Active', 'Inactive', 'Left']).withMessage('Invalid status')
  ],
    asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return handleError(res, 400, 'Validation failed', 'VALIDATION_ERROR', errors.array());
    }
    
    const data = req.body;
    
    // Check for duplicate National ID - handle both boolean and object responses
    const duplicateCheck = await erpnext.checkNationalID(data.custom_national_id);
    const exists = typeof duplicateCheck === 'boolean' ? duplicateCheck : duplicateCheck.exists;
    
    if (exists) {
      return handleError(res, 409, 'National ID already registered', 'DUPLICATE_ID');
    }
    
    // Register in ERPNext
    const newEmp = await erpnext.registerEmployee({ ...data });
    if (!newEmp.success) {
      return handleError(res, 500, 'Failed to register employee', 'ERP_ERROR', newEmp.error);
    }
    
    res.json({
      status: 'success',
      employee_id: newEmp.data.name, // ERPNext employee ID
      employee_name: newEmp.data.employee_name || `${data.first_name} ${data.last_name}`,
      message: 'Employee registered successfully'
    });
  })
);

module.exports = router;