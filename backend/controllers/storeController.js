const User = require('../models/User');
const { gemPacks, lifePacks } = require('../config/storeConfig');

// Fetch all gem packs
exports.getGemPacks = (req, res) => {
  res.json(gemPacks);
};

// Purchase gem pack
exports.buyGems = async (req, res) => {
  const { userId, packIndex } = req.body;
  const pack = gemPacks[packIndex];
  const user = await User.findById(userId);
  if (!user || !pack) return res.status(400).json({ error: 'Invalid purchase' });
  // Payment validation would go here
  user.gems += pack.gems;
  await user.save();
  res.json({ success: true, gems: user.gems });
};

// Fetch all lives packs
exports.getLifePacks = (req, res) => {
  res.json(lifePacks);
};

// Purchase lives pack
exports.buyLives = async (req, res) => {
  const { userId, packIndex } = req.body;
  const pack = lifePacks[packIndex];
  const user = await User.findById(userId);
  if (!user || !pack) return res.status(400).json({ error: 'Invalid purchase' });
  if (user.gems < pack.gems) return res.status(400).json({ error: 'Not enough gems' });

  user.gems -= pack.gems;
  if (pack.infinite) {
    user.lives = -1; // Or set a separate hasInfiniteLife: true
  } else {
    user.lives += pack.lives;
  }
  await user.save();
  res.json({ success: true, lives: user.lives, gems: user.gems });
};
