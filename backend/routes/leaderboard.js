//game
const express = require('express');
const router = express.Router();
const leaderboardController = require('../controllers/leaderboardController');
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const cache = require('express-cache-controller');
const Joi = require('joi');

// Rate limiting configuration
const leaderboardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many leaderboard requests, please try again later'
});

// Validation schemas
const querySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(10),
  page: Joi.number().integer().min(1).default(1)
});

// Validation middleware
const validateQuery = (req, res, next) => {
  const { error, value } = querySchema.validate(req.query);
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }
  req.validatedQuery = value;
  next();
};

// Cache configuration
const shortCache = cache({
  maxAge: 60, // 1 minute
  private: true
});

const longCache = cache({
  maxAge: 300, // 5 minutes
  private: true
});

/**
 * Get top players by points
 * @route GET /api/leaderboard/points
 */
router.get('/points',
  auth,
  leaderboardLimiter,
  validateQuery,
  shortCache,
  leaderboardController.topByPoints
);

/**
 * Get top players by streak
 * @route GET /api/leaderboard/streak
 */
router.get('/streak',
  auth,
  leaderboardLimiter,
  validateQuery,
  shortCache,
  leaderboardController.topByStreak
);

/**
 * Get top players by win rate
 * @route GET /api/leaderboard/winrate
 */
router.get('/winrate',
  auth,
  leaderboardLimiter,
  validateQuery,
  shortCache,
  leaderboardController.topByWinRate
);

/**
 * Get top 5% score threshold
 * @route GET /api/leaderboard/top5percent-score
 */
router.get('/top5percent-score',
  auth,
  leaderboardLimiter,
  longCache,
  leaderboardController.topFivePercentScore
);

/**
 * Get user's ranking
 * @route GET /api/leaderboard/my-rank/:userId
 */
router.get('/my-rank/:userId',
  auth,
  leaderboardLimiter,
  async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Validate userId format
      if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid user ID format'
        });
      }

      // Get user's rankings in different categories
      const [pointsRank, streakRank, winRateRank] = await Promise.all([
        leaderboardController.getUserRankByPoints(userId),
        leaderboardController.getUserRankByStreak(userId),
        leaderboardController.getUserRankByWinRate(userId)
      ]);

      res.json({
        success: true,
        data: {
          pointsRank,
          streakRank,
          winRateRank
        }
      });
    } catch (err) {
      console.error('Get user rank error:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to get user rankings'
      });
    }
  }
);

/**
 * Get weekly leaders
 * @route GET /api/leaderboard/weekly
 */
router.get('/weekly',
  auth,
  leaderboardLimiter,
  validateQuery,
  shortCache,
  async (req, res) => {
    try {
      const weeklyLeaders = await leaderboardController.getWeeklyLeaders();
      res.json({
        success: true,
        data: weeklyLeaders
      });
    } catch (error) {
      console.error('Weekly leaderboard error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch weekly leaderboard'
      });
    }
  }
);

/**
 * Invalidate leaderboard cache (admin only)
 * @route POST /api/leaderboard/invalidate-cache
 */
router.post('/invalidate-cache',
  auth,
  async (req, res) => {
    try {
      // Note: Implement proper admin check here
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      // Implement cache invalidation logic here
      // This depends on your caching solution

      res.json({
        success: true,
        message: 'Cache invalidated successfully'
      });
    } catch (err) {
      console.error('Cache invalidation error:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to invalidate cache'
      });
    }
  }
);

module.exports = router;
