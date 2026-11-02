/**
 * StockWise / MFEF - Stock Ledger Service (PostgreSQL)
 * Atomic inventory adjustment and audit ledger recording
 */

const { withTransaction, query } = require('../repositories/db');
const { formatProduct } = require('../repositories/productRepository');
const { formatMovement } = require('../repositories/stockMovementRepository');

/**
 * Atomically adjust stock and record a movement ledger entry
 *
 * @param {Object} options
 * @param {String} options.productId
 * @param {Number} options.quantityDelta - Positive for incoming, negative for outgoing
 * @param {String} options.movementType - enum from stock_movements
 * @param {String} options.referenceType - PURCHASE, SALE, RETURN, MANUAL_ADJUSTMENT, INITIAL_IMPORT
 * @param {String} options.referenceId - Transaction identifier
 * @param {String} options.notes - Audit comments
 * @param {String} [options.userId] - User performing the change
 * @param {Object} [options.client] - Existing transaction client (optional)
 */
const adjustStockAndLog = async ({
  productId,
  quantityDelta,
  movementType,
  referenceType = 'MANUAL_ADJUSTMENT',
  referenceId = '',
  notes = '',
  userId = null,
  client = null
}) => {
  const delta = Number(quantityDelta);
  if (!delta || delta === 0) {
    throw new Error('Quantity delta cannot be zero');
  }

  const executeAdjustment = async (txClient) => {
    // 1. Lock product row with FOR UPDATE
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId);
    const pWhere = isUUID ? `id = $1` : `mongo_id = $1 OR id::text = $1`;

    const pRes = await txClient.query(
      `SELECT * FROM public.products WHERE (${pWhere}) AND is_deleted = false FOR UPDATE;`,
      [productId]
    );
    const product = pRes.rows[0];

    if (!product) {
      throw new Error('Product not found or has been archived');
    }

    const currentStock = parseInt(product.stock_quantity, 10);

    if (delta < 0) {
      const absQty = Math.abs(delta);
      if (currentStock < absQty) {
        throw new Error(`Insufficient stock for "${product.name}". Available: ${currentStock}, Requested: ${absQty}`);
      }
    }

    const newStock = currentStock + delta;

    // 2. Update stock
    const upRes = await txClient.query(
      `UPDATE public.products SET stock_quantity = $1, updated_at = NOW() WHERE id = $2 RETURNING *;`,
      [newStock, product.id]
    );
    const updatedProduct = upRes.rows[0];

    // 3. Record movement in stock_movements ledger
    const smRes = await txClient.query(
      `INSERT INTO public.stock_movements (
        product_id, movement_type, quantity_changed, balance_after,
        reference_type, reference_id, notes, performed_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *;`,
      [
        product.id,
        movementType,
        delta,
        newStock,
        referenceType,
        (referenceId || '').trim(),
        (notes || '').trim(),
        userId || null
      ]
    );
    const movement = smRes.rows[0];

    return {
      product: formatProduct(updatedProduct),
      movement: formatMovement(movement)
    };
  };

  if (client) {
    return executeAdjustment(client);
  } else {
    return withTransaction(executeAdjustment);
  }
};

module.exports = {
  adjustStockAndLog
};
