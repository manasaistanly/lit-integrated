//game
const express = require('express');
const router = express.Router();
const gameEngineController = require('../controllers/gameEngineController');
const auth = require('../middleware/auth');

router.get('/product-pairs', auth, gameEngineController.getProductPairs);
router.post('/exit-game', auth, gameEngineController.exitGame);
router.post('/validate-answer', auth, gameEngineController.validateAnswer);

module.exports = router;
