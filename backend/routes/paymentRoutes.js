const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');

// Rate limiting for payment routes
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 payment requests per windowMs
  message: 'Too many payment attempts, please try again later'
});

// Stricter rate limit for verification attempts
const verificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // Limit each IP to 50 verification attempts per hour
  message: 'Too many verification attempts, please try again later'
});

// Validation schemas
const schemas = {
  createOrder: Joi.object({
    amount: Joi.number()
      .required()
      .min(1)
      .max(100000) // Set appropriate maximum
      .message('Amount must be between 1 and 100000'),
    currency: Joi.string()
      .valid('INR')
      .default('INR'),
    userId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        'string.pattern.base': 'Invalid user ID format'
      }),
    packIndex: Joi.number()
      .required()
      .min(0)
      .message('Invalid pack selection')
  }),

  verifyPayment: Joi.object({
    razorpay_order_id: Joi.string().required(),
    razorpay_payment_id: Joi.string().required(),
    razorpay_signature: Joi.string().required(),
    userId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required(),
    packIndex: Joi.number()
      .required()
      .min(0)
  })
};

// Validation middleware
const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }
    next();
  };
};

// Error handling middleware
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Create payment order
 * @route POST /api/payments/create-order
 * @security JWT
 */
router.post('/create-order',
  auth,
  paymentLimiter,
  validateRequest(schemas.createOrder),
  asyncHandler(async (req, res) => {
    // Ensure user can only create orders for themselves
    if (req.user.id !== req.body.userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized payment attempt'
      });
    }
    
    await paymentController.createOrder(req, res);
  })
);

/**
 * Verify payment
 * @route POST /api/payments/verify-payment
 * @security JWT
 */
router.post('/verify-payment',
  auth,
  verificationLimiter,
  validateRequest(schemas.verifyPayment),
  asyncHandler(async (req, res) => {
    // Ensure user can only verify their own payments
    if (req.user.id !== req.body.userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized verification attempt'
      });
    }
    
    await paymentController.verifyPayment(req, res);
  })
);

/**
 * Get payment status
 * @route GET /api/payments/status/:orderId
 * @security JWT
 */
router.get('/status/:orderId',
  auth,
  asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'Order ID is required'
      });
    }

    const status = await paymentController.getPaymentStatus(orderId, req.user.id);
    res.json({
      success: true,
      data: status
    });
  })
);

/**
 * Get user's payment history
 * @route GET /api/payments/history
 * @security JWT
 */
router.get('/history',
  auth,
  asyncHandler(async (req, res) => {
    const history = await paymentController.getUserPaymentHistory(req.user.id);
    res.json({
      success: true,
      data: history
    });
  })
);

/**
 * Webhook for payment updates
 * @route POST /api/payments/webhook
 */
router.post('/webhook',
  express.raw({ type: 'application/json' }), // Raw body for signature verification
  asyncHandler(async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    
    if (!signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing signature'
      });
    }

    await paymentController.handleWebhook(req.body, signature);
    res.json({ success: true });
  })
);

// Error handler
router.use((err, req, res, next) => {
  console.error('Payment route error:', err);
  res.status(500).json({
    success: false,
    error: 'Payment processing failed',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = router;
