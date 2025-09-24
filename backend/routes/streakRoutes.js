
const express = require('express');
const router = express.Router();
const streakController = require('../controllers/streakController');


router.post('/track', streakController.trackStreak);
router.get('/:userId', streakController.getStreak);
router.post('/:userId/reset', streakController.resetStreak);


module.exports = router;