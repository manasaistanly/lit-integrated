const Coupon = require('../models/Coupon');

// Helper to generate a random coupon code
function generateCouponCode() {
  return Math.random().toString(36).substr(2, 8).toUpperCase();
}

exports.createCoupon = async (req, res) => {
  const { userId } = req.body;
  try {
    // Check if the user already has an active coupon
    const active = await Coupon.findOne({
      userId,
      status: 'active',
      expiresAt: { $gt: new Date() }
    });
    if (active) return res.status(400).json({ error: 'Active coupon already exists.' });

    const code = generateCouponCode();
    const expiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days from now

    const coupon = await Coupon.create({
      code,
      userId,
      discountType: 'percent',
      discountValue: 10,
      expiresAt,
      status: 'active',
    });

    res.json({ success: true, coupon });
  } catch (err) {
    console.error("COUPON CREATE ERROR:", err);
    res.status(500).json({ error: 'Failed to create coupon.' });
  }
};

exports.validateCoupon = async (req, res) => {
  const { userId, code } = req.body;
  try {
    const coupon = await Coupon.findOne({ code, userId });
    if (!coupon) return res.status(404).json({ error: 'Coupon not found.' });

    if (coupon.status !== 'active') {
      return res.status(400).json({ error: 'Coupon already used or expired.' });
    }
    if (coupon.expiresAt < new Date()) {
      coupon.status = 'expired';
      await coupon.save();
      return res.status(400).json({ error: 'Coupon has expired.' });
    }
    res.json({
      success: true,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      expiresAt: coupon.expiresAt,
      status: coupon.status
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to validate coupon.' });
  }
};

exports.markCouponUsed = async (req, res) => {
  const { userId, code } = req.body;
  try {
    const coupon = await Coupon.findOne({ code, userId });
    if (!coupon) return res.status(404).json({ error: 'Coupon not found.' });

    if (coupon.status !== 'active' || coupon.expiresAt < new Date()) {
      coupon.status = 'expired';
      await coupon.save();
      return res.status(400).json({ error: 'Coupon is not valid.' });
    }

    coupon.status = 'used';
    await coupon.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark coupon as used.' });
  }
};

exports.getUserCoupons = async (req, res) => {
  const { userId } = req.query;
  try {
    const coupons = await Coupon.find({ userId }).sort({ createdAt: -1 });
    res.json({ coupons });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch coupons.' });
  }
};
