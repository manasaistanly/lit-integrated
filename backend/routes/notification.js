//game
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');

// List all notifications for the logged-in user
router.get('/', notificationController.fetchNotifications);

// Mark a notification as read
router.patch('/:id/read', notificationController.markAsRead);



// for strike routes

router.post('/push', notificationController.pushNotification);
router.get('/', notificationController.getNotifications);
router.post('/:id/mark-read', notificationController.markRead);
router.post('/mark-all-read', notificationController.markAllRead);
router.get('/unread-count', notificationController.unreadCount);


module.exports = router;
