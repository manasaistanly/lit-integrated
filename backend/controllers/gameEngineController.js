const User = require('../models/User');
const ImagePair = require('../models/ImagePair');
const Streak = require('../models/Streak');
const { getTier } = require('../utils/tier');

// --- Constants ---
const CONSTANTS = {
  LIFE_REGEN_INTERVAL: 20, // minutes
  MAX_LIVES: 5,
  POINTS_PER_WIN: 10,
  SAMPLE_PAIRS_SIZE: 10,
  STREAK_RESTORE_COST: 50 // gems
};

/**
 * Regenerates lives based on time passed
 * @param {Object} user - User document
 */
function regenerateLives(user) {
  const now = new Date();
  const last = user.lastLifeUpdate || now;
  const diffMs = now - last;
  const minutesPassed = Math.floor(diffMs / (1000 * 60));
  const livesToAdd = Math.floor(minutesPassed / CONSTANTS.LIFE_REGEN_INTERVAL);

  if (livesToAdd > 0) {
    user.lives = Math.min(user.lives + livesToAdd, CONSTANTS.MAX_LIVES);
    user.lastLifeUpdate = new Date(last.getTime() + livesToAdd * CONSTANTS.LIFE_REGEN_INTERVAL * 60 * 1000);
  }
}

/**
 * Formats API response
 * @param {boolean} success - Success status
 * @param {Object} data - Response data
 * @param {string} error - Error message
 */
function formatResponse(success, data = null, error = null) {
  return {
    success,
    ...(data && { data }),
    ...(error && { error })
  };
}

/**
 * Gets or creates streak document for user
 * @param {string} userId - User ID
 * @returns {Object} Streak document
 */
async function getOrCreateStreak(userId) {
  let streak = await Streak.findOne({ userId });
  if (!streak) {
    streak = new Streak({ userId });
    await streak.save();
  }
  return streak;
}

// GET /product-pairs
exports.getProductPairs = async (req, res) => {
  try {
    // Validation handled by route middleware
    const { userId } = req.query;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json(formatResponse(false, null, 'User not found'));
    }

    regenerateLives(user);
    await user.save();

    if (user.lives <= 0) {
      return res.status(400).json(
        formatResponse(false, null, 'No lives remaining. Please wait for regeneration or buy lives.')
      );
    }

    // FIXED: Add active filter to aggregate query
    const pairs = await ImagePair.aggregate([
      { $match: { active: true } },
      { $sample: { size: CONSTANTS.SAMPLE_PAIRS_SIZE } }
    ]);

    if (pairs.length === 0) {
      return res.status(404).json(formatResponse(false, null, 'No active pairs available'));
    }

    const formattedPairs = pairs.map(p => ({
      id: p._id,
      productA: { name: p.productA.name, image: p.productA.image },
      productB: { name: p.productB.name, image: p.productB.image }
    }));

    res.json(formatResponse(true, formattedPairs));
  } catch (err) {
    console.error('getProductPairs error:', err);
    res.status(500).json(formatResponse(false, null, 'Internal server error'));
  }
};

// POST /exit-game
exports.exitGame = async (req, res) => {
  try {
    // Validation handled by route middleware
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json(formatResponse(false, null, 'User not found'));
    }

    regenerateLives(user);

    if (user.lives <= 0) {
      return res.status(400).json(
        formatResponse(false, null, 'No lives remaining. Please wait for regeneration or buy lives.')
      );
    }

    user.lives -= 1;
    user.tier = getTier(user);
    await user.save();

    // Get streak info (not affected by exit)
    const streak = await getOrCreateStreak(userId);

    res.json(formatResponse(true, {
      lives: user.lives,
      streak: streak.currentStreak,
      tier: user.tier,
      canRestoreStreak: streak.canRestoreStreak
    }));
  } catch (err) {
    console.error('exitGame error:', err);
    res.status(500).json(formatResponse(false, null, 'Internal server error'));
  }
};

// POST /validate-answer
exports.validateAnswer = async (req, res) => {
  try {
    // Validation handled by route middleware
    const { userId, pairId, choice, timedOut } = req.body;
    
    const [user, pair, streak] = await Promise.all([
      User.findById(userId),
      choice ? ImagePair.findById(pairId) : null,
      getOrCreateStreak(userId)
    ]);

    if (!user) {
      return res.status(404).json(formatResponse(false, null, 'User not found'));
    }

    regenerateLives(user);

    if (user.lives <= 0) {
      await user.save();
      return res.status(400).json(
        formatResponse(false, null, 'No lives remaining. Please wait for regeneration or buy lives.')
      );
    }

    user.gamesPlayed = (user.gamesPlayed || 0) + 1;
    let isCorrect = false;

    if (timedOut || !choice) {
      // Timeout: Lose life but counts as playing today (maintains streak)
      user.lives = Math.max(0, user.lives - 1);
      await streak.updateOnPlay();
      
      // FIXED: Track timeout in statistics if pair exists
      if (pair) {
        pair.timesShown = (pair.timesShown || 0) + 1;
        pair.lastShownAt = new Date();
        await pair.save();
      }
    } else {
      if (!pair) {
        return res.status(404).json(formatResponse(false, null, 'Pair not found'));
      }

      // FIXED: Always track that pair was shown
      pair.timesShown = (pair.timesShown || 0) + 1;
      pair.lastShownAt = new Date();

      if (
        (choice === 'A' && pair.productA.price > pair.productB.price) ||
        (choice === 'B' && pair.productB.price > pair.productA.price)
      ) {
        // Correct answer
        isCorrect = true;
        user.gamesWon = (user.gamesWon || 0) + 1;
        user.points = (user.points || 0) + CONSTANTS.POINTS_PER_WIN;
        
        // FIXED: Track correct answer in statistics
        pair.timesCorrect = (pair.timesCorrect || 0) + 1;
        
        await streak.updateOnPlay();
      } else {
        // Wrong answer: Lose life but streak NOT affected
        user.lives = Math.max(0, user.lives - 1);
        await streak.updateOnPlay();
      }

      // Save pair statistics
      await pair.save();
    }

    user.tier = getTier(user);
    await user.save();

    res.json(formatResponse(true, {
      correct: isCorrect,
      points: user.points,
      lives: user.lives,
      streak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      tier: user.tier,
      canRestoreStreak: streak.canRestoreStreak,
      timeLeftToRestore: streak.canRestoreStreakTimeLeft
    }));

  } catch (err) {
    console.error('validateAnswer error:', err);
    res.status(500).json(formatResponse(false, null, 'Internal server error'));
  }
};

// GET /streak - Get user's streak information
exports.getStreakInfo = async (req, res) => {
  try {
    // Validation handled by route middleware
    const { userId } = req.query;
    const streak = await getOrCreateStreak(userId);

    res.json(formatResponse(true, {
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      totalDaysActive: streak.totalDaysActive,
      canRestoreStreak: streak.canRestoreStreak,
      previousStreak: streak.previousStreak,
      timeLeftToRestore: streak.canRestoreStreakTimeLeft,
      nextMilestone: streak.nextMilestone,
      milestones: streak.milestones,
      isActive: streak.isActive,
      restoreCost: CONSTANTS.STREAK_RESTORE_COST
    }));
  } catch (err) {
    console.error('getStreakInfo error:', err);
    res.status(500).json(formatResponse(false, null, 'Internal server error'));
  }
};

// POST /restore-streak - Restore broken streak using gems
exports.restoreStreak = async (req, res) => {
  try {
    // Validation handled by route middleware
    const { userId, gemsToSpend } = req.body;
    
    const [user, streak] = await Promise.all([
      User.findById(userId),
      getOrCreateStreak(userId)
    ]);

    if (!user) {
      return res.status(404).json(formatResponse(false, null, 'User not found'));
    }

    if (!streak.canRestoreStreak) {
      return res.status(400).json(
        formatResponse(false, null, 'No streak available to restore')
      );
    }

    if (gemsToSpend < CONSTANTS.STREAK_RESTORE_COST) {
      return res.status(400).json(
        formatResponse(false, null, `Requires ${CONSTANTS.STREAK_RESTORE_COST} gems to restore streak`)
      );
    }

    if ((user.gems || 0) < gemsToSpend) {
      return res.status(400).json(
        formatResponse(false, null, 'Not enough gems')
      );
    }

    try {
      // Restore the streak
      await streak.restoreStreak();
      
      // Deduct gems from user
      user.gems = (user.gems || 0) - gemsToSpend;
      await user.save();

      res.json(formatResponse(true, {
        streak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        gems: user.gems,
        canRestoreStreak: streak.canRestoreStreak,
        message: 'Streak restored successfully!'
      }));
    } catch (restoreError) {
      return res.status(400).json(
        formatResponse(false, null, restoreError.message)
      );
    }
  } catch (err) {
    console.error('restoreStreak error:', err);
    res.status(500).json(formatResponse(false, null, 'Internal server error'));
  }
};

module.exports = exports;