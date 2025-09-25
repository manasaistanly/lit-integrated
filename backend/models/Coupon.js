const mongoose = require('mongoose');

// Constants for validation
const COUPON_CONSTANTS = {
  CODE_LENGTH: 8,
  MIN_DISCOUNT: 0,
  MAX_PERCENT_DISCOUNT: 100,
  MAX_FLAT_DISCOUNT: 10000,
  MIN_EXPIRY_HOURS: 1,
  DEFAULT_DISCOUNT_PERCENT: 10
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
    }
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true // Add index for faster queries
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
  expiresAt: {
    type: Date,
    required: [true, 'Expiry date is required'],
    validate: {
      validator: function(v) {
        // Ensure expiry date is in the future
        return v > new Date();
      },
      message: 'Expiry date must be in the future'
    }
  },
  status: {
    type: String,
    enum: {
      values: ['active', 'used', 'expired'],
      message: 'Invalid coupon status'
    },
    default: 'active',
    required: true,
    index: true // Add index for faster queries
  },
  usedAt: {
    type: Date,
    default: null
  },
  metadata: {
    type: Map,
    of: String,
    default: () => new Map()
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
couponSchema.index({ expiresAt: 1, status: 1 }); // For querying active, non-expired coupons
couponSchema.index({ userId: 1, status: 1 }); // For querying user's active coupons

// Virtual for checking if coupon is expired
couponSchema.virtual('isExpired').get(function() {
  return this.expiresAt < new Date();
});

// Virtual for remaining time
couponSchema.virtual('timeRemaining').get(function() {
  if (this.isExpired) return 0;
  return this.expiresAt - new Date();
});

// Methods
couponSchema.methods.markAsUsed = async function() {
  this.status = 'used';
  this.usedAt = new Date();
  return this.save();
};

couponSchema.methods.checkValidity = function() {
  if (this.status !== 'active') {
    throw new Error('Coupon is not active');
  }
  if (this.isExpired) {
    this.status = 'expired';
    throw new Error('Coupon has expired');
  }
  return true;
};

// Statics
couponSchema.statics.findActiveCoupons = function(userId) {
  return this.find({
    userId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  });
};

// Pre-save middleware
couponSchema.pre('save', function(next) {
  // Auto-expire coupon if expired
  if (this.isExpired && this.status === 'active') {
    this.status = 'expired';
  }
  next();
});

// Pre-find middleware
couponSchema.pre('find', function() {
  // Add default sort by createdAt
  if (!this.getQuery().sort) {
    this.sort({ createdAt: -1 });
  }
});

// Create model
const Coupon = mongoose.model('Coupon', couponSchema);

// Create indexes
Coupon.createIndexes().catch(err => {
  console.error('Error creating coupon indexes:', err);
});

module.exports = Coupon;
