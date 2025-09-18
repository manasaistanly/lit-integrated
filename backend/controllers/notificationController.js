const Notification = require('../models/Notification');

// Server-side push (invoke from other controllers as a helper)
exports.pushNotification = async (userId, type, message, data = {}) => {
  await Notification.create({ user: userId, type, message, data });
};

// GET /api/notifications — list all notifications for logged-in user
exports.fetchNotifications = async (req, res) => {
  const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json(notifications);
};

// PATCH /api/notifications/:id/read — mark a notification as read
exports.markAsRead = async (req, res) => {
  await Notification.findByIdAndUpdate(req.params.id, { read: true });
  res.json({ success: true });
};
