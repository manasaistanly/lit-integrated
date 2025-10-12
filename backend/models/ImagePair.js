const mongoose = require('mongoose');

// Constants for validation
const CONSTANTS = {
  MIN_PRICE: 0,
  MAX_PRICE: 1000000,
  MIN_NAME_LENGTH: 2,
  MAX_NAME_LENGTH: 100,
  SUPPORTED_IMAGE_TYPES: ['jpg', 'jpeg', 'png', 'webp', 'gif']
};

// Product sub-schema
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
        if (!v) return false;
        
        // Handle both URLs and simple filenames
        try {
          // Try parsing as URL
          const url = new URL(v);
          const pathname = url.pathname;
          const extension = pathname.split('.').pop().toLowerCase();
          return CONSTANTS.SUPPORTED_IMAGE_TYPES.includes(extension);
        } catch {
          // If not a valid URL, check if it's a filename with extension
          const extension = v.split('.').pop().toLowerCase();
          return CONSTANTS.SUPPORTED_IMAGE_TYPES.includes(extension);
        }
      },
      message: `Image must have a valid extension: ${CONSTANTS.SUPPORTED_IMAGE_TYPES.join(', ')}`
    }
  },
  price: {
    type: Number,
    required: [true, 'Product price is required'],
    min: [CONSTANTS.MIN_PRICE, 'Price cannot be negative'],
    max: [CONSTANTS.MAX_PRICE, 'Price exceeds maximum allowed'],
    set: function(v) {
      // Round to 2 decimal places
      return Math.round(v * 100) / 100;
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
    default: new Map
  }
}, { _id: false }); // Don't create _id for subdocuments

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
    index: true
  },
  timesShown: {
    type: Number,
    default: 0,
    min: 0
  },
  timesCorrect: {
    type: Number,
    default: 0,
    min: 0
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

// Indexes for better query performance
imagePairSchema.index({ 'productA.price': 1, 'productB.price': 1 });
imagePairSchema.index({ 'productA.category': 1, 'productB.category': 1 });
imagePairSchema.index({ difficulty: 1, active: 1 });
imagePairSchema.index({ lastShownAt: 1, active: 1 }); // For fair rotation

// Virtual for price difference
imagePairSchema.virtual('priceDifference').get(function() {
  return Math.abs(this.productA.price - this.productB.price);
});

// Virtual for price difference percentage
imagePairSchema.virtual('priceDifferencePercent').get(function() {
  const avgPrice = (this.productA.price + this.productB.price) / 2;
  if (avgPrice === 0) return 0;
  return (this.priceDifference / avgPrice) * 100;
});

// Virtual for calculated difficulty based on price difference
imagePairSchema.virtual('calculatedDifficulty').get(function() {
  const diffPercent = this.priceDifferencePercent;
  
  if (diffPercent > 50) return 'easy';
  if (diffPercent > 20) return 'medium';
  return 'hard';
});

// Virtual for success rate
imagePairSchema.virtual('successRate').get(function() {
  if (this.timesShown === 0) return 0;
  return parseFloat((this.timesCorrect / this.timesShown * 100).toFixed(2));
});

// Virtual for more expensive product
imagePairSchema.virtual('moreExpensive').get(function() {
  return this.productA.price > this.productB.price ? 'A' : 'B';
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

// Statics for querying
imagePairSchema.statics.findActivePairs = function(limit = 10) {
  return this.find({ active: true })
    .sort({ lastShownAt: 1, timesShown: 1 }) // Fair rotation
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

imagePairSchema.statics.getRandomActivePairs = function(count = 10) {
  return this.aggregate([
    { $match: { active: true } },
    { $sample: { size: count } }
  ]);
};

// Pre-save validation
imagePairSchema.pre('save', function(next) {
  // Ensure prices are different
  if (this.productA.price === this.productB.price) {
    return next(new Error('Products must have different prices'));
  }
  
  // FIXED: Only auto-update difficulty if not explicitly set by user
  // This allows manual override while still providing automatic calculation
  if (this.isNew || (!this.isModified('difficulty') && this.isModified('productA.price', 'productB.price'))) {
    this.difficulty = this.calculatedDifficulty;
  }
  
  // Validate timesCorrect never exceeds timesShown
  if (this.timesCorrect > this.timesShown) {
    return next(new Error('Times correct cannot exceed times shown'));
  }
  
  next();
});

// REMOVED: Pre-find middleware (doesn't work with aggregate)
// Instead, always explicitly filter in queries or use static methods

// Create model
const ImagePair = mongoose.model('ImagePair', imagePairSchema);

module.exports = ImagePair;