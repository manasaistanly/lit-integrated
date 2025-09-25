const express = require('express');
const router = express.Router();
const Coupon = require('../models/Coupon');
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');

// Rate limiting configuration
const couponLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 requests per windowMs
  message: 'Too many coupon requests, please try again later'
});

// Validation schemas
const schemas = {
  validate: Joi.object({
    code: Joi.string().trim().length(8).required(),
    userId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required()
  }),
  
  markUsed: Joi.object({
    code: Joi.string().trim().length(8).required(),
    userId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required()
  }),
  
  create: Joi.object({
    userId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required()
  })
};

// Middleware for request validation
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

/**
 * Validate coupon
 * @route POST /api/coupons/validate
 */
router.post('/validate',
  auth,
  couponLimiter,
  validateRequest(schemas.validate),
  async (req, res) => {
    try {
      const { code, userId } = req.body;

      const coupon = await Coupon.findOne({
        code: code.trim().toUpperCase(),
        userId
      });

      if (!coupon) {
        return res.status(404).json({
          success: false,
          error: 'Invalid or expired coupon code'
        });
      }

      // Mark as expired if past expiration
      if (coupon.expiresAt && coupon.expiresAt < new Date()) {
        coupon.status = 'expired';
        await coupon.save();
        return res.status(400).json({
          success: false,
          error: 'Coupon code has expired'
        });
      }

      if (coupon.status !== 'active') {
        return res.status(400).json({
          success: false,
          error: 'Coupon already used or expired'
        });
      }

      res.json({
        success: true,
        data: {
          code: coupon.code,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          expiresAt: coupon.expiresAt,
          status: coupon.status
        }
      });
    } catch (err) {
      console.error('Coupon validation error:', err);
      res.status(500).json({
        success: false,
        error: 'Server error validating coupon'
      });
    }
  }
);

/**
 * Mark coupon as used
 * @route POST /api/coupons/mark-used
 */
router.post('/mark-used',
  auth,
  couponLimiter,
  validateRequest(schemas.markUsed),
  async (req, res) => {
    try {
      const { code, userId } = req.body;

      const coupon = await Coupon.findOne({
        code: code.trim().toUpperCase(),
        userId
      });

      if (!coupon) {
        return res.status(404).json({
          success: false,
          error: 'Coupon not found'
        });
      }

      if (coupon.status !== 'active' || 
          (coupon.expiresAt && coupon.expiresAt < new Date())) {
        coupon.status = 'expired';
        await coupon.save();
        return res.status(400).json({
          success: false,
          error: 'Coupon is not valid'
        });
      }

      coupon.status = 'used';
      coupon.usedAt = new Date();
      await coupon.save();

      res.json({
        success: true,
        message: 'Coupon marked as used'
      });
    } catch (err) {
      console.error('Mark coupon used error:', err);
      res.status(500).json({
        success: false,
        error: 'Server error marking coupon as used'
      });
    }
  }
);

/**
 * Create new coupon
 * @route POST /api/coupons/create
 */
router.post('/create',
  auth,
  couponLimiter,
  validateRequest(schemas.create),
  async (req, res) => {
    try {
      const { userId } = req.body;

      // Check for existing active coupon
      const hasActive = await Coupon.findOne({
        userId,
        status: 'active',
        expiresAt: { $gt: new Date() }
      });

      if (hasActive) {
        return res.status(400).json({
          success: false,
          error: 'Active coupon already exists'
        });
      }

      const code = require('crypto')
        .randomBytes(4)
        .toString('hex')
        .toUpperCase();
      
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 15); // 15 days

      const coupon = await Coupon.create({
        code,
        userId,
        discountType: 'percent',
        discountValue: 10,
        expiresAt,
        status: 'active'
      });

      res.json({
        success: true,
        data: coupon
      });
    } catch (err) {
      console.error('Create coupon error:', err);
      res.status(500).json({
        success: false,
        error: 'Server error creating coupon'
      });
    }
  }
);

/**
 * Get user's coupons
 * @route GET /api/coupons/my-coupons
 */
router.get('/my-coupons',
  auth,
  couponLimiter,
  async (req, res) => {
    try {
      const { userId } = req.query;

      if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid user ID format'
        });
      }

      const coupons = await Coupon.find({ userId })
        .sort({ createdAt: -1 })
        .lean();

      // Update expired coupons status
      const now = new Date();
      const expiredCoupons = coupons.filter(
        c => c.status === 'active' && c.expiresAt < now
      );

      if (expiredCoupons.length > 0) {
        await Coupon.updateMany(
          { _id: { $in: expiredCoupons.map(c => c._id) } },
          { status: 'expired' }
        );
      }

      res.json({
        success: true,
        data: coupons
      });
    } catch (err) {
      console.error('Fetch coupons error:', err);
      res.status(500).json({
        success: false,
        error: 'Server error fetching coupons'
      });
    }
  }
);

module.exports = router;
