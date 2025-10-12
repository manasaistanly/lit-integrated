const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');

// Rate limiting configuration
const purchaseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: { 
    success: false, 
    error: 'Too many purchase attempts, please try again later' 
  },
  standardHeaders: true,
  legacyHeaders: false
});

const browseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { 
    success: false, 
    error: 'Too many requests, please try again later' 
  },
  standardHeaders: true,
  legacyHeaders: false
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { 
    success: false, 
    error: 'Too many payment requests, please try again later' 
  },
  standardHeaders: true,
  legacyHeaders: false
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
        'number.integer': 'Pack index must be an integer',
        'number.min': 'Invalid pack selection',
        'any.required': 'Pack index is required'
      })
  }),
  
  gemPurchase: Joi.object({
    userId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required(),
    packIndex: Joi.number()
      .integer()
      .min(0)
      .required(),
    isSpecialOffer: Joi.boolean()
      .default(false)
  }),

  paymentVerification: Joi.object({
    userId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required(),
    packIndex: Joi.number()
      .integer()
      .min(0)
      .required(),
    isSpecialOffer: Joi.boolean()
      .default(false),
    razorpay_order_id: Joi.string().required(),
    razorpay_payment_id: Joi.string().required(),
    razorpay_signature: Joi.string().required()
  }),

  refund: Joi.object({
    paymentId: Joi.string().required(),
    userId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required(),
    gemsToDeduct: Joi.number()
      .integer()
      .min(0)
      .required()
  }),
  
  userId: Joi.object({
    userId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
  })
};

// Validation middleware
const validateRequest = (schema, source = 'body') => {
  return (req, res, next) => {
    const data = source === 'body' ? req.body : req.query;
    const { error } = schema.validate(data);
    
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }
    next();
  };
};

// Authorization middleware - ensures user can only act on their own account
const authorizeUserAction = (req, res, next) => {
  const requestUserId = req.body.userId || req.query.userId || req.params.userId;
  
  if (req.user.id !== requestUserId) {
    return res.status(403).json({
      success: false,
      error: 'Unauthorized: You can only perform actions on your own account'
    });
  }
  next();
};

// Async handler
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ===== BROWSE ROUTES =====

/**
 * @route   GET /api/store/gems
 * @desc    Get available gem packs with tier pricing
 * @access  Private
 */
router.get('/gems',
  auth,
  browseLimiter,
  asyncHandler(async (req, res) => {
    const userTier = req.user?.tier || 'bronze';
    const packs = await storeController.getGemPacks(userTier);
    res.json({
      success: true,
      data: packs
    });
  })
);

/**
 * @route   GET /api/store/lives
 * @desc    Get available life packs
 * @access  Private
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
 * @route   GET /api/store/streaks
 * @desc    Get available streak packs
 * @access  Private
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
 * @route   GET /api/store/special-offers
 * @desc    Get active special offers
 * @access  Private
 */
router.get('/special-offers',
  auth,
  browseLimiter,
  asyncHandler(async (req, res) => {
    const offers = await storeController.getSpecialOffers();
    res.json({
      success: true,
      data: offers
    });
  })
);

/**
 * @route   GET /api/store/all
 * @desc    Get all available packs (gems, lives, streaks, offers)
 * @access  Private
 */
router.get('/all',
  auth,
  browseLimiter,
  asyncHandler(async (req, res) => {
    const userTier = req.user?.tier || 'bronze';
    const allItems = await storeController.getAllStoreItems(userTier);
    
    res.json({
      success: true,
      data: allItems
    });
  })
);

// ===== PURCHASE ROUTES (Using Gems) =====

/**
 * @route   POST /api/store/buy-lives
 * @desc    Purchase lives pack using gems
 * @access  Private
 */
router.post('/buy-lives',
  auth,
  purchaseLimiter,
  validateRequest(schemas.purchase, 'body'),
  authorizeUserAction,
  asyncHandler(async (req, res) => {
    const result = await storeController.buyLives(req.body.userId, req.body.packIndex);
    res.json({
      success: true,
      data: result
    });
  })
);

/**
 * @route   POST /api/store/buy-streak
 * @desc    Purchase streak pack using gems
 * @access  Private
 */
router.post('/buy-streak',
  auth,
  purchaseLimiter,
  validateRequest(schemas.purchase, 'body'),
  authorizeUserAction,
  asyncHandler(async (req, res) => {
    const result = await storeController.buyStreak(req.body.userId, req.body.packIndex);
    res.json({
      success: true,
      data: result
    });
  })
);

// ===== GEM PURCHASE ROUTES (Razorpay Integration) =====

/**
 * @route   POST /api/store/buy-gems
 * @desc    Create Razorpay order for gem purchase
 * @access  Private
 */
router.post('/buy-gems',
  auth,
  paymentLimiter,
  validateRequest(schemas.gemPurchase, 'body'),
  authorizeUserAction,
  asyncHandler(async (req, res) => {
    const { userId, packIndex, isSpecialOffer = false } = req.body;
    
    const orderData = await storeController.createGemPurchaseOrder(
      userId, 
      packIndex,
      isSpecialOffer
    );
    res.json({
      success: true,
      data: orderData
    });
  })
);

/**
 * @route   POST /api/store/gems/create-order
 * @desc    Create Razorpay order for gem purchase (alternative endpoint)
 * @access  Private
 */
router.post('/gems/create-order',
  auth,
  paymentLimiter,
  validateRequest(schemas.gemPurchase, 'body'),
  authorizeUserAction,
  asyncHandler(async (req, res) => {
    const { userId, packIndex, isSpecialOffer = false } = req.body;
    
    const orderData = await storeController.createGemPurchaseOrder(
      userId, 
      packIndex,
      isSpecialOffer
    );
    res.json({
      success: true,
      data: orderData
    });
  })
);

/**
 * @route   POST /api/store/gems/verify-payment
 * @desc    Verify Razorpay payment and credit gems
 * @access  Private
 */
router.post('/gems/verify-payment',
  auth,
  paymentLimiter,
  validateRequest(schemas.paymentVerification, 'body'),
  authorizeUserAction,
  asyncHandler(async (req, res) => {
    const { 
      userId, 
      packIndex, 
      isSpecialOffer = false,
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature 
    } = req.body;
    
    const result = await storeController.verifyAndCreditGems(
      userId,
      packIndex,
      { razorpay_order_id, razorpay_payment_id, razorpay_signature },
      isSpecialOffer
    );
    
    res.json(result);
  })
);

/**
 * @route   POST /api/store/gems/refund
 * @desc    Refund a gem purchase (admin only)
 * @access  Private/Admin
 */
router.post('/gems/refund',
  auth,
  // Add admin middleware here: adminOnly,
  validateRequest(schemas.refund, 'body'),
  asyncHandler(async (req, res) => {
    const { paymentId, userId, gemsToDeduct } = req.body;
    
    const result = await storeController.refundGemPurchase(
      paymentId,
      userId,
      gemsToDeduct
    );
    
    res.json(result);
  })
);

// ===== USER STATUS ROUTES =====

/**
 * @route   GET /api/store/status
 * @desc    Get user's shop status (gems, lives, currency)
 * @access  Private
 */
router.get('/status',
  auth,
  browseLimiter,
  asyncHandler(async (req, res) => {
    const status = await storeController.getUserShopStatus(req.user.id);
    res.json({
      success: true,
      data: status
    });
  })
);

/**
 * @route   GET /api/store/status/:userId
 * @desc    Get specific user's shop status (admin can view any user)
 * @access  Private
 */
router.get('/status/:userId',
  auth,
  browseLimiter,
  asyncHandler(async (req, res) => {
    // Check if user is accessing their own status or is admin
    if (req.user.id !== req.params.userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized access'
      });
    }
    
    const status = await storeController.getUserShopStatus(req.params.userId);
    res.json({
      success: true,
      data: status
    });
  })
);

/**
 * @route   GET /api/store/history
 * @desc    Get purchase history for authenticated user
 * @access  Private
 */
router.get('/history',
  auth,
  browseLimiter,
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    const history = await storeController.getPurchaseHistory(
      req.user.id, 
      { page, limit }
    );
    
    res.json({
      success: true,
      data: history
    });
  })
);

/**
 * @route   GET /api/store/history/:userId
 * @desc    Get purchase history for specific user (admin only)
 * @access  Private/Admin
 */
router.get('/history/:userId',
  auth,
  // Add admin middleware here: adminOnly,
  browseLimiter,
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    const history = await storeController.getPurchaseHistory(
      req.params.userId, 
      { page, limit }
    );
    
    res.json({
      success: true,
      data: history
    });
  })
);

// ===== ADMIN ROUTES =====

/**
 * @route   GET /api/store/analytics
 * @desc    Get store analytics (admin only)
 * @access  Private/Admin
 */
router.get('/analytics',
  auth,
  // Add admin middleware here: adminOnly,
  browseLimiter,
  asyncHandler(async (req, res) => {
    const analytics = await storeController.getStoreAnalytics();
    res.json({
      success: true,
      data: analytics
    });
  })
);

// ===== WEBHOOK ROUTE =====

/**
 * @route   POST /api/store/webhook
 * @desc    Handle Razorpay webhooks
 * @access  Public (with signature verification)
 * @note    This should be registered BEFORE express.json() middleware in main app
 */
router.post('/webhook',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    
    if (!signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing webhook signature'
      });
    }

    let payload;
    if (Buffer.isBuffer(req.body)) {
      payload = JSON.parse(req.body.toString());
    } else {
      payload = req.body;
    }
    
    try {
      await storeController.handleWebhook(payload, signature);
      res.json({ 
        success: true, 
        message: 'Webhook processed successfully' 
      });
    } catch (error) {
      console.error('Webhook processing error:', error);
      res.status(400).json({
        success: false,
        error: 'Webhook processing failed'
      });
    }
  })
);

// ===== ERROR HANDLER =====

router.use((err, req, res, next) => {
  // Log error with details
  const errorLog = {
    message: err.message,
    name: err.name,
    statusCode: err.statusCode,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  };
  
  console.error('Store route error:', errorLog);
  
  // Handle StoreError from controller
  if (err.name === 'StoreError') {
    return res.status(err.statusCode || 400).json({
      success: false,
      error: err.message
    });
  }

  // Handle Joi validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: err.details
    });
  }

  // Handle Mongoose validation errors
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: 'Invalid ID format'
    });
  }
  
  // Generic error response
  const statusCode = err.statusCode || 500;
  
  res.status(statusCode).json({
    success: false,
    error: err.message || 'Store operation failed',
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      details: err.details 
    })
  });
});

module.exports = router;