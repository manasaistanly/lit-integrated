
const express = require('express');
const router = express.Router();
const streakController = require('../controllers/streakController');


router.post('/record', streakController.recordStreak);
router.get('/:userId', streakController.getStreak);
router.post('/reset/:userId', streakController.resetStreak);


module.exports = router;