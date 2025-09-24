const mongoose = require('mongoose');
const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: String,
  message: String,
  data: Object,
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Notification', notificationSchema);



// notification for
// const mongoose = require('mongoose');
const { Schema } = mongoose;


const NotificationSchema = new Schema({
recipientId: { type: String, required: true, index: true },
title: { type: String, required: true },
body: { type: String },
data: { type: Schema.Types.Mixed },
read: { type: Boolean, default: false, index: true },
createdAt: { type: Date, default: Date.now, index: true },
pushSent: { type: Boolean, default: false },
pushResponse: { type: Schema.Types.Mixed }
}, { timestamps: false });


module.exports = mongoose.model('Notification', NotificationSchema);