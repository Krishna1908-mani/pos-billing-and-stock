/**
 * StockWise / MFEF - Purchase Repository (PostgreSQL)
 * Transactional purchases and inward stock operations
 */

const { query, withTransaction } = require('./db');

const formatPurchase = (row, items = [], payments = []) => {
  if (!row) return null;
  return {
    id: row.id,
    _id: row.id,
    mongoId: row.mongo_id,
    purchaseNumber: row.purchase_number,
    supplier: row.supplier_id ? {
      id: row.supplier_id,
      _id: row.supplier_id,
      name: row.supplier_name || '',
      company: row.supplier_company || '',
      phone: row.supplier_phone || ''
    } : null,
    supplierId: row.supplier_id,
    supplierInvoiceNumber: row.supplier_invoice_number || '',
    purchaseDate: row.purchase_date,
    dueDate: row.due_date,
    items: items.map(it => ({
      id: it.id,
      _id: it.id,
      product: it.product_id ? {
        id: it.product_id,
        _id: it.product_id,
        name: it.product_name,
        sku: it.sku
      } : it.product_id,
      productId: it.product_id,
      productName: it.product_name,
      sku: it.sku,
      quantity: parseInt(it.quantity, 10),
      unitCost: parseFloat(it.unit_cost),
      lineTotal: parseFloat(it.line_total)
    })),
    subtotal: parseFloat(row.subtotal),
    discount: parseFloat(row.discount || 0),
    tax: parseFloat(row.tax || 0),
    totalAmount: parseFloat(row.total_amount),
    amountPaid: parseFloat(row.amount_paid || 0),
    balanceDue: parseFloat(row.balance_due || 0),
    paymentStatus: row.payment_status,
    notes: row.notes || '',
    idempotencyKey: row.idempotency_key,
    createdBy: row.created_by ? {
      id: row.created_by,
      _id: row.created_by,
      name: row.creator_name || 'Staff'
    } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    payments
  };
};

const generatePurchaseNumber = async (clientInstance = null) => {
  const runner = clientInstance || { query };
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const countRes = await runner.query(`SELECT COUNT(*) FROM public.purchases;`);
  const seq = String(parseInt(countRes.rows[0].count, 10) + 1).padStart(4, '0');
  const candidate = `PUR-${dateStr}-${seq}`;

  const existsRes = await runner.query(`SELECT 1 FROM public.purchases WHERE purchase_number = $1;`, [candidate]);
  if (existsRes.rows.length > 0) {
    return `PUR-${dateStr}-${seq}-${Date.now().toString().slice(-4)}`;
  }
  return candidate;
};

const getPurchases = async ({
  supplier = '',
  paymentStatus = '',
  startDate = '',
  endDate = '',
  search = '',
  page = 1,
  limit = 20
} = {}) => {
  const conditions = [];
  const params = [];

  if (supplier && supplier !== 'ALL') {
    params.push(supplier);
    conditions.push(`(pu.supplier_id::text = $${params.length} OR s.mongo_id = $${params.length})`);
  }

  if (paymentStatus && paymentStatus !== 'ALL') {
    params.push(paymentStatus);
    conditions.push(`pu.payment_status = $${params.length}`);
  }

  if (startDate) {
    params.push(new Date(startDate));
    conditions.push(`pu.purchase_date >= $${params.length}`);
  }

  if (endDate) {
    const e = new Date(endDate);
    e.setHours(23, 59, 59, 999);
    params.push(e);
    conditions.push(`pu.purchase_date <= $${params.length}`);
  }

  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(pu.purchase_number ILIKE $${params.length} OR pu.supplier_invoice_number ILIKE $${params.length} OR s.company ILIKE $${params.length} OR s.name ILIKE $${params.length})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countSql = `
    SELECT COUNT(*) 
    FROM public.purchases pu
    LEFT JOIN public.suppliers s ON s.id = pu.supplier_id
    ${whereClause};
  `;
  const countRes = await query(countSql, params);
  const total = parseInt(countRes.rows[0].count, 10);

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 20;
  const offset = (pageNum - 1) * limitNum;

  const dataParams = [...params, limitNum, offset];
  const dataSql = `
    SELECT 
      pu.*,
      s.name as supplier_name,
      s.company as supplier_company,
      s.phone as supplier_phone,
      u.name as creator_name
    FROM public.purchases pu
    LEFT JOIN public.suppliers s ON s.id = pu.supplier_id
    LEFT JOIN public.users u ON u.id = pu.created_by
    ${whereClause}
    ORDER BY pu.purchase_date DESC, pu.created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2};
  `;
  const dataRes = await query(dataSql, dataParams);

  // Unnest line items for each purchase
  const purchasesList = [];
  for (const row of dataRes.rows) {
    const itemsRes = await query(`SELECT * FROM public.purchase_items WHERE purchase_id = $1;`, [row.id]);
    purchasesList.push(formatPurchase(row, itemsRes.rows));
  }

  return {
    purchases: purchasesList,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum) || 1
  };
};

const getPurchaseById = async (idOrMongoId) => {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrMongoId);
  const whereClause = isUUID ? `pu.id = $1` : `pu.mongo_id = $1 OR pu.purchase_number = $1 OR pu.id::text = $1`;

  const sql = `
    SELECT 
      pu.*,
      s.name as supplier_name,
      s.company as supplier_company,
      s.phone as supplier_phone,
      u.name as creator_name
    FROM public.purchases pu
    LEFT JOIN public.suppliers s ON s.id = pu.supplier_id
    LEFT JOIN public.users u ON u.id = pu.created_by
    WHERE ${whereClause} LIMIT 1;
  `;
  const res = await query(sql, [idOrMongoId]);
  if (!res.rows[0]) return null;

  const [itemsRes, paymentsRes] = await Promise.all([
    query(`SELECT * FROM public.purchase_items WHERE purchase_id = $1;`, [res.rows[0].id]),
    query(`SELECT * FROM public.supplier_payments WHERE purchase_id = $1 ORDER BY payment_date DESC;`, [res.rows[0].id])
  ]);

  return formatPurchase(res.rows[0], itemsRes.rows, paymentsRes.rows);
};

const findByIdempotencyKey = async (key) => {
  if (!key) return null;
  const res = await query(`SELECT id FROM public.purchases WHERE idempotency_key = $1 LIMIT 1;`, [key]);
  if (!res.rows[0]) return null;
  return getPurchaseById(res.rows[0].id);
};

/**
 * Execute full purchase creation inside an ACID transaction
 */
const createPurchaseTransaction = async ({
  supplierId,
  supplierInvoiceNumber = '',
  purchaseDate = new Date(),
  dueDate = null,
  items = [],
  discount = 0,
  tax = 0,
  amountPaid = 0,
  paymentMethod = 'BANK_TRANSFER',
  notes = '',
  idempotencyKey = null,
  userId = null
}) => {
  return withTransaction(async (client) => {
    // 1. Calculate authoritative totals
    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      // Find and lock product
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.product);
      const pWhere = isUUID ? `id = $1` : `mongo_id = $1 OR id::text = $1`;
      const pRes = await client.query(`SELECT * FROM public.products WHERE ${pWhere} AND is_deleted = false FOR UPDATE;`, [item.product]);
      const product = pRes.rows[0];

      if (!product) {
        throw new Error(`Product "${item.product}" not found or archived`);
      }

      const qty = Number(item.quantity);
      const unitCost = Number(item.unitCost);
      if (qty <= 0 || unitCost < 0) {
        throw new Error(`Invalid quantity or cost for product "${product.name}"`);
      }

      const lineTotal = Number((qty * unitCost).toFixed(2));
      subtotal += lineTotal;

      validatedItems.push({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantity: qty,
        unitCost,
        lineTotal,
        currentStock: product.stock_quantity
      });
    }

    subtotal = Number(subtotal.toFixed(2));
    const discNum = Math.max(Number(discount) || 0, 0);
    const taxNum = Math.max(Number(tax) || 0, 0);
    const totalAmount = Number((subtotal - discNum + taxNum).toFixed(2));
    const paidNum = Math.min(Math.max(Number(amountPaid) || 0, 0), totalAmount);
    const balanceDue = Number((totalAmount - paidNum).toFixed(2));

    let paymentStatus = 'UNPAID';
    if (paidNum >= totalAmount) {
      paymentStatus = 'PAID';
    } else if (paidNum > 0) {
      paymentStatus = 'PARTIAL';
    }

    const purchaseNumber = await generatePurchaseNumber(client);

    // 2. Insert into purchases table
    const puRes = await client.query(`
      INSERT INTO public.purchases (
        purchase_number, supplier_id, supplier_invoice_number,
        purchase_date, due_date, subtotal, discount, tax,
        total_amount, amount_paid, balance_due, payment_status,
        notes, idempotency_key, created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
      RETURNING *;
    `, [
      purchaseNumber, supplierId, (supplierInvoiceNumber || '').trim(),
      new Date(purchaseDate), dueDate ? new Date(dueDate) : null,
      subtotal, discNum, taxNum, totalAmount, paidNum, balanceDue,
      paymentStatus, (notes || '').trim(), idempotencyKey || null, userId
    ]);
    const purchase = puRes.rows[0];

    // 3. Insert line items and update inventory & ledger
    for (const item of validatedItems) {
      await client.query(`
        INSERT INTO public.purchase_items (
          purchase_id, product_id, product_name, sku, quantity, unit_cost, line_total, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW());
      `, [
        purchase.id, item.productId, item.productName, item.sku,
        item.quantity, item.unitCost, item.lineTotal
      ]);

      // Inward stock
      const newStock = item.currentStock + item.quantity;
      await client.query(`
        UPDATE public.products 
        SET stock_quantity = $1, purchase_cost = $2, updated_at = NOW() 
        WHERE id = $3;
      `, [newStock, item.unitCost, item.productId]);

      // Record inward movement in stock_movements ledger
      await client.query(`
        INSERT INTO public.stock_movements (
          product_id, movement_type, quantity_changed, balance_after,
          reference_type, reference_id, notes, performed_by, created_at
        ) VALUES ($1, 'PURCHASE_INWARD', $2, $3, 'PURCHASE', $4, $5, $6, NOW());
      `, [
        item.productId, item.quantity, newStock, purchaseNumber,
        `Inward from Purchase Order #${purchaseNumber}`, userId
      ]);
    }

    // 4. Record Supplier Payment if upfront payment was made
    if (paidNum > 0) {
      const payCountRes = await client.query(`SELECT COUNT(*) FROM public.supplier_payments;`);
      const paySeq = String(parseInt(payCountRes.rows[0].count, 10) + 1).padStart(4, '0');
      const paymentNumber = `PAY-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${paySeq}`;

      await client.query(`
        INSERT INTO public.supplier_payments (
          payment_number, supplier_id, purchase_id, amount,
          payment_date, payment_method, reference_number,
          notes, recorded_by, created_at
        ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, NOW());
      `, [
        paymentNumber, supplierId, purchase.id, paidNum,
        paymentMethod || 'BANK_TRANSFER', supplierInvoiceNumber || '',
        `Payment recorded at purchase time (#${purchaseNumber})`, userId
      ]);
    }

    return getPurchaseById(purchase.id);
  });
};

module.exports = {
  formatPurchase,
  generatePurchaseNumber,
  getPurchases,
  getPurchaseById,
  findByIdempotencyKey,
  createPurchaseTransaction
};
