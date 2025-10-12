const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const { validateRequest } = require('../middleware/validateRequest');
const Joi = require('joi');

// Rate limiting configuration
const couponLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: 'Too many coupon requests, please try again later'
});

// Stricter rate limit for redemption (prevent abuse)
const redemptionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Only 5 redemptions per hour
  message: 'Too many redemption attempts, please try again later'
});

// Application rate limit (prevent coupon spam)
const applicationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: 'Too many coupon applications, please try again later'
});

// Input validation schemas
const objectIdPattern = /^[0-9a-fA-F]{24}$/;

const validationSchemas = {
  redeemCoupon: Joi.object({
    userId: Joi.string().pattern(objectIdPattern).required(),
    pointsToRedeem: Joi.number().integer().min(50000).required()
  }),
  
  createCoupon: Joi.object({
    userId: Joi.string().pattern(objectIdPattern).required(),
    discountValue: Joi.number().min(1).max(100).optional(),
    expiryDays: Joi.number().min(1).max(365).optional(),
    type: Joi.string().valid('game_reward', 'promotional', 'referral', 'admin').optional()
  }),
  
  validateCoupon: Joi.object({
    userId: Joi.string().pattern(objectIdPattern).required(),
    code: Joi.string().length(8).uppercase().required()
  }),
  
  applyCoupon: Joi.object({
    userId: Joi.string().pattern(objectIdPattern).required(),
    code: Joi.string().length(8).uppercase().required(),
    orderAmount: Joi.number().min(0).required()
  }),
  
  getUserCoupons: Joi.object({
    userId: Joi.string().pattern(objectIdPattern).required()
  }),
  
  checkEligibility: Joi.object({
    userId: Joi.string().pattern(objectIdPattern).required()
  })
};

// ===== COUPON REDEMPTION ROUTES =====

/**
 * @route   POST /api/coupons/redeem
 * @desc    Redeem a coupon using 50,000 game points
 * @access  Private
 */
router.post('/redeem',
  auth,
  redemptionLimiter,
  validateRequest(validationSchemas.redeemCoupon),
  couponController.redeemCouponWithPoints
);

/**
 * @route   GET /api/coupons/can-redeem
 * @desc    Check if user has enough points to redeem a coupon
 * @access  Private
 */
router.get('/can-redeem',
  auth,
  couponLimiter,
  validateRequest(validationSchemas.checkEligibility, 'query'),
  couponController.checkRedeemEligibility
);

// ===== COUPON MANAGEMENT ROUTES =====

/**
 * @route   POST /api/coupons/create
 * @desc    Create a promotional coupon (admin only)
 * @access  Private/Admin
 */
router.post('/create',
  auth,
  // adminAuth, // Add admin middleware if you have one
  couponLimiter,
  validateRequest(validationSchemas.createCoupon),
  couponController.createCoupon
);

/**
 * @route   POST /api/coupons/validate
 * @desc    Validate a coupon code
 * @access  Private
 */
router.post('/validate',
  auth,
  couponLimiter,
  validateRequest(validationSchemas.validateCoupon),
  couponController.validateCoupon
);

/**
 * @route   POST /api/coupons/apply
 * @desc    Apply coupon to order (marks as used)
 * @access  Private
 */
router.post('/apply',
  auth,
  applicationLimiter,
  validateRequest(validationSchemas.applyCoupon),
  couponController.applyCoupon
);

/**
 * @route   GET /api/coupons/user
 * @desc    Get all coupons for a user
 * @access  Private
 */
router.get('/user',
  auth,
  couponLimiter,
  validateRequest(validationSchemas.getUserCoupons, 'query'),
  couponController.getUserCoupons
);

// ===== UTILITY ROUTES =====

/**
 * @route   GET /api/coupons/stats
 * @desc    Get coupon statistics for user
 * @access  Private
 */
router.get('/stats',
  auth,
  async (req, res, next) => {
    try {
      const Coupon = require('../models/Coupon');
      const { userId } = req.query;
      
      if (!userId || !/^[0-9a-fA-F]{24}$/.test(userId)) {
        return res.status(400).json({
          success: false,
          error: 'Valid userId is required'
        });
      }
      
      const stats = await Coupon.getUserCouponStats(userId);
      
      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/coupons/expire-old
 * @desc    Manually expire old coupons (admin/cron)
 * @access  Private/Admin
 */
router.post('/expire-old',
  auth,
  // adminAuth, // Add admin middleware
  async (req, res, next) => {
    try {
      const Coupon = require('../models/Coupon');
      const count = await Coupon.expireOldCoupons();
      
      res.json({
        success: true,
        data: {
          message: 'Old coupons expired successfully',
          expiredCount: count
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;