//game
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');

// List all notifications for the logged-in user
router.get('/', notificationController.fetchNotifications);

// Mark a notification as read
router.patch('/:id/read', notificationController.markAsRead);

module.exports = router;
