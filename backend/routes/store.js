//game
const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');

router.get('/gems', storeController.getGemPacks);
router.post('/buy-gems', storeController.buyGems);
router.get('/lives', storeController.getLifePacks);
router.post('/buy-lives', storeController.buyLives);

module.exports = router;
