const Coupon = require('../models/Coupon');
const User = require('../models/User');
const Joi = require('joi');
const logger = require('../utils/logger');
const { AppError, ErrorTypes } = require('../utils/errors');
const mongoose = require('mongoose');


// Constants
const CONSTANTS = {
  COUPON_LENGTH: 8,
  DEFAULT_DISCOUNT: 10,
  EXPIRY_DAYS: 15,
  MAX_ACTIVE_COUPONS: 5,
  POINTS_REQUIRED: 50000, // Points needed to redeem a coupon
  POINTS_DEDUCTION: 50000, // Points deducted when redeeming
  COUPON_TYPES: {
    GAME_REWARD: 'game_reward',
    PROMOTIONAL: 'promotional',
    REFERRAL: 'referral'
  }
};

// Validation schemas
const objectIdPattern = /^[0-9a-fA-F]{24}$/;

const schemas = {
  userId: Joi.string()
    .pattern(objectIdPattern)
    .required()
    .messages({
      'string.pattern.base': 'Invalid user ID format',
      'any.required': 'User ID is required'
    }),
  
  code: Joi.string()
    .length(CONSTANTS.COUPON_LENGTH)
    .uppercase()
    .required()
    .messages({
      'string.length': `Coupon code must be ${CONSTANTS.COUPON_LENGTH} characters`,
      'any.required': 'Coupon code is required'
    }),

  pointsToRedeem: Joi.number()
    .integer()
    .min(CONSTANTS.POINTS_REQUIRED)
    .required()
    .messages({
      'number.min': `Minimum ${CONSTANTS.POINTS_REQUIRED} points required`,
      'any.required': 'Points amount is required'
    })
};

/**
 * Validates and sanitizes request data
 */
function validateRequest(schema, data) {
  const sanitized = mongoSanitize.sanitize(data);
  const { error, value } = schema.validate(sanitized, {
    abortEarly: false,
    stripUnknown: true
  });
  
  if (error) {
    const messages = error.details.map(d => d.message).join(', ');
    throw new AppError(messages, 400, ErrorTypes.VALIDATION_ERROR);
  }
  
  return value;
}

/**
 * Formats API response
 */
function formatResponse(success, data = null, error = null) {
  return {
    success,
    timestamp: new Date().toISOString(),
    ...(data && { data }),
    ...(error && { error })
  };
}

/**
 * Generate a cryptographically secure coupon code
 */
function generateCouponCode() {
  const crypto = require('crypto');
  return crypto
    .randomBytes(Math.ceil(CONSTANTS.COUPON_LENGTH / 2))
    .toString('hex')
    .toUpperCase()
    .slice(0, CONSTANTS.COUPON_LENGTH);
}

/**
 * Calculate expiry date
 */
function calculateExpiryDate(days = CONSTANTS.EXPIRY_DAYS) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  expiresAt.setHours(23, 59, 59, 999); // End of day
  return expiresAt;
}

/**
 * Redeem coupon using game points
 * @route POST /api/coupons/redeem
 */
exports.redeemCouponWithPoints = async (req, res, next) => {
  const correlationId = req.correlationId;
  const session = await mongoose.startSession();
  
  try {
    const validated = validateRequest(
      Joi.object({
        userId: schemas.userId,
        pointsToRedeem: schemas.pointsToRedeem
      }),
      req.body
    );
    
    const { userId, pointsToRedeem } = validated;
    
    logger.info('Redeeming coupon with points', {
      userId,
      pointsToRedeem,
      correlationId
    });

    let result;
    
    await session.withTransaction(async () => {
      // Get user with lock to prevent race conditions
      const user = await User.findById(userId)
        .session(session)
        .select('points gamesWon email username');

      if (!user) {
        throw new AppError('User not found', 404, ErrorTypes.NOT_FOUND);
      }

      // Check if user has enough points
      if ((user.points || 0) < pointsToRedeem) {
        throw new AppError(
          `Insufficient points. You have ${user.points || 0} points, need ${pointsToRedeem}`,
          400,
          ErrorTypes.VALIDATION_ERROR,
          {
            currentPoints: user.points || 0,
            requiredPoints: pointsToRedeem,
            shortfall: pointsToRedeem - (user.points || 0)
          }
        );
      }

      // Check active coupons limit
      const activeCouponsCount = await Coupon.countDocuments({
        userId,
        status: 'active',
        expiresAt: { $gt: new Date() }
      }).session(session);

      if (activeCouponsCount >= CONSTANTS.MAX_ACTIVE_COUPONS) {
        throw new AppError(
          `Maximum ${CONSTANTS.MAX_ACTIVE_COUPONS} active coupons allowed. Please use existing coupons first.`,
          400,
          ErrorTypes.VALIDATION_ERROR,
          { activeCoupons: activeCouponsCount }
        );
      }

      // Generate unique coupon code
      let code;
      let isUnique = false;
      let attempts = 0;
      
      while (!isUnique && attempts < 10) {
        code = generateCouponCode();
        const existing = await Coupon.findOne({ code }).session(session);
        if (!existing) {
          isUnique = true;
        }
        attempts++;
      }

      if (!isUnique) {
        throw new AppError(
          'Failed to generate unique coupon code',
          500,
          ErrorTypes.INTERNAL_ERROR
        );
      }

      // Create coupon
      const coupon = await Coupon.create([{
        code,
        userId,
        discountType: 'percent',
        discountValue: CONSTANTS.DEFAULT_DISCOUNT,
        expiresAt: calculateExpiryDate(),
        status: 'active',
        type: CONSTANTS.COUPON_TYPES.GAME_REWARD,
        pointsRedeemed: pointsToRedeem,
        metadata: {
          gamesWon: user.gamesWon,
          redeemedAt: new Date()
        }
      }], { session });

      // Deduct points from user
      user.points = (user.points || 0) - pointsToRedeem;
      await user.save({ session });

      result = {
        coupon: {
          code: coupon[0].code,
          discountType: coupon[0].discountType,
          discountValue: coupon[0].discountValue,
          expiresAt: coupon[0].expiresAt,
          status: coupon[0].status
        },
        pointsDeducted: pointsToRedeem,
        remainingPoints: user.points,
        message: 'Coupon redeemed successfully!'
      };

      logger.info('Coupon redeemed successfully', {
        userId,
        code: coupon[0].code,
        pointsDeducted: pointsToRedeem,
        remainingPoints: user.points,
        correlationId
      });
    });

    res.json(formatResponse(true, result));
    
  } catch (error) {
    logger.error('Coupon redemption failed', {
      error: error.message,
      userId: req.body.userId,
      correlationId
    });
    next(error);
  } finally {
    session.endSession();
  }
};

/**
 * Create a promotional coupon (admin only)
 * @route POST /api/coupons/create
 */
exports.createCoupon = async (req, res, next) => {
  const correlationId = req.correlationId;
  
  try {
    const validated = validateRequest(
      Joi.object({
        userId: schemas.userId,
        discountValue: Joi.number().min(1).max(100).default(CONSTANTS.DEFAULT_DISCOUNT),
        expiryDays: Joi.number().min(1).max(365).default(CONSTANTS.EXPIRY_DAYS),
        type: Joi.string().valid(...Object.values(CONSTANTS.COUPON_TYPES)).default('promotional')
      }),
      req.body
    );

    const { userId, discountValue, expiryDays, type } = validated;

    logger.info('Creating promotional coupon', {
      userId,
      discountValue,
      expiryDays,
      correlationId
    });

    // Check user exists
    const user = await User.findById(userId).select('_id');
    if (!user) {
      throw new AppError('User not found', 404, ErrorTypes.NOT_FOUND);
    }

    // Check active coupons limit
    const activeCouponsCount = await Coupon.countDocuments({
      userId,
      status: 'active',
      expiresAt: { $gt: new Date() }
    });

    if (activeCouponsCount >= CONSTANTS.MAX_ACTIVE_COUPONS) {
      throw new AppError(
        'Maximum active coupons reached',
        400,
        ErrorTypes.VALIDATION_ERROR
      );
    }

    // Generate unique code
    let code;
    let isUnique = false;
    let attempts = 0;
    
    while (!isUnique && attempts < 10) {
      code = generateCouponCode();
      const existing = await Coupon.findOne({ code });
      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      throw new AppError(
        'Failed to generate unique coupon code',
        500,
        ErrorTypes.INTERNAL_ERROR
      );
    }

    // Create coupon
    const coupon = await Coupon.create({
      code,
      userId,
      discountType: 'percent',
      discountValue,
      expiresAt: calculateExpiryDate(expiryDays),
      status: 'active',
      type,
      pointsRedeemed: 0
    });

    logger.info('Promotional coupon created', {
      userId,
      code: coupon.code,
      correlationId
    });

    res.json(formatResponse(true, {
      code: coupon.code,
      discountValue: coupon.discountValue,
      discountType: coupon.discountType,
      expiresAt: coupon.expiresAt,
      type: coupon.type
    }));
    
  } catch (error) {
    logger.error('Coupon creation failed', {
      error: error.message,
      correlationId
    });
    next(error);
  }
};

/**
 * Validate a coupon
 * @route POST /api/coupons/validate
 */
exports.validateCoupon = async (req, res, next) => {
  try {
    const validated = validateRequest(
      Joi.object({
        userId: schemas.userId,
        code: schemas.code
      }),
      req.body
    );

    const { userId, code } = validated;

    logger.info('Validating coupon', { userId, code: code.substring(0, 4) + '****' });

    const coupon = await Coupon.findOne({ code, userId }).lean();
    
    if (!coupon) {
      throw new AppError(
        'Coupon not found or does not belong to this user',
        404,
        ErrorTypes.NOT_FOUND
      );
    }

    // Check if already used
    if (coupon.status === 'used') {
      throw new AppError(
        `Coupon was already used on ${new Date(coupon.usedAt).toLocaleDateString()}`,
        400,
        ErrorTypes.INVALID_OPERATION,
        { usedAt: coupon.usedAt }
      );
    }

    // Check if expired
    if (coupon.expiresAt < new Date()) {
      // Update status to expired
      await Coupon.updateOne(
        { _id: coupon._id },
        { status: 'expired' }
      );
      
      throw new AppError(
        `Coupon expired on ${new Date(coupon.expiresAt).toLocaleDateString()}`,
        400,
        ErrorTypes.INVALID_OPERATION,
        { expiresAt: coupon.expiresAt }
      );
    }

    // Check if inactive
    if (coupon.status !== 'active') {
      throw new AppError(
        'Coupon is not active',
        400,
        ErrorTypes.INVALID_OPERATION,
        { status: coupon.status }
      );
    }

    logger.info('Coupon validated successfully', { userId, code: code.substring(0, 4) + '****' });

    res.json(formatResponse(true, {
      valid: true,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      expiresAt: coupon.expiresAt,
      type: coupon.type
    }));
    
  } catch (error) {
    next(error);
  }
};

/**
 * Mark a coupon as used (apply coupon)
 * @route POST /api/coupons/apply
 */
exports.applyCoupon = async (req, res, next) => {
  const correlationId = req.correlationId;
  const session = await mongoose.startSession();
  
  try {
    const validated = validateRequest(
      Joi.object({
        userId: schemas.userId,
        code: schemas.code,
        orderAmount: Joi.number().min(0).required()
      }),
      req.body
    );

    const { userId, code, orderAmount } = validated;

    logger.info('Applying coupon', {
      userId,
      code: code.substring(0, 4) + '****',
      orderAmount,
      correlationId
    });

    let result;
    
    await session.withTransaction(async () => {
      const coupon = await Coupon.findOne({ code, userId }).session(session);
      
      if (!coupon) {
        throw new AppError('Coupon not found', 404, ErrorTypes.NOT_FOUND);
      }

      if (coupon.status !== 'active' || coupon.expiresAt < new Date()) {
        throw new AppError('Coupon is not valid', 400, ErrorTypes.INVALID_OPERATION);
      }

      // Calculate discount
      let discountAmount = 0;
      if (coupon.discountType === 'percent') {
        discountAmount = (orderAmount * coupon.discountValue) / 100;
      } else if (coupon.discountType === 'fixed') {
        discountAmount = Math.min(coupon.discountValue, orderAmount);
      }

      // Mark as used
      coupon.status = 'used';
      coupon.usedAt = new Date();
      coupon.metadata = {
        ...coupon.metadata,
        orderAmount,
        discountAmount,
        appliedAt: new Date()
      };
      
      await coupon.save({ session });

      result = {
        message: 'Coupon applied successfully',
        discountAmount: Math.round(discountAmount * 100) / 100,
        finalAmount: Math.round((orderAmount - discountAmount) * 100) / 100,
        couponCode: code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue
      };

      logger.info('Coupon applied successfully', {
        userId,
        code: code.substring(0, 4) + '****',
        discountAmount: result.discountAmount,
        correlationId
      });
    });

    res.json(formatResponse(true, result));
    
  } catch (error) {
    logger.error('Coupon application failed', {
      error: error.message,
      userId: req.body.userId,
      correlationId
    });
    next(error);
  } finally {
    session.endSession();
  }
};

/**
 * Get user's coupons
 * @route GET /api/coupons/user
 */
exports.getUserCoupons = async (req, res, next) => {
  try {
    const validated = validateRequest(
      Joi.object({ userId: schemas.userId }),
      req.query
    );

    const { userId } = validated;

    logger.info('Fetching user coupons', { userId });

    // Get all coupons
    const coupons = await Coupon.find({ userId })
      .select('-__v -metadata')
      .sort({ createdAt: -1 })
      .lean();

    // Auto-expire old coupons
    const now = new Date();
    const expiredIds = coupons
      .filter(c => c.status === 'active' && c.expiresAt < now)
      .map(c => c._id);

    if (expiredIds.length > 0) {
      await Coupon.updateMany(
        { _id: { $in: expiredIds } },
        { status: 'expired' }
      );
      
      // Update local data
      coupons.forEach(c => {
        if (expiredIds.some(id => id.equals(c._id))) {
          c.status = 'expired';
        }
      });
    }

    // Categorize coupons
    const categorized = {
      active: coupons.filter(c => c.status === 'active' && c.expiresAt >= now),
      used: coupons.filter(c => c.status === 'used'),
      expired: coupons.filter(c => c.status === 'expired' || c.expiresAt < now),
      total: coupons.length
    };

    logger.info('User coupons fetched', {
      userId,
      total: categorized.total,
      active: categorized.active.length
    });

    res.json(formatResponse(true, {
      coupons: categorized,
      summary: {
        totalCoupons: categorized.total,
        activeCoupons: categorized.active.length,
        usedCoupons: categorized.used.length,
        expiredCoupons: categorized.expired.length
      }
    }));
    
  } catch (error) {
    logger.error('Fetch user coupons failed', {
      error: error.message,
      userId: req.query.userId
    });
    next(error);
  }
};

/**
 * Check if user can redeem a coupon
 * @route GET /api/coupons/can-redeem
 */
exports.checkRedeemEligibility = async (req, res, next) => {
  try {
    const validated = validateRequest(
      Joi.object({ userId: schemas.userId }),
      req.query
    );

    const { userId } = validated;

    const [user, activeCouponsCount] = await Promise.all([
      User.findById(userId).select('points').lean(),
      Coupon.countDocuments({
        userId,
        status: 'active',
        expiresAt: { $gt: new Date() }
      })
    ]);

    if (!user) {
      throw new AppError('User not found', 404, ErrorTypes.NOT_FOUND);
    }

    const canRedeem = 
      (user.points || 0) >= CONSTANTS.POINTS_REQUIRED &&
      activeCouponsCount < CONSTANTS.MAX_ACTIVE_COUPONS;

    res.json(formatResponse(true, {
      canRedeem,
      currentPoints: user.points || 0,
      pointsRequired: CONSTANTS.POINTS_REQUIRED,
      pointsNeeded: Math.max(0, CONSTANTS.POINTS_REQUIRED - (user.points || 0)),
      activeCoupons: activeCouponsCount,
      maxActiveCoupons: CONSTANTS.MAX_ACTIVE_COUPONS,
      reason: !canRedeem ? (
        (user.points || 0) < CONSTANTS.POINTS_REQUIRED 
          ? 'Insufficient points'
          : 'Maximum active coupons reached'
      ) : null
    }));
    
  } catch (error) {
    next(error);
  }
};

module.exports = exports;