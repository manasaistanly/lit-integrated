const express = require('express');
const router = express.Router();
const shopController = require('../controllers/shopController');

router.get('/gems', shopController.getGemPacks);
router.get('/lives', shopController.getLifePacks);
router.get('/streaks', shopController.getStreakPacks);

router.post('/buy-lives', shopController.buyLives);
router.post('/buy-streak', shopController.buyStreak);

module.exports = router;
