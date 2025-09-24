
const SavedProduct = require("../models/SavedProduct");
const Product = require("../models/Product");
const { calculateTier } = require("../utils/tierUtils");

// Save product to wishlist
exports.saveProduct = async (req, res) => {
  try {
    const { userId, productId } = req.body;
    if (!userId || !productId) {
      return res.status(400).json({ error: "userId and productId required" });
    }

    // Validate product exists
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: "Product not found" });

    // Create saved product
    const saved = await SavedProduct.create({ userId, productId });

    const count = await SavedProduct.countDocuments({ userId });
    const tier = calculateTier(count);

    res.status(201).json({ message: "Product saved", saved, tier });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "Already saved" });
    }
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

// Remove saved product
exports.removeProduct = async (req, res) => {
  try {
    const { id } = req.params; // SavedProduct doc ID
    const deleted = await SavedProduct.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: "Not found" });

    const count = await SavedProduct.countDocuments({ userId: deleted.userId });
    const tier = calculateTier(count);

    res.json({ message: "Removed successfully", tier });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

// List saved products for a user (populated with catalog info)
exports.listSavedProducts = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const saved = await SavedProduct.find({ userId })
      .populate("productId") // Get full product details
      .sort({ createdAt: -1 });

    const count = saved.length;
    const tier = calculateTier(count);

    res.json({ products: saved, tier });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};
