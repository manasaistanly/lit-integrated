const User = require('../models/User');

// Add product to saved list
exports.addProduct = async (req, res) => {
  const { userId, productId } = req.body;
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.savedProducts.addToSet(productId);
  await user.save();
  res.json({ savedProducts: user.savedProducts });
};

// Remove product from saved list
exports.removeProduct = async (req, res) => {
  const { userId, productId } = req.body;
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.savedProducts.pull(productId);
  await user.save();
  res.json({ savedProducts: user.savedProducts });
};

// List all saved products
exports.listProducts = async (req, res) => {
  const { userId } = req.query;
  const user = await User.findById(userId).populate('savedProducts');
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ savedProducts: user.savedProducts });
};
