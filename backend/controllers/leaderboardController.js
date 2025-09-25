const User = require('../models/User');
const Joi = require('joi');

// Constants
const CONSTANTS = {
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
  MIN_GAMES_FOR_WINRATE: 10,
  CACHE_TTL: 5 * 60 * 1000, // 5 minutes in milliseconds
};

// Cache for leaderboard data
let cache = {
  points: { data: null, timestamp: 0 },
  streak: { data: null, timestamp: 0 },
  winRate: { data: null, timestamp: 0 },
  topScore: { data: null, timestamp: 0 }
};

// Validation schema
const querySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(CONSTANTS.MAX_LIMIT).default(CONSTANTS.DEFAULT_LIMIT)
});

// Helper function for consistent response format
function formatResponse(success, data = null, error = null) {
  return {
    success,
    ...(data && { data }),
    ...(error && { error })
  };
}

// Cache helper
function isCacheValid(type) {
  return (
    cache[type].data &&
    Date.now() - cache[type].timestamp < CONSTANTS.CACHE_TTL
  );
}

// GET /leaderboard/points?limit=10
exports.topByPoints = async (req, res) => {
  try {
    // Validate query parameters
    const { error, value } = querySchema.validate(req.query);
    if (error) {
      return res.status(400).json(
        formatResponse(false, null, error.details[0].message)
      );
    }

    // Check cache
    if (isCacheValid('points')) {
      return res.json(formatResponse(true, cache.points.data));
    }

    const users = await User.find()
      .sort({ points: -1 })
      .limit(value.limit)
      .select('name points tier streak avatar')
      .lean();

    // Update cache
    cache.points = {
      data: users,
      timestamp: Date.now()
    };

    res.json(formatResponse(true, users));
  } catch (err) {
    console.error('Leaderboard points error:', err);
    res.status(500).json(
      formatResponse(false, null, 'Internal server error')
    );
  }
};

// GET /leaderboard/streak?limit=10
exports.topByStreak = async (req, res) => {
  try {
    const { error, value } = querySchema.validate(req.query);
    if (error) {
      return res.status(400).json(
        formatResponse(false, null, error.details[0].message)
      );
    }

    if (isCacheValid('streak')) {
      return res.json(formatResponse(true, cache.streak.data));
    }

    const users = await User.find()
      .sort({ streak: -1 })
      .limit(value.limit)
      .select('name points tier streak avatar')
      .lean();

    cache.streak = {
      data: users,
      timestamp: Date.now()
    };

    res.json(formatResponse(true, users));
  } catch (err) {
    console.error('Leaderboard streak error:', err);
    res.status(500).json(
      formatResponse(false, null, 'Internal server error')
    );
  }
};

// GET /leaderboard/winrate?limit=10
exports.topByWinRate = async (req, res) => {
  try {
    const { error, value } = querySchema.validate(req.query);
    if (error) {
      return res.status(400).json(
        formatResponse(false, null, error.details[0].message)
      );
    }

    if (isCacheValid('winRate')) {
      return res.json(formatResponse(true, cache.winRate.data));
    }

    const users = await User.find({
      gamesPlayed: { $gt: CONSTANTS.MIN_GAMES_FOR_WINRATE }
    })
      .select('name gamesPlayed gamesWon points tier streak avatar')
      .lean();

    const rankedUsers = users
      .map(u => ({
        ...u,
        winRate: +(u.gamesWon / u.gamesPlayed * 100).toFixed(2)
      }))
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, value.limit)
      .map(({ gamesWon, ...user }) => user); // Remove gamesWon from response

    cache.winRate = {
      data: rankedUsers,
      timestamp: Date.now()
    };

    res.json(formatResponse(true, rankedUsers));
  } catch (err) {
    console.error('Leaderboard winrate error:', err);
    res.status(500).json(
      formatResponse(false, null, 'Internal server error')
    );
  }
};

// GET /leaderboard/top5percent-score
exports.topFivePercentScore = async (req, res) => {
  try {
    if (isCacheValid('topScore')) {
      return res.json(formatResponse(true, cache.topScore.data));
    }

    const totalUsers = await User.countDocuments();
    const cutoffIndex = Math.max(0, Math.floor(totalUsers * 0.05) - 1);

    if (totalUsers === 0) {
      return res.json(formatResponse(true, { cutoffScore: 0 }));
    }

    const users = await User.find()
      .sort({ points: -1 })
      .skip(cutoffIndex)
      .limit(1)
      .select('points')
      .lean();

    const result = { cutoffScore: users[0]?.points || 0 };

    cache.topScore = {
      data: result,
      timestamp: Date.now()
    };

    res.json(formatResponse(true, result));
  } catch (err) {
    console.error('Top 5% score error:', err);
    res.status(500).json(
      formatResponse(false, null, 'Internal server error')
    );
  }
};

// Optional: Cache invalidation endpoint (protected by admin auth)
exports.invalidateCache = async (req, res) => {
  try {
    cache = {
      points: { data: null, timestamp: 0 },
      streak: { data: null, timestamp: 0 },
      winRate: { data: null, timestamp: 0 },
      topScore: { data: null, timestamp: 0 }
    };
    res.json(formatResponse(true, { message: 'Cache invalidated successfully' }));
  } catch (err) {
    console.error('Cache invalidation error:', err);
    res.status(500).json(
      formatResponse(false, null, 'Internal server error')
    );
  }
};
