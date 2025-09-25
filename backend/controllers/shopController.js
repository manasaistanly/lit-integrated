const User = require('../models/User');
const { gemPacks, lifePacks, streakPacks } = require('../config/storeConfig');
const Joi = require('joi'); // Add input validation

// Validation schemas
const purchaseSchema = Joi.object({
  userId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  packIndex: Joi.number().min(0).required()
});

// Constants
const LIFE_REGEN_INTERVAL = 20 * 60 * 1000; // 20 minutes
const MAX_LIVES = 5;

// Utility: Regenerate lives based on time
function regenerateLives(user) {
  if (!user.lastLifeRegen) user.lastLifeRegen = new Date();
  if (user.lives >= MAX_LIVES) return;

  const now = new Date();
  const elapsed = now - user.lastLifeRegen;
  const livesToAdd = Math.floor(elapsed / LIFE_REGEN_INTERVAL);

  if (livesToAdd > 0) {
    user.lives = Math.min(user.lives + livesToAdd, MAX_LIVES);
    user.lastLifeRegen = new Date(user.lastLifeRegen.getTime() + livesToAdd * LIFE_REGEN_INTERVAL);
  }
}

// GET /api/shop/gems
exports.getGemPacks = async (req, res) => {
  try {
    res.json({
      success: true,
      data: gemPacks
    });
  } catch (error) {
    console.error('Get gem packs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/shop/lives
exports.getLifePacks = async (req, res) => {
  try {
    res.json({
      success: true,
      data: lifePacks
    });
  } catch (error) {
    console.error('Get life packs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/shop/streaks
exports.getStreakPacks = async (req, res) => {
  try {
    res.json({
      success: true,
      data: streakPacks
    });
  } catch (error) {
    console.error('Get streak packs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/shop/buy-lives
exports.buyLives = async (req, res) => {
  try {
    // Validate input
    const { error } = purchaseSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Invalid input',
        details: error.details[0].message
      });
    }

    const { userId, packIndex } = req.body;

    // Validate pack exists
    if (!lifePacks[packIndex]) {
      return res.status(400).json({
        error: 'Invalid pack index'
      });
    }

    const pack = lifePacks[packIndex];
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Regenerate lives before purchase
    regenerateLives(user);

    if (user.gems < pack.gems) {
      return res.status(400).json({
        error: 'Insufficient gems',
        required: pack.gems,
        current: user.gems
      });
    }

    // Process purchase
    user.gems -= pack.gems;
    user.lives = Math.min(user.lives + pack.lives, MAX_LIVES);
    
    await user.save();

    res.json({
      success: true,
      data: {
        lives: user.lives,
        gems: user.gems
      }
    });
  } catch (error) {
    console.error('Buy lives error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/shop/buy-streak
exports.buyStreak = async (req, res) => {
  try {
    // Validate input
    const { error } = purchaseSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Invalid input',
        details: error.details[0].message
      });
    }

    const { userId, packIndex } = req.body;

    // Validate pack exists
    if (!streakPacks[packIndex]) {
      return res.status(400).json({
        error: 'Invalid pack index'
      });
    }

    const pack = streakPacks[packIndex];
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    if (user.gems < pack.gems) {
      return res.status(400).json({
        error: 'Insufficient gems',
        required: pack.gems,
        current: user.gems
      });
    }

    // Process purchase
    user.gems -= pack.gems;
    user.streak = (user.streak || 0) + pack.days;

    await user.save();

    res.json({
      success: true,
      data: {
        streak: user.streak,
        gems: user.gems
      }
    });
  } catch (error) {
    console.error('Buy streak error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getPurchaseHistory = async (userId) => {
  // Implement history retrieval
};

exports.getUserShopStatus = async (userId) => {
  // Implement status check
};
