const express = require('express');
const router = express.Router();
const Coupon = require('../models/Coupon');

// Validate and fetch details of a coupon code for a user
router.post('/validate', async (req, res) => {
  const { code, userId } = req.body;

  if (!code || !userId) {
    return res.status(400).json({ message: 'Coupon code and userId are required.' });
  }

  try {
    const coupon = await Coupon.findOne({
      code: code.trim().toUpperCase(),
      userId,
    });

    // Check existence and status
    if (!coupon) return res.status(404).json({ message: 'Invalid or expired coupon code.' });

    // Mark as expired if expired
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      coupon.status = 'expired';
      await coupon.save();
      return res.status(400).json({ message: 'Coupon code has expired.' });
    }

    // Only allow "active" coupons to be applied
    if (coupon.status !== 'active') {
      return res.status(400).json({ message: 'Coupon already used or expired.' });
    }

    res.json({
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      expiresAt: coupon.expiresAt,
      status: coupon.status,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error validating coupon.' });
  }
});

// Mark a coupon as used (call after successful purchase)
router.post('/mark-used', async (req, res) => {
  const { code, userId } = req.body;
  if (!code || !userId) {
    return res.status(400).json({ message: 'Coupon code and userId are required.' });
  }
  try {
    const coupon = await Coupon.findOne({
      code: code.trim().toUpperCase(),
      userId
    });
    if (!coupon) return res.status(404).json({ message: 'Coupon not found.' });

    // Only update status if active and valid
    if (coupon.status !== 'active' || (coupon.expiresAt && coupon.expiresAt < new Date())) {
      coupon.status = 'expired';
      await coupon.save();
      return res.status(400).json({ message: 'Coupon is not valid.' });
    }

    coupon.status = 'used';
    await coupon.save();
    res.json({ message: 'Coupon marked as used.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error marking coupon as used.' });
  }
});

// (Optional) Create/generate new coupon for user
router.post('/create', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ message: 'User ID required.' });
  try {
    // Only one active coupon at a time
    const hasActive = await Coupon.findOne({ userId, status: 'active', expiresAt: { $gt: new Date() } });
    if (hasActive)
      return res.status(400).json({ message: 'Active coupon already exists.' });

    const code = Math.random().toString(36).substr(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days

    const coupon = await Coupon.create({
      code,
      userId,
      discountType: 'percent',
      discountValue: 10,
      expiresAt,
      status: 'active'
    });

    res.json({ coupon });
  } catch (err) {
    res.status(500).json({ message: 'Server error creating coupon.' });
  }
});

// (Optional) List all coupons for a user
router.get('/my-coupons', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ message: 'User ID required.' });
  try {
    const coupons = await Coupon.find({ userId }).sort({ createdAt: -1 });
    res.json({ coupons });
  } catch (err) {
    res.status(500).json({ message: 'Server error fetching coupons.' });
  }
});

module.exports = router;
