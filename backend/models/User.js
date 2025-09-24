const mongoose = require('mongoose');

// In models/User.js
const userSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      unique: true, // Ensure unique names for providers
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      unique: true, // Ensure unique emails
    },
    // --- Game-related fields ---
    lives: {
      type: Number,
      default: 5,
      min: 0,
      max: 5,
    },
    gems: {
      type: Number,
      default: 0,
      min: 0,
    },
    streak: {
      type: Number,
      default: 0,
      min: 0,
    },
    tier: {
      type: String,
      default: 'Bronze',
      enum: ['Bronze', 'Silver', 'Gold'],
    },
    points: {
      type: Number,
      default: 0,
      min: 0,
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
