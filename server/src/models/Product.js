const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [200, 'Name cannot exceed 200 characters']
    },
    sku: {
      type: String,
      required: [true, 'SKU is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      index: true
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      default: null
    },
    purchaseCost: {
      type: Number,
      required: [true, 'Purchase cost is required'],
      min: [0, 'Purchase cost cannot be negative']
    },
    sellingPrice: {
      type: Number,
      required: [true, 'Selling price is required'],
      min: [0, 'Selling price cannot be negative']
    },
    mrp: {
      type: Number,
      min: [0, 'MRP cannot be negative'],
      default: null
    },
    stockQuantity: {
      type: Number,
      required: [true, 'Stock quantity is required'],
      min: [0, 'Stock quantity cannot be negative'],
      default: 0
    },
    lowStockThreshold: {
      type: Number,
      default: 10,
      min: [0, 'Threshold cannot be negative']
    },
    unit: {
      type: String,
      default: 'pcs',
      trim: true
    },
    imageUrl: {
      type: String,
      trim: true,
      default: ''
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual for gross profit margin percentage
productSchema.virtual('marginPercentage').get(function () {
  if (!this.sellingPrice || this.sellingPrice <= 0) return 0;
  const margin = ((this.sellingPrice - this.purchaseCost) / this.sellingPrice) * 100;
  return Number(margin.toFixed(2));
});

// Virtual for stock status
productSchema.virtual('stockStatus').get(function () {
  if (this.stockQuantity <= 0) return 'OUT_OF_STOCK';
  if (this.stockQuantity <= this.lowStockThreshold) return 'LOW_STOCK';
  return 'IN_STOCK';
});

// Virtual for total valuation
productSchema.virtual('stockValuation').get(function () {
  return Number((this.stockQuantity * this.purchaseCost).toFixed(2));
});

module.exports = mongoose.model('Product', productSchema);
