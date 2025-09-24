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




// notification for 

// const Notification = require('../models/Notification');



exports.getNotifications = async (req, res) => {
try {
const { userId, unreadOnly, limit = 50, skip = 0 } = req.query;
if (!userId) return res.status(400).json({ error: 'userId query param required' });


const q = { recipientId: userId };
if (unreadOnly === 'true' || unreadOnly === true) q.read = false;


const items = await Notification.find(q)
.sort({ createdAt: -1 })
.skip(parseInt(skip))
.limit(Math.min(200, parseInt(limit)));


res.json({ items });
} catch (err) {
console.error(err);
res.status(500).json({ error: 'server error' });
}
};


exports.markRead = async (req, res) => {
try {
const { id } = req.params;
const notif = await Notification.findByIdAndUpdate(id, { read: true }, { new: true });
if (!notif) return res.status(404).json({ error: 'not found' });
res.json({ success: true, notification: notif });
} catch (err) {
console.error(err);
res.status(500).json({ error: 'server error' });
}
};


exports.markAllRead = async (req, res) => {
try {
const { userId } = req.body;
if (!userId) return res.status(400).json({ error: 'userId required' });
const r = await Notification.updateMany({ recipientId: userId, read: false }, { $set: { read: true } });
res.json({ success: true, matched: r.matchedCount || r.n, modified: r.modifiedCount || r.nModified });
} catch (err) {
console.error(err);
res.status(500).json({ error: 'server error' });
}
};


exports.unreadCount = async (req, res) => {
try {
const { userId } = req.query;
if (!userId) return res.status(400).json({ error: 'userId required' });
const count = await Notification.countDocuments({ recipientId: userId, read: false });
res.json({ unread: count });
} catch (err) {
console.error(err);
res.status(500).json({ error: 'server error' });
}
};