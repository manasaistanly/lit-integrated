const User = require('../models/User');
const ImagePair = require('../models/ImagePair');
const { getTier } = require('../utils/tier');
const Joi = require('joi');

// --- Input validation schemas ---
const objectIdPattern = /^[0-9a-fA-F]{24}$/;
const validateUserId = Joi.string().pattern(objectIdPattern).required();
const validatePairId = Joi.string().pattern(objectIdPattern).required();
const validateChoice = Joi.string().valid('A', 'B').optional();
const validateTimedOut = Joi.boolean().optional();

function validateRequest(schema, data) {
  const { error } = schema.validate(data);
  return error ? error.details[0].message : null;
}

// --- Life regeneration helper (1 life per 20 min, max 5) ---
function regenerateLives(user) {
  const now = new Date();
  const last = user.lastLifeUpdate || now;
  const diffMs = now - last;
  const minutesPassed = Math.floor(diffMs / (1000 * 60));
  const livesToAdd = Math.floor(minutesPassed / 20);

  if (livesToAdd > 0) {
    user.lives = Math.min(user.lives + livesToAdd, 5);
    user.lastLifeUpdate = new Date(last.getTime() + livesToAdd * 20 * 60 * 1000);
  }
}

// GET /product-pairs
exports.getProductPairs = async (req, res) => {
  try {
    // Validate userId
    const errorMsg = validateRequest(Joi.object({ userId: validateUserId }), req.query);
    if (errorMsg) return res.status(400).json({ error: errorMsg });

    const { userId } = req.query;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    regenerateLives(user);
    await user.save();

    if (user.lives <= 0) {
      return res.status(400).json({
        error: 'No lives remaining. Please wait for regeneration or buy lives.'
      });
    }

    const pairs = await ImagePair.aggregate([{ $sample: { size: 10 } }]);
    res.json(
      pairs.map(p => ({
        id: p._id,
        productA: { name: p.productA.name, image: p.productA.image },
        productB: { name: p.productB.name, image: p.productB.image }
      }))
    );
  } catch (err) {
    console.error('getProductPairs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /exit-game
exports.exitGame = async (req, res) => {
  try {
    const errorMsg = validateRequest(Joi.object({ userId: validateUserId }), req.body);
    if (errorMsg) return res.status(400).json({ error: errorMsg });

    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    regenerateLives(user);

    if (user.lives <= 0) {
      return res.status(400).json({
        error: 'No lives remaining. Please wait for regeneration or buy lives.'
      });
    }

    user.lives -= 1;
    user.streak = 0;
    user.tier = getTier(user);

    await user.save();

    res.json({
      lives: user.lives,
      streak: user.streak,
      tier: user.tier
    });
  } catch (err) {
    console.error('exitGame error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /validate-answer
exports.validateAnswer = async (req, res) => {
  try {
    // Validate input
    const schema = Joi.object({
      userId: validateUserId,
      pairId: validatePairId,
      choice: validateChoice,
      timedOut: validateTimedOut
    });
    const errorMsg = validateRequest(schema, req.body);
    if (errorMsg) return res.status(400).json({ error: errorMsg });

    const { userId, pairId, choice, timedOut } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    regenerateLives(user);

    if (user.lives <= 0) {
      await user.save();
      return res.status(400).json({
        error: 'No lives remaining. Please wait for regeneration or buy lives.'
      });
    }

    user.gamesPlayed = (user.gamesPlayed || 0) + 1;
    let isCorrect = false;

    if (timedOut || !choice) {
      user.lives = Math.max(0, user.lives - 1);
      user.streak = 0;
      user.lastPlayedAt = new Date();
    } else {
      const pair = await ImagePair.findById(pairId);
      if (!pair) return res.status(404).json({ error: 'Pair not found' });

      if (
        (choice === 'A' && pair.productA.price > pair.productB.price) ||
        (choice === 'B' && pair.productB.price > pair.productA.price)
      ) {
        isCorrect = true;
        user.gamesWon = (user.gamesWon || 0) + 1;
        user.points = (user.points || 0) + 10;

        // Streak logic
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (user.streak > 0 && user.lastPlayedAt) {
          const last = new Date(user.lastPlayedAt);
          last.setHours(0, 0, 0, 0);
          const dayDiff = (today - last) / (1000 * 60 * 60 * 24);

          if (dayDiff === 1) user.streak += 1;
          else if (dayDiff > 1) user.streak = 1;
        } else {
          user.streak = 1;
        }
        user.lastPlayedAt = today;
      } else {
        user.lives = Math.max(0, user.lives - 1);
        user.streak = 0;
        user.lastPlayedAt = new Date();
      }
    }

    user.tier = getTier(user);
    await user.save();

    res.json({
      correct: isCorrect,
      points: user.points,
      lives: user.lives,
      streak: user.streak,
      tier: user.tier
    });
  } catch (err) {
    console.error('validateAnswer error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
