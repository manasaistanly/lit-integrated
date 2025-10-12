const mongoose = require('mongoose');
const { Schema } = mongoose;

// Constants
const CONSTANTS = {
  MIN_STREAK: 0,
  MAX_STREAK: 365,
  MILLISECONDS_PER_DAY: 24 * 60 * 60 * 1000,
  STREAK_RESTORE_WINDOW_DAYS: 7 // Can restore streak within 7 days of breaking it
};

const StreakSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    unique: true,
    index: true
  },
  currentStreak: {
    type: Number,
    default: CONSTANTS.MIN_STREAK,
    min: [CONSTANTS.MIN_STREAK, 'Streak cannot be negative'],
    max: [CONSTANTS.MAX_STREAK, `Streak cannot exceed ${CONSTANTS.MAX_STREAK} days`],
    validate: {
      validator: Number.isInteger,
      message: 'Streak must be a whole number'
    }
  },
  longestStreak: {
    type: Number,
    default: CONSTANTS.MIN_STREAK,
    min: CONSTANTS.MIN_STREAK
  },
  totalDaysActive: {
    type: Number,
    default: 0,
    min: 0
  },
  lastActiveAt: {
    type: Date,
    default: null
  },
  streakStartedAt: {
    type: Date,
    default: null
  },
  // NEW: Streak restoration tracking
  canRestoreStreak: {
    type: Boolean,
    default: false
  },
  previousStreak: {
    type: Number,
    default: 0,
    min: 0
  },
  streakBrokenAt: {
    type: Date,
    default: null
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  milestones: [{
    days: Number,
    achievedAt: Date,
    reward: {
      type: String,
      gems: Number
    }
  }],
  metadata: {
    type: Map,
    of: String,
    default: () => new Map()
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
StreakSchema.index({ currentStreak: -1 });
StreakSchema.index({ lastActiveAt: 1 });
StreakSchema.index({ canRestoreStreak: 1, streakBrokenAt: 1 });

// Virtual Properties
StreakSchema.virtual('isActive').get(function() {
  if (!this.lastActiveAt) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastActive = new Date(this.lastActiveAt);
  lastActive.setHours(0, 0, 0, 0);
  const daysDiff = Math.floor((today - lastActive) / CONSTANTS.MILLISECONDS_PER_DAY);
  return daysDiff <= 1; // Active if played today or yesterday
});

StreakSchema.virtual('nextMilestone').get(function() {
  const milestones = [7, 14, 30, 60, 90, 180, 365];
  return milestones.find(m => m > this.currentStreak) || null;
});

StreakSchema.virtual('streakAge').get(function() {
  if (!this.streakStartedAt) return 0;
  return Math.floor((Date.now() - this.streakStartedAt) / CONSTANTS.MILLISECONDS_PER_DAY);
});

StreakSchema.virtual('canRestoreStreakTimeLeft').get(function() {
  if (!this.canRestoreStreak || !this.streakBrokenAt) return 0;
  const daysSinceBroken = Math.floor(
    (Date.now() - this.streakBrokenAt) / CONSTANTS.MILLISECONDS_PER_DAY
  );
  return Math.max(0, CONSTANTS.STREAK_RESTORE_WINDOW_DAYS - daysSinceBroken);
});

// Methods

/**
 * Updates streak based on play pattern
 * @param {boolean} isCorrect - Whether answer was correct (doesn't affect streak)
 * @param {boolean} timedOut - Whether the game timed out
 * @returns {Object} - Update result with streak info
 */
StreakSchema.methods.updateOnPlay = async function() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (!this.lastActiveAt) {
    // First time playing
    this.currentStreak = 1;
    this.lastActiveAt = now;
    this.streakStartedAt = now;
    this.totalDaysActive = 1;
    this.canRestoreStreak = false;
    await this.checkMilestone();
    return this.save();
  }

  const lastActive = new Date(this.lastActiveAt);
  lastActive.setHours(0, 0, 0, 0);
  const daysDifference = Math.floor((now - lastActive) / CONSTANTS.MILLISECONDS_PER_DAY);

  if (daysDifference === 0) {
    // Playing on same day - no streak change
    return this;
  } else if (daysDifference === 1) {
    // Playing consecutive day - increment streak
    this.currentStreak += 1;
    this.totalDaysActive += 1;
    this.lastActiveAt = now;
    this.canRestoreStreak = false;
    
    if (this.currentStreak > this.longestStreak) {
      this.longestStreak = this.currentStreak;
    }
    
    await this.checkMilestone();
  } else {
    // Skipped day(s) - streak broken but can be restored
    this.previousStreak = this.currentStreak;
    this.currentStreak = 1;
    this.lastActiveAt = now;
    this.streakStartedAt = now;
    this.streakBrokenAt = now;
    this.canRestoreStreak = true;
    this.totalDaysActive += 1;
  }

  this.updatedAt = now;
  return this.save();
};

/**
 * Restores a broken streak using gems
 * @returns {Object} - Restored streak info
 */
StreakSchema.methods.restoreStreak = async function() {
  if (!this.canRestoreStreak) {
    throw new Error('No streak available to restore');
  }

  // Check if restore window has expired
  if (this.streakBrokenAt) {
    const daysSinceBroken = Math.floor(
      (Date.now() - this.streakBrokenAt) / CONSTANTS.MILLISECONDS_PER_DAY
    );
    if (daysSinceBroken > CONSTANTS.STREAK_RESTORE_WINDOW_DAYS) {
      this.canRestoreStreak = false;
      await this.save();
      throw new Error('Streak restore window has expired');
    }
  }

  // Restore the streak
  this.currentStreak = this.previousStreak + 1; // Add current day to restored streak
  this.canRestoreStreak = false;
  this.previousStreak = 0;
  this.streakBrokenAt = null;

  if (this.currentStreak > this.longestStreak) {
    this.longestStreak = this.currentStreak;
  }

  this.updatedAt = new Date();
  return this.save();
};

/**
 * Check and award milestone if reached
 */
StreakSchema.methods.checkMilestone = async function() {
  const milestones = [7, 14, 30, 60, 90, 180, 365];
  const milestone = milestones.find(m => m === this.currentStreak);
  
  if (milestone) {
    // Check if milestone already achieved
    const alreadyAchieved = this.milestones.some(m => m.days === milestone);
    if (!alreadyAchieved) {
      this.milestones.push({
        days: milestone,
        achievedAt: new Date(),
        reward: this.calculateMilestoneReward(milestone)
      });
    }
  }
};

/**
 * Resets streak completely (admin/debug use)
 */
StreakSchema.methods.resetStreak = async function() {
  this.currentStreak = CONSTANTS.MIN_STREAK;
  this.lastActiveAt = null;
  this.streakStartedAt = null;
  this.canRestoreStreak = false;
  this.previousStreak = 0;
  this.streakBrokenAt = null;
  this.updatedAt = new Date();
  return this.save();
};

StreakSchema.methods.calculateMilestoneReward = function(days) {
  const gems = Math.floor(Math.sqrt(days) * 10);
  return {
    type: 'milestone',
    gems
  };
};

// Statics
StreakSchema.statics.getTopStreaks = function(limit = 10) {
  return this.find()
    .sort({ currentStreak: -1 })
    .limit(limit)
    .populate('userId', 'name avatar')
    .lean();
};

StreakSchema.statics.getMilestoneAchievers = function(milestone) {
  return this.find({
    'milestones.days': milestone
  })
    .populate('userId', 'name avatar')
    .lean();
};

/**
 * Clean up expired restore windows (run as cron job)
 */
StreakSchema.statics.cleanupExpiredRestores = async function() {
  const expiredDate = new Date();
  expiredDate.setDate(expiredDate.getDate() - CONSTANTS.STREAK_RESTORE_WINDOW_DAYS);
  
  return this.updateMany(
    {
      canRestoreStreak: true,
      streakBrokenAt: { $lt: expiredDate }
    },
    {
      $set: {
        canRestoreStreak: false,
        previousStreak: 0
      }
    }
  );
};

// Middleware
StreakSchema.pre('save', function(next) {
  if (this.isModified('currentStreak')) {
    if (this.currentStreak > this.longestStreak) {
      this.longestStreak = this.currentStreak;
    }
  }
  next();
});

// Create model
const Streak = mongoose.model('Streak', StreakSchema);

// Create indexes
Streak.createIndexes().catch(err => {
  console.error('Error creating streak indexes:', err);
});

module.exports = Streak;