const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  productName: {
    type: String,
    required: true
  },
  sku: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, 'Quantity must be at least 1']
  },
  unitCostSnapshot: {
    type: Number,
    required: true,
    min: 0
  },
  sellingPriceSnapshot: {
    type: Number,
    required: true,
    min: 0
  },
  lineTotal: {
    type: Number,
    required: true,
    min: 0
  },
  profit: {
    type: Number,
    required: true
  }
});

const saleSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      index: true
    },
    customerName: {
      type: String,
      default: 'Walk-in Customer',
      trim: true
    },
    customerPhone: {
      type: String,
      trim: true,
      default: ''
    },
    items: [saleItemSchema],
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },
    discount: {
      type: Number,
      default: 0,
      min: 0
    },
    taxRate: {
      type: Number,
      default: 0,
      min: 0
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    grandTotal: {
      type: Number,
      required: true,
      min: 0
    },
    totalCost: {
      type: Number,
      required: true,
      min: 0
    },
    grossProfit: {
      type: Number,
      required: true
    },
    paymentMethod: {
      type: String,
      enum: ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER'],
      default: 'CASH',
      index: true
    },
    amountPaid: {
      type: Number,
      required: true,
      min: 0
    },
    changeDue: {
      type: Number,
      default: 0,
      min: 0
    },
    status: {
      type: String,
      enum: ['COMPLETED', 'CANCELLED', 'RETURNED'],
      default: 'COMPLETED',
      index: true
    },
    idempotencyKey: {
      type: String,
      sparse: true,
      index: true
    },
    soldBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    saleDate: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Sale', saleSchema);
