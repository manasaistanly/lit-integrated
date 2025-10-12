const mongoose = require('mongoose');

// Constants for validation
const COUPON_CONSTANTS = {
  CODE_LENGTH: 8,
  MIN_DISCOUNT: 0,
  MAX_PERCENT_DISCOUNT: 100,
  MAX_FLAT_DISCOUNT: 10000,
  MIN_EXPIRY_HOURS: 1,
  DEFAULT_DISCOUNT_PERCENT: 10,
  POINTS_REQUIRED: 50000
};

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Coupon code is required'],
    unique: true,
    uppercase: true,
    trim: true,
    minlength: [COUPON_CONSTANTS.CODE_LENGTH, 'Coupon code must be exactly 8 characters'],
    maxlength: [COUPON_CONSTANTS.CODE_LENGTH, 'Coupon code must be exactly 8 characters'],
    validate: {
      validator: function(v) {
        return /^[A-Z0-9]{8}$/.test(v);
      },
      message: 'Coupon code must contain only letters and numbers'
    },
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  discountType: {
    type: String,
    enum: {
      values: ['flat', 'percent'],
      message: 'Discount type must be either flat or percent'
    },
    default: 'percent',
    required: true
  },
  discountValue: {
    type: Number,
    required: [true, 'Discount value is required'],
    default: COUPON_CONSTANTS.DEFAULT_DISCOUNT_PERCENT,
    validate: {
      validator: function(v) {
        if (this.discountType === 'percent') {
          return v >= COUPON_CONSTANTS.MIN_DISCOUNT && v <= COUPON_CONSTANTS.MAX_PERCENT_DISCOUNT;
        }
        return v >= COUPON_CONSTANTS.MIN_DISCOUNT && v <= COUPON_CONSTANTS.MAX_FLAT_DISCOUNT;
      },
      message: props => 
        props.value < COUPON_CONSTANTS.MIN_DISCOUNT ? 'Discount cannot be negative' :
        props.value > COUPON_CONSTANTS.MAX_PERCENT_DISCOUNT && props.type === 'percent' ? 'Percent discount cannot exceed 100%' :
        props.value > COUPON_CONSTANTS.MAX_FLAT_DISCOUNT ? 'Flat discount exceeds maximum allowed' :
        'Invalid discount value'
    }
  },
  status: {
    type: String,
    enum: {
      values: ['active', 'used', 'expired', 'revoked'],
      message: 'Invalid coupon status'
    },
    default: 'active',
    required: true,
    index: true
  },
  // NEW: Coupon type for categorization
  type: {
    type: String,
    enum: ['game_reward', 'promotional', 'referral', 'admin'],
    default: 'game_reward',
    index: true
  },
  // NEW: Track points spent to redeem this coupon
  pointsRedeemed: {
    type: Number,
    default: 0,
    min: [0, 'Points redeemed cannot be negative']
  },
  expiresAt: {
    type: Date,
    required: [true, 'Expiry date is required'],
    index: true,
    validate: {
      validator: function(v) {
        // Only validate future date on creation
        if (this.isNew) {
          return v > new Date();
        }
        return true;
      },
      message: 'Expiry date must be in the future'
    }
  },
  usedAt: {
    type: Date,
    default: null
  },
  // NEW: Revocation tracking
  revokedAt: {
    type: Date,
    default: null
  },
  revokedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  revokeReason: {
    type: String,
    default: null
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: () => new Map()
  }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Compound indexes for performance
couponSchema.index({ code: 1, userId: 1 }, { unique: false });
couponSchema.index({ userId: 1, status: 1 });
couponSchema.index({ userId: 1, expiresAt: 1 });
couponSchema.index({ status: 1, expiresAt: 1 });
couponSchema.index({ type: 1, status: 1 });
couponSchema.index({ createdAt: -1 });

// Virtual for checking if coupon is expired
couponSchema.virtual('isExpired').get(function() {
  return this.expiresAt < new Date();
});

// Virtual for checking if coupon is valid
couponSchema.virtual('isValid').get(function() {
  return this.status === 'active' && !this.isExpired;
});

// Virtual for remaining time
couponSchema.virtual('timeRemaining').get(function() {
  if (this.isExpired) return 0;
  return this.expiresAt - new Date();
});

// Virtual for days until expiry
couponSchema.virtual('daysUntilExpiry').get(function() {
  if (this.isExpired) return 0;
  const diff = this.expiresAt - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// ============ INSTANCE METHODS ============

/**
 * Mark coupon as used with order details
 * @param {Number} orderAmount - Total order amount
 * @param {Number} discountAmount - Calculated discount
 */
couponSchema.methods.markAsUsed = async function(orderAmount = 0, discountAmount = 0) {
  if (this.status !== 'active') {
    throw new Error('Only active coupons can be marked as used');
  }
  
  if (this.isExpired) {
    this.status = 'expired';
    await this.save();
    throw new Error('Coupon has expired');
  }
  
  this.status = 'used';
  this.usedAt = new Date();
  
  // Store order details in metadata
  if (!this.metadata) {
    this.metadata = new Map();
  }
  
  this.metadata.set('orderAmount', orderAmount);
  this.metadata.set('discountAmount', discountAmount);
  this.metadata.set('appliedAt', new Date().toISOString());
  
  return this.save();
};

/**
 * Check coupon validity with detailed error messages
 */
couponSchema.methods.checkValidity = function() {
  if (this.status === 'used') {
    const usedDate = this.usedAt ? new Date(this.usedAt).toLocaleDateString() : 'unknown date';
    throw new Error(`Coupon was already used on ${usedDate}`);
  }
  
  if (this.status === 'revoked') {
    throw new Error(`Coupon has been revoked${this.revokeReason ? ': ' + this.revokeReason : ''}`);
  }
  
  if (this.status === 'expired' || this.isExpired) {
    const expiredDate = new Date(this.expiresAt).toLocaleDateString();
    throw new Error(`Coupon expired on ${expiredDate}`);
  }
  
  if (this.status !== 'active') {
    throw new Error('Coupon is not active');
  }
  
  return true;
};

/**
 * Calculate discount amount for given order
 * @param {Number} orderAmount - Order total
 * @returns {Object} - { discountAmount, finalAmount }
 */
couponSchema.methods.calculateDiscount = function(orderAmount) {
  this.checkValidity();
  
  let discount = 0;
  
  if (this.discountType === 'percent') {
    discount = (orderAmount * this.discountValue) / 100;
  } else if (this.discountType === 'flat') {
    discount = Math.min(this.discountValue, orderAmount);
  }
  
  return {
    discountAmount: Math.round(discount * 100) / 100,
    finalAmount: Math.round((orderAmount - discount) * 100) / 100
  };
};

/**
 * Revoke a coupon (admin action)
 * @param {String} reason - Reason for revocation
 * @param {ObjectId} revokedBy - Admin user ID
 */
couponSchema.methods.revoke = async function(reason, revokedBy) {
  if (this.status === 'used') {
    throw new Error('Cannot revoke a used coupon');
  }
  
  this.status = 'revoked';
  this.revokedAt = new Date();
  this.revokedBy = revokedBy;
  this.revokeReason = reason;
  
  return this.save();
};

// ============ STATIC METHODS ============

/**
 * Find a valid coupon by code and userId
 * @param {String} code - Coupon code
 * @param {ObjectId} userId - User ID
 */
couponSchema.statics.findValidCoupon = function(code, userId) {
  return this.findOne({
    code: code.toUpperCase(),
    userId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  });
};

/**
 * Get all active coupons for a user
 * @param {ObjectId} userId - User ID
 */
couponSchema.statics.findActiveCoupons = function(userId) {
  return this.find({
    userId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  }).sort({ expiresAt: 1 });
};

/**
 * Get user's active coupons (alias for compatibility)
 */
couponSchema.statics.getUserActiveCoupons = function(userId) {
  return this.findActiveCoupons(userId);
};

/**
 * Expire all old coupons
 * @returns {Number} - Count of expired coupons
 */
couponSchema.statics.expireOldCoupons = async function() {
  const result = await this.updateMany(
    {
      status: 'active',
      expiresAt: { $lt: new Date() }
    },
    {
      $set: { status: 'expired' }
    }
  );
  
  return result.modifiedCount;
};

/**
 * Get coupon statistics for a user
 * @param {ObjectId} userId - User ID
 */
couponSchema.statics.getUserCouponStats = async function(userId) {
  const stats = await this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalPointsRedeemed: { $sum: '$pointsRedeemed' }
      }
    }
  ]);
  
  const result = {
    total: 0,
    active: 0,
    used: 0,
    expired: 0,
    revoked: 0,
    totalPointsRedeemed: 0
  };
  
  stats.forEach(stat => {
    result[stat._id] = stat.count;
    result.total += stat.count;
    result.totalPointsRedeemed += stat.totalPointsRedeemed;
  });
  
  return result;
};

/**
 * Count active coupons for a user
 * @param {ObjectId} userId - User ID
 */
couponSchema.statics.countActiveCoupons = function(userId) {
  return this.countDocuments({
    userId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  });
};

// ============ MIDDLEWARE ============

// Pre-save: Auto-expire if past expiry date
couponSchema.pre('save', function(next) {
  if (this.status === 'active' && this.isExpired) {
    this.status = 'expired';
  }
  next();
});

// Pre-save: Prevent modification of used/expired/revoked coupons
couponSchema.pre('save', function(next) {
  if (!this.isNew && this.isModified()) {
    if (['used', 'expired', 'revoked'].includes(this.status)) {
      // Only allow specific fields to be modified
      const allowedModifications = ['metadata', 'revokeReason', 'status'];
      const modifiedFields = this.modifiedPaths();
      
      const hasInvalidModification = modifiedFields.some(
        field => !allowedModifications.includes(field)
      );
      
      if (hasInvalidModification) {
        return next(new Error('Cannot modify finalized coupons except metadata and revokeReason'));
      }
    }
  }
  next();
});

// Pre-find: Add default sort by createdAt
couponSchema.pre('find', function() {
  if (!this.getQuery().sort && !this.options.sort) {
    this.sort({ createdAt: -1 });
  }
});

// Post-save: Log coupon creation
couponSchema.post('save', function(doc, next) {
  if (doc.isNew) {
    console.log(`Coupon created: ${doc.code} for user ${doc.userId}`);
  }
  next();
});

// Create model
const Coupon = mongoose.model('Coupon', couponSchema);

// Create indexes on startup
Coupon.createIndexes().catch(err => {
  console.error('Error creating coupon indexes:', err);
});

module.exports = Coupon;
module.exports.COUPON_CONSTANTS = COUPON_CONSTANTS;