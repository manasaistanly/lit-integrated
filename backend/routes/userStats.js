const express = require('express');
const router = express.Router();
const userStatsController = require('../controllers/userStatsController');

router.get('/users/:userId/stats', userStatsController.getStats);
router.patch('/users/:userId/stats', userStatsController.updateStats);
router.post('/users/:userId/purchase-lives', userStatsController.purchaseLives);
router.post('/users/:userId/redeem-coupon', userStatsController.redeemCoupon);
router.post('/users/:userId/play', userStatsController.handleGameplay);
router.post('/users/:userId/buy-streak-continue', userStatsController.buyStreakContinue);

module.exports = router;
