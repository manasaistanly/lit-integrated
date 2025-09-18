//game
const express = require('express');
const router = express.Router();
const shopController = require('../controllers/shopController');

router.get('/gems', shopController.getGemPacks);
router.get('/lives', shopController.getLifePacks);
router.post('/buy-gems', shopController.buyGems);
router.post('/buy-life', shopController.buyLife);

module.exports = router;
