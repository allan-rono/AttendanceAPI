
const express = require('express');
const router = express.Router();
const { query, validationResult } = require('express-validator');
const { handleError, asyncHandler } = require('../middleware/errorHandler');
const erpnext = require('../services/erpnextService');
const logger = require('../utils/logger');

// GET /api/v1/sites - Retrieve all sites from ERPNext
router.get(
  '/',
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Limit must be between 1 and 1000'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer'),
    query('search')
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage('Search term must be between 1 and 100 characters'),
    query('status')
      .optional()
      .isIn(['Active', 'Inactive'])
      .withMessage('Status must be either Active or Inactive')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return handleError(res, 400, 'Validation failed', 'VALIDATION_ERROR', errors.array());
    }

    const { limit, offset, search, status } = req.query;
    
    try {
      const result = await erpnext.getSites({
        limit: limit ? parseInt(limit) : 100,
        offset: offset ? parseInt(offset) : 0,
        search,
        status
      });

      if (!result.success) {
        logger.error('Failed to fetch sites from ERPNext:', result.error);
        return handleError(res, 500, 'Failed to fetch sites', 'ERP_ERROR', result.error);
      }

      res.json({
        status: 'success',
        data: {
          sites: result.data || [],
          total: result.total || 0,
          limit: limit ? parseInt(limit) : 100,
          offset: offset ? parseInt(offset) : 0
        },
        message: 'Sites retrieved successfully'
      });

    } catch (error) {
      logger.error('Error in sites endpoint:', error);
      return handleError(res, 500, 'Internal server error', 'INTERNAL_ERROR', error.message);
    }
  })
);

// GET /api/v1/sites/:id - Retrieve a specific site by ID
router.get(
  '/:id',
  [
    query('id')
      .notEmpty()
      .withMessage('Site ID is required')
  ],
  asyncHandler(async (req, res) => {
    const siteId = req.params.id;
    
    if (!siteId) {
      return handleError(res, 400, 'Site ID is required', 'VALIDATION_ERROR');
    }

    try {
      const result = await erpnext.getSiteById(siteId);

      if (!result.success) {
        if (result.status === 404) {
          return handleError(res, 404, 'Site not found', 'SITE_NOT_FOUND');
        }
        logger.error('Failed to fetch site from ERPNext:', result.error);
        return handleError(res, 500, 'Failed to fetch site', 'ERP_ERROR', result.error);
      }

      res.json({
        status: 'success',
        data: {
          site: result.data
        },
        message: 'Site retrieved successfully'
      });

    } catch (error) {
      logger.error('Error in site detail endpoint:', error);
      return handleError(res, 500, 'Internal server error', 'INTERNAL_ERROR', error.message);
    }
  })
);

module.exports = router;
