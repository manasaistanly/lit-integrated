const mongoose = require('mongoose');

// Constants for validation
const CONSTANTS = {
  MIN_PRICE: 0,
  MAX_PRICE: 1000000, // Set appropriate maximum price
  MIN_NAME_LENGTH: 2,
  MAX_NAME_LENGTH: 100,
  SUPPORTED_IMAGE_TYPES: ['jpg', 'jpeg', 'png', 'webp']
};

// Product sub-schema for reusability and consistency
const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    minlength: [CONSTANTS.MIN_NAME_LENGTH, 'Name too short'],
    maxlength: [CONSTANTS.MAX_NAME_LENGTH, 'Name too long']
  },
  image: {
    type: String,
    required: [true, 'Product image is required'],
    validate: {
      validator: function(v) {
        // Validate image URL format and file type
        if (!v) return false;
        const extension = v.split('.').pop().toLowerCase();
        return CONSTANTS.SUPPORTED_IMAGE_TYPES.includes(extension);
      },
      message: `Image must be one of: ${CONSTANTS.SUPPORTED_IMAGE_TYPES.join(', ')}`
    }
  },
  price: {
    type: Number,
    required: [true, 'Product price is required'],
    min: [CONSTANTS.MIN_PRICE, 'Price cannot be negative'],
    max: [CONSTANTS.MAX_PRICE, 'Price exceeds maximum allowed'],
    validate: {
      validator: function(v) {
        // Ensure price has maximum 2 decimal places
        return /^\d+(\.\d{1,2})?$/.test(v.toString());
      },
      message: 'Price can have maximum 2 decimal places'
    }
  },
  category: {
    type: String,
    trim: true,
    default: 'general'
  },
  metadata: {
    type: Map,
    of: String,
    default: () => new Map()
  }
});

const imagePairSchema = new mongoose.Schema({
  productA: {
    type: productSchema,
    required: [true, 'Product A is required']
  },
  productB: {
    type: productSchema,
    required: [true, 'Product B is required']
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  active: {
    type: Boolean,
    default: true,
    index: true // Index for querying active pairs
  },
  timesShown: {
    type: Number,
    default: 0
  },
  timesCorrect: {
    type: Number,
    default: 0
  },
  lastShownAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
imagePairSchema.index({ 'productA.price': 1, 'productB.price': 1 });
imagePairSchema.index({ 'productA.category': 1, 'productB.category': 1 });
imagePairSchema.index({ difficulty: 1, active: 1 });

// Virtual for price difference
imagePairSchema.virtual('priceDifference').get(function() {
  return Math.abs(this.productA.price - this.productB.price);
});

// Virtual for difficulty rating based on price difference
imagePairSchema.virtual('calculatedDifficulty').get(function() {
  const diff = this.priceDifference;
  const avgPrice = (this.productA.price + this.productB.price) / 2;
  const diffPercent = (diff / avgPrice) * 100;
  
  if (diffPercent > 50) return 'easy';
  if (diffPercent > 20) return 'medium';
  return 'hard';
});

// Virtual for success rate
imagePairSchema.virtual('successRate').get(function() {
  if (this.timesShown === 0) return 0;
  return (this.timesCorrect / this.timesShown * 100).toFixed(2);
});

// Methods
imagePairSchema.methods.incrementShown = function() {
  this.timesShown += 1;
  this.lastShownAt = new Date();
  return this.save();
};

imagePairSchema.methods.recordCorrectAnswer = function() {
  this.timesCorrect += 1;
  return this.save();
};

imagePairSchema.methods.validatePrices = function() {
  return this.productA.price !== this.productB.price;
};

// Statics
imagePairSchema.statics.findActivePairs = function(limit = 10) {
  return this.find({ active: true })
    .sort({ lastShownAt: 1 })
    .limit(limit);
};

imagePairSchema.statics.findByDifficulty = function(difficulty, limit = 10) {
  return this.find({ 
    difficulty, 
    active: true 
  })
    .sort({ lastShownAt: 1 })
    .limit(limit);
};

// Pre-save middleware
imagePairSchema.pre('save', function(next) {
  // Ensure prices are different
  if (this.productA.price === this.productB.price) {
    next(new Error('Products must have different prices'));
  }
  
  // Update difficulty based on price difference
  this.difficulty = this.calculatedDifficulty;
  
  next();
});

// Pre-find middleware
imagePairSchema.pre('find', function() {
  // Default to only active pairs
  if (!this.getQuery().hasOwnProperty('active')) {
    this.where({ active: true });
  }
});

// Create model
const ImagePair = mongoose.model('ImagePair', imagePairSchema);

// Create indexes
ImagePair.createIndexes().catch(err => {
  console.error('Error creating image pair indexes:', err);
});

module.exports = ImagePair;
