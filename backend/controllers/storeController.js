const User = require('../models/User');
const { gemPacks, lifePacks } = require('../config/storeConfig');
const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay
let razorpay;
try {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
} catch (error) {
  console.error('Razorpay initialization failed:', error);
}

// Constants
const CONSTANTS = {
  MAX_LIVES: 5,
  MIN_PACK_INDEX: 0,
  STREAK_RESTORE_COST: 50,
  CURRENCY: 'INR',
  PAISE_MULTIPLIER: 100
};

// Custom error class for better error handling
class StoreError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'StoreError';
  }
}

/**
 * Get all gem packs
 * @returns {Array} Array of gem packs
 */
exports.getGemPacks = async () => {
  return gemPacks.map((pack, index) => ({
    id: index,
    ...pack
  }));
};

/**
 * Get all life packs
 * @returns {Array} Array of life packs
 */
exports.getLifePacks = async () => {
  return lifePacks.map((pack, index) => ({
    id: index,
    ...pack
  }));
};

/**
 * Get streak packs (if you have them in config, otherwise return default)
 * @returns {Array} Array of streak packs
 */
exports.getStreakPacks = async () => {
  return [
    {
      id: 0,
      name: 'Streak Restore',
      description: 'Restore your broken streak',
      gems: CONSTANTS.STREAK_RESTORE_COST,
      type: 'restore'
    }
  ];
};

/**
 * Purchase life pack using gems
 * @param {string} userId - User ID
 * @param {number} packIndex - Pack index to purchase
 * @returns {Object} Purchase result with updated user state
 */
exports.buyLives = async (userId, packIndex) => {
  if (!lifePacks[packIndex]) {
    throw new StoreError('Invalid pack selection', 400);
  }

  const pack = lifePacks[packIndex];

  const updatedUser = await User.findOneAndUpdate(
    {
      _id: userId,
      gems: { $gte: pack.gems }
    },
    {
      $inc: {
        gems: -pack.gems,
        lives: pack.lives
      }
    },
    {
      new: true,
      runValidators: true,
      select: 'lives gems'
    }
  );

  if (!updatedUser) {
    const user = await User.findById(userId).select('gems');
    if (!user) {
      throw new StoreError('User not found', 404);
    }
    throw new StoreError(
      `Not enough gems. Required: ${pack.gems}, Available: ${user.gems}`,
      400
    );
  }

  if (updatedUser.lives > CONSTANTS.MAX_LIVES) {
    updatedUser.lives = CONSTANTS.MAX_LIVES;
    await updatedUser.save();
  }

  return {
    lives: updatedUser.lives,
    gems: updatedUser.gems,
    purchasedPack: {
      index: packIndex,
      name: pack.name,
      livesAdded: pack.lives,
      gemsSpent: pack.gems
    },
    message: `Successfully purchased ${pack.lives} lives`
  };
};

/**
 * Purchase streak pack using gems
 * @param {string} userId - User ID
 * @param {number} packIndex - Pack index to purchase
 * @returns {Object} Purchase result
 */
exports.buyStreak = async (userId, packIndex) => {
  const streakPacks = await this.getStreakPacks();
  const pack = streakPacks[packIndex];

  if (!pack) {
    throw new StoreError('Invalid streak pack selection', 400);
  }

  const updatedUser = await User.findOneAndUpdate(
    {
      _id: userId,
      gems: { $gte: pack.gems }
    },
    {
      $inc: {
        gems: -pack.gems
      }
    },
    {
      new: true,
      runValidators: true,
      select: 'gems'
    }
  );

  if (!updatedUser) {
    const user = await User.findById(userId).select('gems');
    if (!user) {
      throw new StoreError('User not found', 404);
    }
    throw new StoreError(
      `Not enough gems. Required: ${pack.gems}, Available: ${user.gems}`,
      400
    );
  }

  return {
    gems: updatedUser.gems,
    purchasedPack: {
      index: packIndex,
      name: pack.name,
      gemsSpent: pack.gems
    },
    message: `Successfully purchased ${pack.name}`
  };
};

/**
 * Create Razorpay order for gem purchase
 * @param {string} userId - User ID
 * @param {number} packIndex - Pack index to purchase
 * @returns {Object} Razorpay order details
 */
exports.createGemPurchaseOrder = async (userId, packIndex) => {
  if (!gemPacks[packIndex]) {
    throw new StoreError('Invalid gem pack selection', 400);
  }

  // Verify user exists
  const user = await User.findById(userId).select('_id email');
  if (!user) {
    throw new StoreError('User not found', 404);
  }

  const pack = gemPacks[packIndex];

  try {
    // Create Razorpay order
    const options = {
      amount: pack.price * CONSTANTS.PAISE_MULTIPLIER,
      currency: CONSTANTS.CURRENCY,
      receipt: `gem_${userId}_${packIndex}_${Date.now()}`,
      notes: {
        userId: userId,
        packIndex: packIndex,
        packName: pack.name,
        gems: pack.gems,
        bonus: pack.bonus || 0,
        type: 'gem_purchase',
        created_at: new Date().toISOString()
      }
    };

    const order = await razorpay.orders.create(options);

    return {
      orderId: order.id,
      amount: pack.price,
      currency: CONSTANTS.CURRENCY,
      packDetails: {
        index: packIndex,
        name: pack.name,
        gems: pack.gems,
        bonus: pack.bonus || 0,
        totalGems: pack.gems + (pack.bonus || 0),
        price: pack.price
      },
      razorpayKeyId: process.env.RAZORPAY_KEY_ID
    };
  } catch (error) {
    console.error('Failed to create Razorpay order:', error);
    throw new StoreError('Failed to initiate payment. Please try again.', 500);
  }
};

/**
 * Verify Razorpay payment and credit gems
 * @param {string} userId - User ID
 * @param {number} packIndex - Pack index purchased
 * @param {Object} paymentData - Razorpay payment verification data
 * @returns {Object} Purchase result
 */
exports.verifyAndCreditGems = async (userId, packIndex, paymentData) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = paymentData;

  if (!gemPacks[packIndex]) {
    throw new StoreError('Invalid gem pack selection', 400);
  }

  // Verify signature
  const generated_signature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(razorpay_order_id + "|" + razorpay_payment_id)
    .digest('hex');

  if (generated_signature !== razorpay_signature) {
    throw new StoreError('Invalid payment signature', 400);
  }

  try {
    // Verify payment status with Razorpay
    const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
    
    if (paymentDetails.status !== 'captured') {
      throw new StoreError('Payment not captured', 400);
    }

    // Verify order details
    const orderDetails = await razorpay.orders.fetch(razorpay_order_id);
    
    if (orderDetails.notes.userId !== userId || 
        parseInt(orderDetails.notes.packIndex) !== packIndex) {
      throw new StoreError('Order details mismatch', 400);
    }

    const pack = gemPacks[packIndex];
    const totalGems = pack.gems + (pack.bonus || 0);

    // Credit gems to user with transaction
    const session = await User.startSession();
    session.startTransaction();

    try {
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
          $inc: { gems: totalGems }
        },
        { 
          new: true, 
          select: 'gems',
          session 
        }
      );

      if (!updatedUser) {
        throw new StoreError('User not found', 404);
      }

      await session.commitTransaction();

      return {
        success: true,
        gems: updatedUser.gems,
        purchasedPack: {
          index: packIndex,
          name: pack.name,
          gemsReceived: totalGems,
          baseGems: pack.gems,
          bonusGems: pack.bonus || 0,
          price: pack.price,
          currency: CONSTANTS.CURRENCY
        },
        payment: {
          orderId: razorpay_order_id,
          paymentId: razorpay_payment_id,
          amount: paymentDetails.amount / CONSTANTS.PAISE_MULTIPLIER,
          status: paymentDetails.status
        },
        message: `Successfully purchased ${totalGems} gems`
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error('Payment verification failed:', error);
    if (error instanceof StoreError) {
      throw error;
    }
    throw new StoreError('Payment verification failed', 500);
  }
};

/**
 * Legacy buyGems function - now creates order
 * @param {string} userId - User ID
 * @param {number} packIndex - Pack index to purchase
 * @returns {Object} Order creation result
 */
exports.buyGems = async (userId, packIndex) => {
  return await this.createGemPurchaseOrder(userId, packIndex);
};

/**
 * Get user's store status
 * @param {string} userId - User ID
 * @returns {Object} User's current gems and lives
 */
exports.getUserShopStatus = async (userId) => {
  const user = await User.findById(userId)
    .select('gems lives points tier')
    .lean();

  if (!user) {
    throw new StoreError('User not found', 404);
  }

  return {
    gems: user.gems || 0,
    lives: user.lives || 0,
    maxLives: CONSTANTS.MAX_LIVES,
    points: user.points || 0,
    tier: user.tier || 'bronze'
  };
};

/**
 * Get purchase history from Razorpay
 * @param {string} userId - User ID
 * @param {Object} options - Pagination options
 * @returns {Object} Purchase history with pagination
 */
exports.getPurchaseHistory = async (userId, options = {}) => {
  const { page = 1, limit = 20 } = options;

  try {
    // Fetch payments from Razorpay (max 100 at a time)
    const payments = await razorpay.payments.all({ 
      count: 100 
    });

    // Filter payments for this user
    const userPayments = payments.items
      .filter(p => p.notes && p.notes.userId === userId)
      .map(p => ({
        id: p.id,
        orderId: p.order_id,
        amount: p.amount / CONSTANTS.PAISE_MULTIPLIER,
        currency: p.currency,
        status: p.status,
        method: p.method,
        packName: p.notes?.packName || 'Unknown',
        gems: p.notes?.gems || 0,
        bonus: p.notes?.bonus || 0,
        createdAt: new Date(p.created_at * 1000),
        email: p.email,
        contact: p.contact
      }))
      .sort((a, b) => b.createdAt - a.createdAt);

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedPayments = userPayments.slice(startIndex, endIndex);

    return {
      purchases: paginatedPayments,
      pagination: {
        page,
        limit,
        total: userPayments.length,
        totalPages: Math.ceil(userPayments.length / limit)
      }
    };
  } catch (error) {
    console.error('Failed to fetch purchase history:', error);
    // Return empty array if Razorpay fails
    return {
      purchases: [],
      pagination: {
        page,
        limit,
        total: 0,
        totalPages: 0
      }
    };
  }
};

/**
 * Get store analytics (admin only)
 * @returns {Object} Store analytics data
 */
exports.getStoreAnalytics = async () => {
  const analytics = await User.aggregate([
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        totalGems: { $sum: '$gems' },
        avgGemsPerUser: { $avg: '$gems' },
        avgLivesPerUser: { $avg: '$lives' }
      }
    }
  ]);

  // Get payment statistics from Razorpay
  try {
    const payments = await razorpay.payments.all({ count: 100 });
    const successfulPayments = payments.items.filter(p => p.status === 'captured');
    
    const totalRevenue = successfulPayments.reduce(
      (sum, p) => sum + (p.amount / CONSTANTS.PAISE_MULTIPLIER), 
      0
    );

    return {
      ...(analytics[0] || {
        totalUsers: 0,
        totalGems: 0,
        avgGemsPerUser: 0,
        avgLivesPerUser: 0
      }),
      payments: {
        totalTransactions: successfulPayments.length,
        totalRevenue: totalRevenue,
        currency: CONSTANTS.CURRENCY,
        avgTransactionValue: successfulPayments.length > 0 
          ? totalRevenue / successfulPayments.length 
          : 0
      }
    };
  } catch (error) {
    console.error('Failed to fetch payment analytics:', error);
    return analytics[0] || {
      totalUsers: 0,
      totalGems: 0,
      avgGemsPerUser: 0,
      avgLivesPerUser: 0
    };
  }
};

/**
 * Refund a gem purchase (admin only)
 * @param {string} paymentId - Razorpay payment ID
 * @param {string} userId - User ID
 * @param {number} gemsToDeduct - Gems to deduct from user
 * @returns {Object} Refund result
 */
exports.refundGemPurchase = async (paymentId, userId, gemsToDeduct) => {
  try {
    // Fetch payment details
    const payment = await razorpay.payments.fetch(paymentId);

    if (payment.status !== 'captured') {
      throw new StoreError('Payment is not captured, cannot refund', 400);
    }

    // Create refund
    const refund = await razorpay.payments.refund(paymentId, {
      amount: payment.amount,
      speed: 'normal',
      notes: {
        reason: 'User requested refund',
        userId: userId
      }
    });

    // Deduct gems from user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $inc: { gems: -gemsToDeduct }
      },
      { new: true, select: 'gems' }
    );

    if (!updatedUser) {
      throw new StoreError('User not found', 404);
    }

    return {
      success: true,
      refund: {
        id: refund.id,
        paymentId: paymentId,
        amount: refund.amount / CONSTANTS.PAISE_MULTIPLIER,
        status: refund.status
      },
      user: {
        gems: updatedUser.gems,
        gemsDeducted: gemsToDeduct
      },
      message: 'Refund processed successfully'
    };
  } catch (error) {
    console.error('Refund failed:', error);
    if (error instanceof StoreError) {
      throw error;
    }
    throw new StoreError('Refund processing failed', 500);
  }
};

module.exports = exports;