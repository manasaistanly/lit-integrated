const Streak = require('../models/Streak');
const Joi = require('joi');

// Constants
const CONSTANTS = {
  MIN_STREAK: 0,
  DEFAULT_STREAK: 1,
  MS_PER_DAY: 1000 * 60 * 60 * 24
};

// Validation schemas
const userIdSchema = Joi.object({
  userId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid user ID format'
    })
});

const resetStreakSchema = Joi.object({
  userId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required(),
  to: Joi.number()
    .min(0)
    .max(1)
    .default(0)
});

// Helper for consistent response format
function formatResponse(success, data = null, error = null) {
  return {
    success,
    ...(data && { data }),
    ...(error && { error })
  };
}

/**
 * Get start of UTC day
 * @param {Date} date - Date to convert
 * @returns {Date} Start of UTC day
 */
function startOfUTCDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Calculate days difference between two dates
 * @param {Date} date1 - First date
 * @param {Date} date2 - Second date
 * @returns {number} Days difference
 */
function getDaysDifference(date1, date2) {
  return (startOfUTCDay(date1).getTime() - startOfUTCDay(date2).getTime()) / 
         CONSTANTS.MS_PER_DAY;
}

/**
 * Record a user's daily streak
 * @route POST /api/streak/record
 */
exports.recordStreak = async (req, res) => {
  try {
    // Validate request
    const { error } = userIdSchema.validate(req.body);
    if (error) {
      return res.status(400).json(
        formatResponse(false, null, error.details[0].message)
      );
    }

    const { userId } = req.body;
    const now = new Date();

    // Use session for transaction
    const session = await Streak.startSession();
    session.startTransaction();

    try {
      // Find or create streak document with lock
      let streak = await Streak.findOne({ userId }).session(session);

      if (!streak) {
        streak = new Streak({
          userId,
          currentStreak: CONSTANTS.DEFAULT_STREAK,
          lastActiveAt: now
        });
      } else {
        const last = streak.lastActiveAt ? new Date(streak.lastActiveAt) : null;
        
        if (last) {
          const daysDiff = getDaysDifference(now, last);

          if (daysDiff === 0) {
            return res.json(formatResponse(true, {
              userId,
              currentStreak: streak.currentStreak,
              lastActiveAt: streak.lastActiveAt,
              message: 'Already recorded today'
            }));
          }

          streak.currentStreak = daysDiff === 1 ? 
            streak.currentStreak + 1 : CONSTANTS.DEFAULT_STREAK;
        } else {
          streak.currentStreak = CONSTANTS.DEFAULT_STREAK;
        }
      }

      streak.lastActiveAt = now;
      streak.updatedAt = now;
      
      await streak.save({ session });
      await session.commitTransaction();

      res.json(formatResponse(true, {
        userId,
        currentStreak: streak.currentStreak,
        lastActiveAt: streak.lastActiveAt
      }));
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (err) {
    console.error('Record streak error:', err);
    res.status(500).json(
      formatResponse(false, null, 'Failed to record streak')
    );
  }
};

/**
 * Get a user's current streak
 * @route GET /api/streak/:userId
 */
exports.getStreak = async (req, res) => {
  try {
    const { error } = userIdSchema.validate(req.params);
    if (error) {
      return res.status(400).json(
        formatResponse(false, null, error.details[0].message)
      );
    }

    const { userId } = req.params;
    const streak = await Streak.findOne({ userId }).lean();

    if (!streak) {
      return res.json(formatResponse(true, {
        userId,
        currentStreak: CONSTANTS.MIN_STREAK
      }));
    }

    // Check if streak is still valid
    const now = new Date();
    const daysSinceLastActive = streak.lastActiveAt ? 
      getDaysDifference(now, streak.lastActiveAt) : null;

    const currentStreak = daysSinceLastActive > 1 ? 
      CONSTANTS.MIN_STREAK : streak.currentStreak;

    res.json(formatResponse(true, {
      userId,
      currentStreak,
      lastActiveAt: streak.lastActiveAt
    }));
  } catch (err) {
    console.error('Get streak error:', err);
    res.status(500).json(
      formatResponse(false, null, 'Failed to get streak')
    );
  }
};

/**
 * Reset a user's streak
 * @route POST /api/streak/reset/:userId
 */
exports.resetStreak = async (req, res) => {
  try {
    const { error } = resetStreakSchema.validate({
      ...req.params,
      ...req.body
    });
    if (error) {
      return res.status(400).json(
        formatResponse(false, null, error.details[0].message)
      );
    }

    const { userId } = req.params;
    const to = req.body.to === 0 ? 0 : 1;

    const streak = await Streak.findOneAndUpdate(
      { userId },
      {
        currentStreak: to,
        lastActiveAt: to === 0 ? null : new Date(),
        updatedAt: new Date()
      },
      {
        upsert: true,
        new: true,
        runValidators: true
      }
    );

    res.json(formatResponse(true, {
      userId,
      currentStreak: streak.currentStreak
    }));
  } catch (err) {
    console.error('Reset streak error:', err);
    res.status(500).json(
      formatResponse(false, null, 'Failed to reset streak')
    );
  }
};

/**
 * Get top streaks
 * @route GET /api/streak/top/:limit?
 */
exports.getTopStreaks = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.params.limit) || 10, 100);

    const topStreaks = await Streak.find()
      .sort({ currentStreak: -1 })
      .limit(limit)
      .select('userId currentStreak lastActiveAt')
      .lean();

    res.json(formatResponse(true, { streaks: topStreaks }));
  } catch (err) {
    console.error('Get top streaks error:', err);
    res.status(500).json(
      formatResponse(false, null, 'Failed to get top streaks')
    );
  }
};
