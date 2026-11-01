const mongoose = require('mongoose');

const stockMovementSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true
    },
    movementType: {
      type: String,
      enum: [
        'OPENING_STOCK',
        'PURCHASE_INWARD',
        'SALE_OUTWARD',
        'SALE_RETURN',
        'ADJUSTMENT_ADD',
        'ADJUSTMENT_SUB'
      ],
      required: true,
      index: true
    },
    quantityChanged: {
      type: Number,
      required: true
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: 0
    },
    referenceType: {
      type: String,
      enum: ['PURCHASE', 'SALE', 'RETURN', 'MANUAL_ADJUSTMENT', 'INITIAL_IMPORT'],
      default: 'MANUAL_ADJUSTMENT',
      index: true
    },
    referenceId: {
      type: String,
      trim: true,
      default: '',
      index: true
    },
    notes: {
      type: String,
      trim: true,
      default: ''
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('StockMovement', stockMovementSchema);
