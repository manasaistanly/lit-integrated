const Coupon = require('../models/Coupon');
const Joi = require('joi');

// Constants
const CONSTANTS = {
  COUPON_LENGTH: 8,
  DEFAULT_DISCOUNT: 10,
  EXPIRY_DAYS: 15,
  MAX_ACTIVE_COUPONS: 1
};

// Validation schemas
const createCouponSchema = Joi.object({
  userId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid user ID format'
    })
});

const validateCouponSchema = Joi.object({
  userId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required(),
  code: Joi.string()
    .length(CONSTANTS.COUPON_LENGTH)
    .required()
    .messages({
      'string.length': `Coupon code must be ${CONSTANTS.COUPON_LENGTH} characters long`
    })
});

// Helper for consistent response format
function formatResponse(success, data = null, error = null) {
  return {
    success,
    ...(data && { data }),
    ...(error && { error })
  };
}

// Generate a cryptographically secure coupon code
function generateCouponCode() {
  const crypto = require('crypto');
  return crypto
    .randomBytes(Math.ceil(CONSTANTS.COUPON_LENGTH / 2))
    .toString('hex')
    .toUpperCase()
    .slice(0, CONSTANTS.COUPON_LENGTH);
}

/**
 * Create a new coupon
 * @route POST /api/coupons
 */
exports.createCoupon = async (req, res) => {
  try {
    // Validate request
    const { error } = createCouponSchema.validate(req.body);
    if (error) {
      return res.status(400).json(
        formatResponse(false, null, error.details[0].message)
      );
    }

    const { userId } = req.body;

    // Check for existing active coupons
    const activeCouponsCount = await Coupon.countDocuments({
      userId,
      status: 'active',
      expiresAt: { $gt: new Date() }
    });

    if (activeCouponsCount >= CONSTANTS.MAX_ACTIVE_COUPONS) {
      return res.status(400).json(
        formatResponse(false, null, 'Active coupon already exists')
      );
    }

    // Create new coupon
    const code = generateCouponCode();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + CONSTANTS.EXPIRY_DAYS);

    const coupon = await Coupon.create({
      code,
      userId,
      discountType: 'percent',
      discountValue: CONSTANTS.DEFAULT_DISCOUNT,
      expiresAt,
      status: 'active'
    });

    res.json(formatResponse(true, {
      code: coupon.code,
      discountValue: coupon.discountValue,
      expiresAt: coupon.expiresAt
    }));
  } catch (err) {
    console.error("Coupon creation error:", err);
    res.status(500).json(
      formatResponse(false, null, 'Failed to create coupon')
    );
  }
};

/**
 * Validate a coupon
 * @route POST /api/coupons/validate
 */
exports.validateCoupon = async (req, res) => {
  try {
    const { error } = validateCouponSchema.validate(req.body);
    if (error) {
      return res.status(400).json(
        formatResponse(false, null, error.details[0].message)
      );
    }

    const { userId, code } = req.body;

    const coupon = await Coupon.findOne({ code, userId });
    if (!coupon) {
      return res.status(404).json(
        formatResponse(false, null, 'Coupon not found')
      );
    }

    if (coupon.status !== 'active') {
      return res.status(400).json(
        formatResponse(false, null, 'Coupon has already been used')
      );
    }

    if (coupon.expiresAt < new Date()) {
      coupon.status = 'expired';
      await coupon.save();
      return res.status(400).json(
        formatResponse(false, null, 'Coupon has expired')
      );
    }

    res.json(formatResponse(true, {
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      expiresAt: coupon.expiresAt,
      status: coupon.status
    }));
  } catch (err) {
    console.error("Coupon validation error:", err);
    res.status(500).json(
      formatResponse(false, null, 'Failed to validate coupon')
    );
  }
};

/**
 * Mark a coupon as used
 * @route POST /api/coupons/use
 */
exports.markCouponUsed = async (req, res) => {
  try {
    const { error } = validateCouponSchema.validate(req.body);
    if (error) {
      return res.status(400).json(
        formatResponse(false, null, error.details[0].message)
      );
    }

    const { userId, code } = req.body;

    const coupon = await Coupon.findOne({ code, userId });
    if (!coupon) {
      return res.status(404).json(
        formatResponse(false, null, 'Coupon not found')
      );
    }

    if (coupon.status !== 'active' || coupon.expiresAt < new Date()) {
      coupon.status = 'expired';
      await coupon.save();
      return res.status(400).json(
        formatResponse(false, null, 'Coupon is not valid')
      );
    }

    coupon.status = 'used';
    coupon.usedAt = new Date();
    await coupon.save();

    res.json(formatResponse(true, { message: 'Coupon marked as used' }));
  } catch (err) {
    console.error("Mark coupon used error:", err);
    res.status(500).json(
      formatResponse(false, null, 'Failed to mark coupon as used')
    );
  }
};

/**
 * Get user's coupons
 * @route GET /api/coupons/user
 */
exports.getUserCoupons = async (req, res) => {
  try {
    const { error } = createCouponSchema.validate({ userId: req.query.userId });
    if (error) {
      return res.status(400).json(
        formatResponse(false, null, error.details[0].message)
      );
    }

    const { userId } = req.query;

    const coupons = await Coupon.find({ userId })
      .select('-__v')
      .sort({ createdAt: -1 })
      .lean();

    // Update expired coupons
    const now = new Date();
    const expiredCoupons = coupons.filter(
      c => c.status === 'active' && c.expiresAt < now
    );

    if (expiredCoupons.length > 0) {
      await Coupon.updateMany(
        {
          _id: { $in: expiredCoupons.map(c => c._id) }
        },
        {
          status: 'expired'
        }
      );
    }

    res.json(formatResponse(true, { coupons }));
  } catch (err) {
    console.error("Get user coupons error:", err);
    res.status(500).json(
      formatResponse(false, null, 'Could not fetch coupons')
    );
  }
};
