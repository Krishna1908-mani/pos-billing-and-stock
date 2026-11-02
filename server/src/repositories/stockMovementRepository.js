/**
 * StockWise / MFEF - Stock Movement Repository (PostgreSQL)
 * Audit ledger operations
 */

const { query } = require('./db');

const formatMovement = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    _id: row.id,
    mongoId: row.mongo_id,
    product: row.product_id ? {
      id: row.product_id,
      _id: row.product_id,
      name: row.product_name,
      sku: row.product_sku,
      unit: row.product_unit,
      purchaseCost: parseFloat(row.product_cost || 0)
    } : null,
    productId: row.product_id,
    movementType: row.movement_type,
    quantityChanged: parseInt(row.quantity_changed, 10),
    balanceAfter: parseInt(row.balance_after, 10),
    referenceType: row.reference_type,
    referenceId: row.reference_id || '',
    notes: row.notes || '',
    performedBy: row.performed_by ? {
      id: row.performed_by,
      _id: row.performed_by,
      name: row.user_name || 'Staff'
    } : null,
    createdAt: row.created_at
  };
};

const createMovement = async ({
  productId,
  movementType,
  quantityChanged,
  balanceAfter,
  referenceType = 'MANUAL_ADJUSTMENT',
  referenceId = '',
  notes = '',
  performedBy = null
}, clientInstance = null) => {
  const runner = clientInstance || { query };
  const res = await runner.query(
    `INSERT INTO public.stock_movements (
      product_id, movement_type, quantity_changed, balance_after,
      reference_type, reference_id, notes, performed_by, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    RETURNING *;`,
    [
      productId,
      movementType,
      Number(quantityChanged),
      Number(balanceAfter),
      referenceType,
      referenceId || '',
      notes || '',
      performedBy || null
    ]
  );
  return formatMovement(res.rows[0]);
};

const getMovements = async ({
  product = '',
  movementType = '',
  referenceType = '',
  startDate = '',
  endDate = '',
  search = '',
  page = 1,
  limit = 30
} = {}) => {
  const conditions = [];
  const params = [];

  if (product && product.trim()) {
    params.push(product.trim());
    conditions.push(`(sm.product_id::text = $${params.length} OR p.mongo_id = $${params.length})`);
  }

  if (movementType && movementType !== 'ALL') {
    params.push(movementType);
    conditions.push(`sm.movement_type = $${params.length}`);
  }

  if (referenceType && referenceType !== 'ALL') {
    params.push(referenceType);
    conditions.push(`sm.reference_type = $${params.length}`);
  }

  if (startDate) {
    params.push(new Date(startDate));
    conditions.push(`sm.created_at >= $${params.length}`);
  }

  if (endDate) {
    const e = new Date(endDate);
    e.setHours(23, 59, 59, 999);
    params.push(e);
    conditions.push(`sm.created_at <= $${params.length}`);
  }

  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(sm.reference_id ILIKE $${params.length} OR sm.notes ILIKE $${params.length} OR p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countSql = `
    SELECT COUNT(*) 
    FROM public.stock_movements sm
    LEFT JOIN public.products p ON p.id = sm.product_id
    ${whereClause};
  `;
  const countRes = await query(countSql, params);
  const total = parseInt(countRes.rows[0].count, 10);

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 30;
  const offset = (pageNum - 1) * limitNum;

  const dataParams = [...params, limitNum, offset];
  const dataSql = `
    SELECT 
      sm.*,
      p.name as product_name,
      p.sku as product_sku,
      p.unit as product_unit,
      p.purchase_cost as product_cost,
      u.name as user_name
    FROM public.stock_movements sm
    LEFT JOIN public.products p ON p.id = sm.product_id
    LEFT JOIN public.users u ON u.id = sm.performed_by
    ${whereClause}
    ORDER BY sm.created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2};
  `;
  const dataRes = await query(dataSql, dataParams);

  return {
    movements: dataRes.rows.map(formatMovement),
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum) || 1
  };
};

module.exports = {
  createMovement,
  getMovements,
  formatMovement
};
