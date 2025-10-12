const express = require('express');
const router = express.Router();
const gameEngineController = require('../controllers/gameEngineController');
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const { validateRequest } = require('../middleware/validateRequest');
const Joi = require('joi');

// Rate limiting configuration
const gameLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many game requests, please try again later'
});

// Stricter rate limit for gem-based actions
const gemActionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit gem actions to prevent abuse
  message: 'Too many gem action requests, please try again later'
});

// Input validation schemas
const validationSchemas = {
  productPairs: Joi.object({
    userId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required()
  }),
  
  exitGame: Joi.object({
    userId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required()
  }),
  
  validateAnswer: Joi.object({
    userId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    pairId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    choice: Joi.string().valid('A', 'B').optional(),
    timedOut: Joi.boolean().optional()
  }),

  // NEW: Streak restoration validation
  restoreStreak: Joi.object({
    userId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    gemsToSpend: Joi.number().integer().min(1).max(100).required()
  }),

  // NEW: Get streak info validation
  getStreak: Joi.object({
    userId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required()
  })
};

// ===== GAME ROUTES =====

// Get product pairs for gameplay
router.get('/product-pairs',
  auth,
  gameLimiter,
  validateRequest(validationSchemas.productPairs, 'query'),
  gameEngineController.getProductPairs
);

// Exit game (lose life but keep streak)
router.post('/exit-game',
  auth,
  gameLimiter,
  validateRequest(validationSchemas.exitGame),
  gameEngineController.exitGame
);

// Validate answer (correct/wrong/timeout)
router.post('/validate-answer',
  auth,
  gameLimiter,
  validateRequest(validationSchemas.validateAnswer),
  gameEngineController.validateAnswer
);

// ===== STREAK ROUTES =====

// Get user's streak information
router.get('/streak',
  auth,
  validateRequest(validationSchemas.getStreak, 'query'),
  gameEngineController.getStreakInfo
);

// Restore broken streak using gems
router.post('/restore-streak',
  auth,
  gemActionLimiter,
  validateRequest(validationSchemas.restoreStreak),
  gameEngineController.restoreStreak
);

// Get streak leaderboard
router.get('/streak/leaderboard',
  auth,
  async (req, res) => {
    try {
      const Streak = require('../models/Streak');
      const limit = parseInt(req.query.limit) || 10;
      const topStreaks = await Streak.getTopStreaks(limit);
      
      res.json({
        success: true,
        data: topStreaks
      });
    } catch (error) {
      console.error('Leaderboard error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to fetch leaderboard' 
      });
    }
  }
);

// ===== STATUS & HEALTH ROUTES =====

// Game status route
router.get('/status',
  auth,
  async (req, res) => {
    try {
      res.json({
        status: 'operational',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: 'Service unavailable' 
      });
    }
  }
);

// Health check (no auth required)
router.get('/health',
  async (req, res) => {
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  }
);

module.exports = router;