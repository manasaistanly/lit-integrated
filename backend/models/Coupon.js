const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  discountType: {
    type: String,
    enum: ['flat', 'percent'],
    default: 'percent',
    required: true,
  },
  discountValue: {
    type: Number,
    required: true,
    default: 10, // always 10 for your use-case
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ['active', 'used', 'expired'],
    default: 'active',
    required: true
  },
}, { timestamps: true });

module.exports = mongoose.model('Coupon', couponSchema);
