const User = require('../models/User');
const { gemPacks, lifePacks } = require('../config/storeConfig');

// Check if a user currently has infinite life
function hasInfiniteLife(user) {
  return user.infiniteLifeExpiresAt && user.infiniteLifeExpiresAt > new Date();
}

// GET /api/shop/gems - List all gem packs
exports.getGemPacks = (req, res) => {
  res.json(gemPacks);
};

// GET /api/shop/lives - List all lives packs
exports.getLifePacks = (req, res) => {
  res.json(lifePacks);
};

// POST /api/shop/buy-gems { userId, packIndex }
exports.buyGems = async (req, res) => {
  const { userId, packIndex } = req.body;
  const pack = gemPacks[packIndex];
  const user = await User.findById(userId);
  if (!user || !pack) return res.status(400).json({ error: 'Invalid request' });
  // Validate real payment here!
  user.gems += pack.gems;
  await user.save();
  res.json({ success: true, gems: user.gems });
};

// POST /api/shop/buy-life { userId, packIndex }
exports.buyLife = async (req, res) => {
  const { userId, packIndex } = req.body;
  const pack = lifePacks[packIndex];
  const user = await User.findById(userId);
  if (!user || !pack) return res.status(400).json({ error: 'Invalid request' });
  if (user.gems < pack.gems) return res.status(400).json({ error: 'Not enough gems' });

  const now = new Date();
  // If trying to extend infinite life but it's not expired yet, disallow
  if (pack.infinite) {
    if (hasInfiniteLife(user)) {
      return res.status(400).json({ error: 'You already have infinite life active!' });
    }
    user.infiniteLifeExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    user.lives = 5;
  } else {
    if (hasInfiniteLife(user)) {
      return res.status(400).json({ error: 'Infinite life active, cannot buy finite lives.' });
    }
    user.lives = Math.min(user.lives + pack.lives, 5);
  }

  user.gems -= pack.gems;
  await user.save();
  res.json({
    success: true,
    lives: user.lives,
    gems: user.gems,
    infiniteLifeExpiresAt: user.infiniteLifeExpiresAt
  });
};
