//game
const express = require('express');
const router = express.Router();
const gameEngineController = require('../controllers/gameEngineController');

router.get('/product-pairs', gameEngineController.getProductPairs);
router.post('/exit-game', gameEngineController.exitGame);
router.post('/validate-answer', gameEngineController.validateAnswer);

module.exports = router;
