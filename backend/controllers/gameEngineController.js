const User = require('../models/User');
const ImagePair = require('../models/ImagePair');
const { getTier } = require('../utils/tier');

// --- Input validation helper ---
function isValidObjectId(id) {
  return typeof id === 'string' && id.match(/^[0-9a-fA-F]{24}$/);
}

// GET /product-pairs
exports.getProductPairs = async (req, res) => {
  try {
    // Fetch 10 random product pairs
    const pairs = await ImagePair.aggregate([{ $sample: { size: 10 } }]);
    res.json(
      pairs.map(p => ({
        id: p._id,
        productA: { name: p.productA.name, image: p.productA.image },
        productB: { name: p.productB.name, image: p.productB.image }
        // Don't send price, keep data minimal for game round
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
    const { userId } = req.body;
    if (!isValidObjectId(userId)) return res.status(400).json({ error: 'Invalid userId' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.lives > 0) {
      user.lives -= 1;
    }
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
// body: { userId, pairId, choice, timedOut }
exports.validateAnswer = async (req, res) => {
  try {
    const { userId, pairId, choice, timedOut } = req.body;
    if (!isValidObjectId(userId) || !isValidObjectId(pairId)) {
      return res.status(400).json({ error: 'Invalid userId or pairId' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.gamesPlayed = (user.gamesPlayed || 0) + 1;
    let isCorrect = false;

    if (timedOut || !choice) {
      user.lives = Math.max(0, user.lives - 1);
      user.streak = 0;
      user.lastPlayedAt = new Date();
    } else {
      const pair = await ImagePair.findById(pairId);
      if (!pair) return res.status(404).json({ error: 'Pair not found' });

      // Validate choice
      if (choice !== 'A' && choice !== 'B') {
        return res.status(400).json({ error: 'Invalid choice' });
      }

      if (
        (choice === 'A' && pair.productA.price > pair.productB.price) ||
        (choice === 'B' && pair.productB.price > pair.productA.price)
      ) {
        isCorrect = true;
        user.gamesWon = (user.gamesWon || 0) + 1;
        user.points = (user.points || 0) + 10;

        // --- Streak logic ---
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (user.streak > 0 && user.lastPlayedAt) {
          const last = new Date(user.lastPlayedAt);
          last.setHours(0, 0, 0, 0);
          const dayDiff = (today - last) / (1000 * 60 * 60 * 24);

          if (dayDiff === 1) {
            user.streak += 1;
          } else if (dayDiff > 1) {
            user.streak = 1;
          }
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

    // Dynamic tier calculation
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
