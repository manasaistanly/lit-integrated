const User = require('../models/User');
const { gemPacks, lifePacks } = require('../config/storeConfig');

// Fetch all gem packs (for reference only, actual gem crediting is via paymentController)
exports.getGemPacks = (req, res) => {
  res.json(gemPacks);
};

// Fetch all life packs
exports.getLifePacks = (req, res) => {
  res.json(lifePacks);
};

// Purchase life pack (using gems)
exports.buyLives = async (req, res) => {
  const { userId, packIndex } = req.body;
  const pack = lifePacks[packIndex];
  const user = await User.findById(userId);

  if (!user || !pack) {
    return res.status(400).json({ error: 'Invalid purchase' });
  }

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
