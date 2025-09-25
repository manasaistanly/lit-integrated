const express = require('express');
const router = express.Router();
const shopController = require('../controllers/shopController');
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');

// Rate limiting configuration
const purchaseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 purchase requests per windowMs
  message: 'Too many purchase attempts, please try again later'
});

const browseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // More lenient for browsing
  message: 'Too many requests, please try again later'
});

// Validation schemas
const schemas = {
  purchase: Joi.object({
    userId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        'string.pattern.base': 'Invalid user ID format'
      }),
    packIndex: Joi.number()
      .min(0)
      .required()
      .messages({
        'number.min': 'Invalid pack selection'
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

// Error handling middleware
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Get available gem packs
 * @route GET /api/shop/gems
 */
router.get('/gems',
  auth,
  browseLimiter,
  asyncHandler(async (req, res) => {
    const packs = await shopController.getGemPacks();
    res.json({
      success: true,
      data: packs
    });
  })
);

/**
 * Get available life packs
 * @route GET /api/shop/lives
 */
router.get('/lives',
  auth,
  browseLimiter,
  asyncHandler(async (req, res) => {
    const packs = await shopController.getLifePacks();
    res.json({
      success: true,
      data: packs
    });
  })
);

/**
 * Get available streak packs
 * @route GET /api/shop/streaks
 */
router.get('/streaks',
  auth,
  browseLimiter,
  asyncHandler(async (req, res) => {
    const packs = await shopController.getStreakPacks();
    res.json({
      success: true,
      data: packs
    });
  })
);

/**
 * Purchase lives pack
 * @route POST /api/shop/buy-lives
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
    
    await shopController.buyLives(req, res);
  })
);

/**
 * Purchase streak pack
 * @route POST /api/shop/buy-streak
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
    
    await shopController.buyStreak(req, res);
  })
);

/**
 * Get purchase history
 * @route GET /api/shop/history
 */
router.get('/history',
  auth,
  browseLimiter,
  asyncHandler(async (req, res) => {
    const history = await shopController.getPurchaseHistory(req.user.id);
    res.json({
      success: true,
      data: history
    });
  })
);

/**
 * Get user's shop status (gems, lives)
 * @route GET /api/shop/status
 */
router.get('/status',
  auth,
  browseLimiter,
  asyncHandler(async (req, res) => {
    const status = await shopController.getUserShopStatus(req.user.id);
    res.json({
      success: true,
      data: status
    });
  })
);

// Error handler
router.use((err, req, res, next) => {
  console.error('Shop route error:', err);
  res.status(500).json({
    success: false,
    error: 'Shop operation failed',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = router;
