//game
const express = require('express');
const router = express.Router();
const leaderboardController = require('../controllers/leaderboardController');

router.get('/points', leaderboardController.topByPoints);
router.get('/streak', leaderboardController.topByStreak);
router.get('/winrate', leaderboardController.topByWinRate);
router.get('/top5percent-score', leaderboardController.topFivePercentScore);

module.exports = router;
