const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');

/**
 * Atomically adjust stock and record a movement ledger entry
 *
 * @param {Object} options
 * @param {String|ObjectId} options.productId
 * @param {Number} options.quantityDelta - Positive for incoming, negative for outgoing
 * @param {String} options.movementType - enum from StockMovement
 * @param {String} options.referenceType - PURCHASE, SALE, RETURN, MANUAL_ADJUSTMENT, INITIAL_IMPORT
 * @param {String} options.referenceId - Transaction identifier (e.g. invoice/order no)
 * @param {String} options.notes - Audit comments
 * @param {ObjectId} [options.userId] - User performing the change
 */
const adjustStockAndLog = async ({
  productId,
  quantityDelta,
  movementType,
  referenceType = 'MANUAL_ADJUSTMENT',
  referenceId = '',
  notes = '',
  userId = null
}) => {
  if (quantityDelta === 0) {
    throw new Error('Quantity delta cannot be zero');
  }

  let updatedProduct;

  if (quantityDelta < 0) {
    // Decrement: Ensure sufficient stock exists using atomic conditional update
    const absQty = Math.abs(quantityDelta);
    updatedProduct = await Product.findOneAndUpdate(
      {
        _id: productId,
        stockQuantity: { $gte: absQty },
        isDeleted: false
      },
      {
        $inc: { stockQuantity: -absQty }
      },
      { new: true }
    );

    if (!updatedProduct) {
      // Find current stock to produce a helpful error message
      const current = await Product.findById(productId);
      if (!current) {
        throw new Error('Product not found or has been archived');
      }
      throw new Error(
        `Insufficient stock for "${current.name}". Available: ${current.stockQuantity}, Requested: ${absQty}`
      );
    }
  } else {
    // Increment: Add stock atomically
    updatedProduct = await Product.findOneAndUpdate(
      { _id: productId, isDeleted: false },
      {
        $inc: { stockQuantity: quantityDelta }
      },
      { new: true }
    );

    if (!updatedProduct) {
      throw new Error('Product not found or has been archived');
    }
  }

  // Create movement ledger entry
  const movement = await StockMovement.create({
    product: productId,
    movementType,
    quantityChanged: quantityDelta,
    balanceAfter: updatedProduct.stockQuantity,
    referenceType,
    referenceId,
    notes,
    performedBy: userId
  });

  return { product: updatedProduct, movement };
};

module.exports = {
  adjustStockAndLog
};
