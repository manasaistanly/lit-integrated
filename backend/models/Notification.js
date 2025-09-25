const mongoose = require('mongoose');
const { Schema } = mongoose;

const NotificationSchema = new Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  recipientId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  body: { type: String },
  type: String,
  message: String,
  data: { type: Schema.Types.Mixed },
  read: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now, index: true },
  pushSent: { type: Boolean, default: false },
  pushResponse: { type: Schema.Types.Mixed }
}, { timestamps: false });

// Check if model exists, else create
const Notification = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);

module.exports = Notification;
