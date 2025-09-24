
const mongoose = require("mongoose");
const { Schema } = mongoose;

const SavedProductSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
  },
  { timestamps: true }
);

// Prevent duplicate saves (userId + productId unique)
SavedProductSchema.index({ userId: 1, productId: 1 }, { unique: true });

module.exports = mongoose.model("SavedProduct", SavedProductSchema);
