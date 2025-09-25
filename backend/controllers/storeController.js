const User = require('../models/User');
const { gemPacks, lifePacks } = require('../config/storeConfig');
const Joi = require('joi');

// Constants
const CONSTANTS = {
  MAX_LIVES: 5,
  MIN_PACK_INDEX: 0
};

// Validation schemas
const purchaseSchema = Joi.object({
  userId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid user ID format'
    }),
  packIndex: Joi.number()
    .min(CONSTANTS.MIN_PACK_INDEX)
    .required()
    .messages({
      'number.min': 'Invalid pack index'
    })
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
 * Get all gem packs
 * @route GET /api/store/gems
 */
exports.getGemPacks = async (req, res) => {
  try {
    res.json(formatResponse(true, {
      packs: gemPacks.map((pack, index) => ({
        id: index,
        ...pack
      }))
    }));
  } catch (err) {
    console.error('Get gem packs error:', err);
    res.status(500).json(
      formatResponse(false, null, 'Failed to fetch gem packs')
    );
  }
};

/**
 * Get all life packs
 * @route GET /api/store/lives
 */
exports.getLifePacks = async (req, res) => {
  try {
    res.json(formatResponse(true, {
      packs: lifePacks.map((pack, index) => ({
        id: index,
        ...pack
      }))
    }));
  } catch (err) {
    console.error('Get life packs error:', err);
    res.status(500).json(
      formatResponse(false, null, 'Failed to fetch life packs')
    );
  }
};

/**
 * Purchase life pack using gems
 * @route POST /api/store/buy-lives
 */
exports.buyLives = async (req, res) => {
  try {
    // Validate request
    const { error } = purchaseSchema.validate(req.body);
    if (error) {
      return res.status(400).json(
        formatResponse(false, null, error.details[0].message)
      );
    }

    const { userId, packIndex } = req.body;

    // Validate pack exists
    if (!lifePacks[packIndex]) {
      return res.status(400).json(
        formatResponse(false, null, 'Invalid pack selection')
      );
    }

    const pack = lifePacks[packIndex];

    // Use session for transaction
    const session = await User.startSession();
    session.startTransaction();

    try {
      // Find and lock user document
      const user = await User.findById(userId).session(session);
      if (!user) {
        throw new Error('User not found');
      }

      // Validate user has enough gems
      if (user.gems < pack.gems) {
        throw new Error(`Not enough gems. Required: ${pack.gems}, Available: ${user.gems}`);
      }

      // Process purchase
      user.gems -= pack.gems;
      user.lives = Math.min(
        (user.lives || 0) + (pack.lives || 0),
        CONSTANTS.MAX_LIVES
      );

      // Save changes
      await user.save({ session });
      await session.commitTransaction();

      // Return updated user state
      res.json(formatResponse(true, {
        lives: user.lives,
        gems: user.gems,
        purchasedPack: {
          index: packIndex,
          lives: pack.lives,
          cost: pack.gems
        }
      }));
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (err) {
    console.error('Buy lives error:', err);
    res.status(500).json(
      formatResponse(false, null, err.message || 'Purchase failed')
    );
  }
};

/**
 * Get user's store status (remaining gems, lives)
 * @route GET /api/store/status/:userId
 */
exports.getUserStoreStatus = async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate userId
    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json(
        formatResponse(false, null, 'Invalid user ID format')
      );
    }

    const user = await User.findById(userId)
      .select('gems lives')
      .lean();

    if (!user) {
      return res.status(404).json(
        formatResponse(false, null, 'User not found')
      );
    }

    res.json(formatResponse(true, {
      gems: user.gems,
      lives: user.lives,
      maxLives: CONSTANTS.MAX_LIVES
    }));
  } catch (err) {
    console.error('Get user store status error:', err);
    res.status(500).json(
      formatResponse(false, null, 'Failed to fetch user status')
    );
  }
};
