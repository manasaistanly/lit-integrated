require('dotenv').config();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const User = require('../models/User');
const { gemPacks } = require('../config/storeConfig');
const Joi = require('joi');

// Constants
const CONSTANTS = {
  CURRENCY: 'INR',
  MIN_AMOUNT: 1,
  MAX_AMOUNT: 100000, // Set appropriate maximum
  PAISE_MULTIPLIER: 100
};

// Validation schemas
const createOrderSchema = Joi.object({
  amount: Joi.number()
    .required()
    .min(CONSTANTS.MIN_AMOUNT)
    .max(CONSTANTS.MAX_AMOUNT)
    .message('Amount must be between {#min} and {#max}'),
  currency: Joi.string()
    .valid(CONSTANTS.CURRENCY)
    .default(CONSTANTS.CURRENCY),
  receipt: Joi.string()
    .optional()
});

const verifyPaymentSchema = Joi.object({
  razorpay_order_id: Joi.string().required(),
  razorpay_payment_id: Joi.string().required(),
  razorpay_signature: Joi.string().required(),
  userId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  packIndex: Joi.number().min(0).max(gemPacks.length - 1).required()
});

// Initialize Razorpay with error handling
let razorpay;
try {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
} catch (error) {
  console.error('Razorpay initialization failed:', error);
  // You might want to implement a fallback or notification system here
}

// Helper function for consistent response format
function formatResponse(success, data = null, error = null) {
  return {
    success,
    ...(data && { data }),
    ...(error && { error })
  };
}

// Payment record tracking (consider moving to database in production)
const paymentRecords = new Map();

/**
 * Create a Razorpay order
 * @route POST /api/payments/create-order
 */
exports.createOrder = async (req, res) => {
  try {
    // Validate request body
    const { error, value } = createOrderSchema.validate(req.body);
    if (error) {
      return res.status(400).json(
        formatResponse(false, null, error.details[0].message)
      );
    }

    const { amount, currency, receipt = `receipt_${Date.now()}` } = value;

    // Create order with Razorpay
    const options = {
      amount: amount * CONSTANTS.PAISE_MULTIPLIER,
      currency,
      receipt,
      notes: {
        created_at: new Date().toISOString(),
        environment: process.env.NODE_ENV
      }
    };

    const order = await razorpay.orders.create(options);

    // Store order details for verification
    paymentRecords.set(order.id, {
      amount: amount,
      created_at: new Date(),
      status: 'created'
    });

    res.json(formatResponse(true, order));
  } catch (err) {
    console.error("Order creation failed:", err);
    res.status(500).json(
      formatResponse(false, null, 'Order creation failed')
    );
  }
};

/**
 * Verify payment and credit gems
 * @route POST /api/payments/verify
 */
exports.verifyPayment = async (req, res) => {
  try {
    // Validate request body
    const { error, value } = verifyPaymentSchema.validate(req.body);
    if (error) {
      return res.status(400).json(
        formatResponse(false, null, error.details[0].message)
      );
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      userId,
      packIndex
    } = value;

    // Check if payment was already processed
    if (paymentRecords.get(razorpay_order_id)?.status === 'completed') {
      return res.status(400).json(
        formatResponse(false, null, 'Payment already processed')
      );
    }

    // Verify signature
    const generated_signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest('hex');

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json(
        formatResponse(false, null, 'Invalid payment signature')
      );
    }

    // Verify order details with Razorpay
    const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
    if (paymentDetails.status !== 'captured') {
      return res.status(400).json(
        formatResponse(false, null, 'Payment not captured')
      );
    }

    // Process the payment in a transaction
    const session = await User.startSession();
    session.startTransaction();

    try {
      // Find user and update gems
      const user = await User.findById(userId).session(session);
      if (!user) {
        throw new Error('User not found');
      }

      const pack = gemPacks[packIndex];
      if (!pack) {
        throw new Error('Invalid gem pack');
      }

      // Update user gems
      user.gems += pack.gems;
      await user.save({ session });

      // Record payment completion
      paymentRecords.set(razorpay_order_id, {
        ...paymentRecords.get(razorpay_order_id),
        status: 'completed',
        completed_at: new Date()
      });

      await session.commitTransaction();

      return res.json(formatResponse(true, {
        verified: true,
        type: 'gems',
        gems: user.gems,
        pack: pack
      }));
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (err) {
    console.error("Payment verification failed:", err);
    res.status(500).json(
      formatResponse(false, null, 'Payment verification failed')
    );
  }
};

/**
 * Get payment status
 * @route GET /api/payments/status/:orderId
 */
exports.getPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const paymentRecord = paymentRecords.get(orderId);

    if (!paymentRecord) {
      return res.status(404).json(
        formatResponse(false, null, 'Order not found')
      );
    }

    res.json(formatResponse(true, paymentRecord));
  } catch (err) {
    console.error("Get payment status failed:", err);
    res.status(500).json(
      formatResponse(false, null, 'Failed to get payment status')
    );
  }
};

exports.getUserPaymentHistory = async (userId) => {
  // Implement history retrieval
};

exports.handleWebhook = async (payload, signature) => {
  // Implement webhook handling
};
