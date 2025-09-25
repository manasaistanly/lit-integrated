//game
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
  })
};

// Game routes
router.get('/product-pairs',
  auth,
  gameLimiter,
  validateRequest(validationSchemas.productPairs, 'query'),
  gameEngineController.getProductPairs
);

router.post('/exit-game',
  auth,
  gameLimiter,
  validateRequest(validationSchemas.exitGame),
  gameEngineController.exitGame
);

router.post('/validate-answer',
  auth,
  gameLimiter,
  validateRequest(validationSchemas.validateAnswer),
  gameEngineController.validateAnswer
);

// Game status route (optional)
router.get('/status',
  auth,
  async (req, res) => {
    try {
      res.json({
        status: 'operational',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ error: 'Service unavailable' });
    }
  }
);

module.exports = router;
