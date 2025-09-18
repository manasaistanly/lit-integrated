const mongoose = require('mongoose');

const imagePairSchema = new mongoose.Schema({
  productA: {
    name: String,
    image: String,
    price: Number
  },
  productB: {
    name: String,
    image: String,
    price: Number
  }
});

module.exports = mongoose.model('ImagePair', imagePairSchema);
