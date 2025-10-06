require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
// Initial route imports removed to avoid duplication
// These are now organized in the sections below

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ CORS setup
const allowedOrigins = [
  'http://localhost:5173',
  'https://www.luxuryintaste.com'
];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed from this origin: ' + origin));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));

// ✅ Middleware
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, '/uploads')));
app.use(helmet());
// Global rate limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// API-specific rate limiters
const gameLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200, // More lenient for game actions
  message: 'Too many game requests, please try again later'
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50, // Stricter for auth-related routes
  message: 'Too many authentication attempts, please try again later'
});

// Apply rate limiters
app.use('/api/game-engine', gameLimiter);
app.use('/api/users', authLimiter);
app.use(globalLimiter); // For all other routes

// ✅ MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ✅ Routes - Core Authentication & User Management
const userRoutes = require('./routes/userRoutes');
//const testAuthRoutes = require('./routes/testAuth');
const userStatsRoutes = require('./routes/userStats');

// ✅ Routes - Game System
const gameEngineRoutes = require('./routes/gameEngine');
const leaderboardRoutes = require('./routes/leaderboard');
const streakRoutes = require('./routes/streakRoutes');

// ✅ Routes - Store & Commerce
const storeRoutes = require('./routes/store');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const savedProductsRoutes = require('./routes/savedProductRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const couponRoutes = require('./routes/couponRoutes');

// ✅ Routes - Content & Articles
const articleRoutes = require('./routes/articleRoutes');
const mailArticleRoutes = require('./routes/mailArticleRoutes');
const fastFashionRoutes = require('./routes/fastFashionRoutes');
const luxuryFashionRoutes = require('./routes/luxuryFashionRoutes');
const sustainableFashionRoutes = require('./routes/sustainableFashionRoutes');
const sneakerWorldRoutes = require('./routes/sneakerWorldRoutes');

// ✅ Routes - Support & Utilities
const uploadRoute = require('./routes/upload');
const contactRoutes = require('./routes/contactRoutes');
const SubcribeRoutes = require('./routes/subscriberRoutes');
const supportRoutes = require('./routes/support');
const notificationRoutes = require('./routes/notification');






// ✅ Mount routes

// Core Authentication & User Management
app.use('/api/users', userRoutes);
//app.use('/api/test-auth', testAuthRoutes); // Development only
app.use('/api/user-stats', userStatsRoutes);

// Game System
app.use('/api/game-engine', gameEngineRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/streak', streakRoutes);

// Store & Commerce
app.use('/api/store', storeRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/saved-products', savedProductsRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/coupons', couponRoutes);

// Content & Articles
app.use('/api/articles', articleRoutes);
app.use('/api/mail-articles', mailArticleRoutes);
app.use('/api/fast-fashion', fastFashionRoutes);
app.use('/api/luxury-fashion', luxuryFashionRoutes);
app.use('/api/sustainable-fashion', sustainableFashionRoutes);
app.use('/api/sneaker-world', sneakerWorldRoutes);

// Support & Utilities
app.use('/api/contact', contactRoutes);
app.use(uploadRoute); // for image uploads
app.use('/api/subscribers', SubcribeRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/notifications', notificationRoutes);


// ✅ Root endpoint
app.get('/', (req, res) => {
  res.send('🚀 Unified API for Ecommerce + Newsletter is running...');
});

// ✅ Error handling middleware
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
app.use(notFound);
app.use(errorHandler);

// ✅ Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});




