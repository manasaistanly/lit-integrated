const mongoose = require('mongoose');
const { Schema } = mongoose;

// Constants
const CONSTANTS = {
  MIN_STREAK: 0,
  MAX_STREAK: 365, // Maximum reasonable streak (1 year)
  STREAK_BREAK_HOURS: 48, // Consider streak broken after 48 hours
  MILLISECONDS_PER_DAY: 24 * 60 * 60 * 1000
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
    required: true,
    default: Date.now
  },
  streakStartedAt: {
    type: Date,
    default: Date.now
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
StreakSchema.index({ currentStreak: -1 }); // For leaderboards
StreakSchema.index({ lastActiveAt: 1 }); // For streak maintenance

// Virtual Properties
StreakSchema.virtual('isActive').get(function() {
  if (!this.lastActiveAt) return false;
  const hoursSinceLastActive = (Date.now() - this.lastActiveAt) / (60 * 60 * 1000);
  return hoursSinceLastActive < CONSTANTS.STREAK_BREAK_HOURS;
});

StreakSchema.virtual('nextMilestone').get(function() {
  const milestones = [7, 14, 30, 60, 90, 180, 365];
  return milestones.find(m => m > this.currentStreak) || null;
});

StreakSchema.virtual('streakAge').get(function() {
  if (!this.streakStartedAt) return 0;
  return Math.floor((Date.now() - this.streakStartedAt) / CONSTANTS.MILLISECONDS_PER_DAY);
});

// Methods
StreakSchema.methods.checkAndUpdateStreak = async function() {
  const now = new Date();
  const lastActive = this.lastActiveAt || now;
  const daysDifference = Math.floor(
    (now - lastActive) / CONSTANTS.MILLISECONDS_PER_DAY
  );

  if (daysDifference > 1) {
    // Streak broken
    this.currentStreak = 1;
    this.streakStartedAt = now;
  } else if (daysDifference === 1) {
    // Streak continues
    this.currentStreak += 1;
    this.totalDaysActive += 1;
    
    // Update longest streak
    if (this.currentStreak > this.longestStreak) {
      this.longestStreak = this.currentStreak;
    }

    // Check for milestones
    const milestone = this.nextMilestone;
    if (milestone && this.currentStreak === milestone) {
      this.milestones.push({
        days: milestone,
        achievedAt: now,
        reward: this.calculateMilestoneReward(milestone)
      });
    }
  }

  this.lastActiveAt = now;
  this.updatedAt = now;
  return this.save();
};

StreakSchema.methods.resetStreak = async function() {
  this.currentStreak = CONSTANTS.MIN_STREAK;
  this.lastActiveAt = null;
  this.streakStartedAt = null;
  this.updatedAt = new Date();
  return this.save();
};

StreakSchema.methods.calculateMilestoneReward = function(days) {
  // Example reward calculation
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

// Middleware
StreakSchema.pre('save', function(next) {
  if (this.isModified('currentStreak')) {
    // Update longest streak if necessary
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