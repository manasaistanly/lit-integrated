const User = require('../models/User');
const { gemPacks, lifePacks, streakPacks } = require('../config/storeConfig');

// Utility: Regenerate lives based on time (example logic: +1 life every 15 minutes, max 5)
function regenerateLives(user) {
  const LIFE_REGEN_INTERVAL = 15 * 60 * 1000; // 15 minutes
  if (!user.lastLifeRegen) user.lastLifeRegen = new Date();
  if (user.lives >= 5) return;

  const now = new Date();
  const elapsed = now - user.lastLifeRegen;
  const livesToAdd = Math.floor(elapsed / LIFE_REGEN_INTERVAL);

  if (livesToAdd > 0) {
    user.lives = Math.min(user.lives + livesToAdd, 5);
    user.lastLifeRegen = new Date(user.lastLifeRegen.getTime() + livesToAdd * LIFE_REGEN_INTERVAL);
  }
}

// GET /api/shop/gems - List all gem packs (for reference only)
exports.getGemPacks = (req, res) => {
  res.json(gemPacks);
};

// GET /api/shop/lives - List all lives packs
exports.getLifePacks = (req, res) => {
  res.json(lifePacks);
};

// GET /api/shop/streaks - List all streak packs
exports.getStreakPacks = (req, res) => {
  res.json(streakPacks);
};

// POST /api/shop/buy-lives { userId, packIndex }
exports.buyLives = async (req, res) => {
  const { userId, packIndex } = req.body;
  const pack = lifePacks[packIndex];
  const user = await User.findById(userId);

  if (!user || !pack) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  // Regenerate lives before purchase
  regenerateLives(user);

  if (user.gems < pack.gems) {
    return res.status(400).json({ error: 'Not enough gems' });
  }

  user.gems -= pack.gems;
  user.lives = Math.min(user.lives + (pack.lives || 0), 5); // cap lives at 5

  await user.save();

  res.json({
    success: true,
    lives: user.lives,
    gems: user.gems
  });
};

// POST /api/shop/buy-streak { userId, packIndex }
exports.buyStreak = async (req, res) => {
  const { userId, packIndex } = req.body;
  const pack = streakPacks[packIndex];
  const user = await User.findById(userId);

  if (!user || !pack) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  if (user.gems < pack.gems) {
    return res.status(400).json({ error: 'Not enough gems' });
  }

  user.gems -= pack.gems;
  user.streak = (user.streak || 0) + (pack.streak || 0);

  await user.save();

  res.json({
    success: true,
    streak: user.streak,
    gems: user.gems
  });
};
