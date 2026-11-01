const mongoose = require('mongoose');

const returnItemSchema = new mongoose.Schema({
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
    min: 1
  },
  refundAmount: {
    type: Number,
    required: true,
    min: 0
  },
  unitCostSnapshot: {
    type: Number,
    required: true,
    min: 0
  }
});

const saleReturnSchema = new mongoose.Schema(
  {
    returnNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      index: true
    },
    sale: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sale',
      required: true,
      index: true
    },
    invoiceNumber: {
      type: String,
      required: true,
      index: true
    },
    items: [returnItemSchema],
    refundTotal: {
      type: Number,
      required: true,
      min: 0
    },
    refundMethod: {
      type: String,
      enum: ['CASH', 'ORIGINAL_PAYMENT', 'STORE_CREDIT'],
      default: 'CASH'
    },
    reason: {
      type: String,
      required: [true, 'Return reason is required'],
      trim: true
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    returnDate: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('SaleReturn', saleReturnSchema);
