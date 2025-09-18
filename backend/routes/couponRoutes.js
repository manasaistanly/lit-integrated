//game
const express = require('express');
const router = express.Router();
const Coupon = require('../models/Coupon');

// @route   POST /api/coupons/validate
// @desc    Validate a coupon code
// @access  Public
router.post('/validate', async (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ message: 'Coupon code is required.' });
  }
  const coupon = await Coupon.findOne({ code: code.trim().toUpperCase(), active: true });
  if (!coupon) {
    return res.status(404).json({ message: 'Invalid or expired coupon code.' });
  }
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    return res.status(400).json({ message: 'Coupon code has expired.' });
  }
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    return res.status(400).json({ message: 'Coupon usage limit reached.' });
  }
  res.json({
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
  });
});

module.exports = router; 