
const mongoose = require('mongoose');
const { Schema } = mongoose;


const StreakSchema = new Schema({
userId: { type: String, required: true, unique: true, index: true },
currentStreak: { type: Number, default: 0 },
lastActiveAt: { type: Date },
updatedAt: { type: Date, default: Date.now }
});


module.exports = mongoose.model('Streak', StreakSchema);