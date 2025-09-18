const User = require('../models/User');
const Coupon = require('../models/Coupon');
const { getTier } = require('../utils/tier');

// GET /users/:userId/stats
exports.getStats = async (req, res) => {
  const user = await User.findById(req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    lives: user.lives,
    gems: user.gems,
    streak: user.streak,
    tier: user.tier,
    points: user.points
  });
};

// PATCH /users/:userId/stats
exports.updateStats = async (req, res) => {
  const updates = req.body;
  const user = await User.findById(req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (updates.points) user.points += parseInt(updates.points, 10);
  if (updates.streak) user.streak += parseInt(updates.streak, 10);
  if (updates.streak === "0") user.streak = 0;
  if (updates.lives) user.lives += parseInt(updates.lives, 10);
  if (updates.gems) user.gems += parseInt(updates.gems, 10);

  // Use DYNAMIC tier: pass the user object to your util
  user.tier = getTier(user);

  await user.save();
  res.json(user);
};

// POST /users/:userId/purchase-lives
exports.purchaseLives = async (req, res) => {
  const user = await User.findById(req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.gems < 5) return res.status(400).json({ error: 'Not enough gems' });
  if (user.lives >= 5) return res.status(400).json({ error: 'Lives already full' });
  user.gems -= 5;
  user.lives += 1;
  await user.save();
  res.json({ lives: user.lives, gems: user.gems });
};

// POST /users/:userId/play
exports.handleGameplay = async (req, res) => {
  const user = await User.findById(req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const now = new Date();
  let streakReset = false;

  if (user.lastPlayedAt) {
    const last = new Date(user.lastPlayedAt);
    last.setHours(0,0,0,0);
    now.setHours(0,0,0,0);
    const daysBetween = Math.floor((now - last) / (1000 * 60 * 60 * 24));
    if (daysBetween === 1) {
      user.streak += 1;
    } else if (daysBetween > 1) {
      user.streak = 1;
      streakReset = true;
    }
    // If daysBetween === 0, already played today
  } else {
    user.streak = 1;
  }
  user.lastPlayedAt = new Date();
  user.points += 10;
  user.tier = getTier(user);

  await user.save();

  res.json({
    lives: user.lives,
    streak: user.streak,
    streakReset,
    lastPlayedAt: user.lastPlayedAt
  });
};

// POST /users/:userId/buy-streak-continue
exports.buyStreakContinue = async (req, res) => {
  const user = await User.findById(req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.gems < 10) return res.status(400).json({ error: 'Not enough gems' });

  const now = new Date();
  if (!user.lastPlayedAt) 
    return res.status(400).json({ error: 'No streak to continue' });

  const last = new Date(user.lastPlayedAt);
  last.setHours(0,0,0,0);
  now.setHours(0,0,0,0);
  const daysBetween = Math.floor((now - last) / (1000 * 60 * 60 * 24));
  if (daysBetween !== 1) {
    return res.status(400).json({ error: 'Streak can only be continued after missing one day' });
  }

  user.gems -= 10;
  user.streak += 1;
  user.lastPlayedAt = new Date();
  await user.save();

  res.json({ streak: user.streak, gems: user.gems, lastPlayedAt: user.lastPlayedAt });
};

// POST /users/:userId/redeem-coupon
exports.redeemCoupon = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.points < 50000)
      return res.status(400).json({ error: 'Not enough points' });

    // CREATE a unique coupon with 15-day expiry, assigned to the user
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
    const code = 'COUPON-' + Math.random().toString(36).substr(2, 8).toUpperCase();
    const coupon = await Coupon.create({
      code,
      discountType: 'percent',
      discountValue: 10,
      user: user._id,
      expiresAt,
      active: true,
      used: false
    });

    user.points -= 50000;
    await user.save();

    return res.json({
      coupon: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      expiresAt: coupon.expiresAt,
      points: user.points
    });
  } catch (error) {
    console.error('Coupon redeem error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};
