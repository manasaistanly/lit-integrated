require('dotenv').config();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const User = require('../models/User');
const { gemPacks } = require('../config/storeConfig');

// Initialize Razorpay using environment variables
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ✅ Create an order
exports.createOrder = async (req, res) => {
  const { amount, currency = 'INR', receipt = 'receipt_' + Date.now() } = req.body;

  try {
    const options = { amount: amount * 100, currency, receipt }; // Razorpay expects paise
    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (err) {
    console.error("Error creating order:", err);
    res.status(500).json({ error: 'Order creation failed', details: err });
  }
};

// ✅ Verify payment and credit gems
exports.verifyPayment = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId, packIndex } = req.body;

  try {
    // Step 1: Verify signature
    const generated_signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest('hex');

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ error: "Payment signature mismatch", verified: false });
    }

    // Step 2: Find user
    const user = await User.findById(userId);
    if (!user) return res.status(400).json({ error: 'Invalid user' });

    // Step 3: Get gem pack
    const pack = gemPacks[packIndex];
    if (!pack) return res.status(400).json({ error: 'Invalid gem pack' });

    // Step 4: Add gems
    user.gems += pack.gems;
    await user.save();

    return res.json({
      success: true,
      verified: true,
      type: 'gems',
      gems: user.gems,
      pack: pack
    });
  } catch (err) {
    console.error("Payment verification failed:", err);
    res.status(500).json({ error: 'Payment verification failed', details: err });
  }
};
