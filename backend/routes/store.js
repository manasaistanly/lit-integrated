const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');

// Constants
const RATE_LIMITS = {
  BROWSE_WINDOW: 15 * 60 * 1000, // 15 minutes
  PURCHASE_WINDOW: 15 * 60 * 1000,
  BROWSE_MAX: 100,
  PURCHASE_MAX: 30
};

// Rate limiting configuration
const purchaseLimiter = rateLimit({
  windowMs: RATE_LIMITS.PURCHASE_WINDOW,
  max: RATE_LIMITS.PURCHASE_MAX,
  message: {
    success: false,
    error: 'Too many purchase attempts, please try again later'
  }
});

const browseLimiter = rateLimit({
  windowMs: RATE_LIMITS.BROWSE_WINDOW,
  max: RATE_LIMITS.BROWSE_MAX,
  message: {
    success: false,
    error: 'Too many browsing requests, please try again later'
  }
});

// Validation schemas
const schemas = {
  purchase: Joi.object({
    userId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        'string.pattern.base': 'Invalid user ID format',
        'any.required': 'User ID is required'
      }),
    packIndex: Joi.number()
      .integer()
      .min(0)
      .required()
      .messages({
        'number.base': 'Pack index must be a number',
        'number.min': 'Invalid pack selection',
        'any.required': 'Pack selection is required'
      })
  })
};

// Validation middleware
const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }
    next();
  };
};

// Async handler wrapper
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Get available gem packs
 * @route GET /api/store/gems
 * @security JWT
 */
router.get('/gems',
  auth,
  browseLimiter,
  asyncHandler(async (req, res) => {
    const packs = await storeController.getGemPacks();
    res.json({
      success: true,
      data: packs
    });
  })
);

/**
 * Get available life packs
 * @route GET /api/store/lives
 * @security JWT
 */
router.get('/lives',
  auth,
  browseLimiter,
  asyncHandler(async (req, res) => {
    const packs = await storeController.getLifePacks();
    res.json({
      success: true,
      data: packs
    });
  })
);

/**
 * Get available streak packs
 * @route GET /api/store/streaks
 * @security JWT
 */
router.get('/streaks',
  auth,
  browseLimiter,
  asyncHandler(async (req, res) => {
    const packs = await storeController.getStreakPacks();
    res.json({
      success: true,
      data: packs
    });
  })
);

/**
 * Purchase lives pack
 * @route POST /api/store/buy-lives
 * @security JWT
 */
router.post('/buy-lives',
  auth,
  purchaseLimiter,
  validateRequest(schemas.purchase),
  asyncHandler(async (req, res) => {
    // Ensure user can only purchase for themselves
    if (req.user.id !== req.body.userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized purchase attempt'
      });
    }
    
    await storeController.buyLives(req, res);
  })
);

/**
 * Purchase streak pack
 * @route POST /api/store/buy-streak
 * @security JWT
 */
router.post('/buy-streak',
  auth,
  purchaseLimiter,
  validateRequest(schemas.purchase),
  asyncHandler(async (req, res) => {
    // Ensure user can only purchase for themselves
    if (req.user.id !== req.body.userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized purchase attempt'
      });
    }
    
    await storeController.buyStreak(req, res);
  })
);

/**
 * Get purchase history
 * @route GET /api/store/history
 * @security JWT
 */
router.get('/history',
  auth,
  browseLimiter,
  asyncHandler(async (req, res) => {
    const history = await storeController.getPurchaseHistory(req.user.id);
    res.json({
      success: true,
      data: history
    });
  })
);

/**
 * Get user's store status
 * @route GET /api/store/status
 * @security JWT
 */
router.get('/status',
  auth,
  browseLimiter,
  asyncHandler(async (req, res) => {
    const status = await storeController.getUserStoreStatus(req.user.id);
    res.json({
      success: true,
      data: status
    });
  })
);

// Error handling middleware
router.use((err, req, res, next) => {
  console.error('Store route error:', err);
  res.status(500).json({
    success: false,
    error: 'Store operation failed',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = router;
