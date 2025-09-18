const mongoose = require('mongoose');
const supportQuerySchema = new mongoose.Schema({
  name: String,
  email: String,
  message: String,
  createdAt: { type: Date, default: Date.now },
  resolved: { type: Boolean, default: false }
});
module.exports = mongoose.model('SupportQuery', supportQuerySchema);
