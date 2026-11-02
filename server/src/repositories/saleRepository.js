/**
 * StockWise / MFEF - Sale Repository (PostgreSQL)
 * Transactional POS billing, SELECT FOR UPDATE row locking, and atomic stock reduction
 */

const { query, withTransaction } = require('./db');

const formatSale = (row, items = []) => {
  if (!row) return null;
  return {
    id: row.id,
    _id: row.id,
    mongoId: row.mongo_id,
    invoiceNumber: row.invoice_number,
    customerName: row.customer_name,
    customerPhone: row.customer_phone || '',
    items: items.map(it => ({
      id: it.id,
      _id: it.id,
      product: it.product_id ? {
        id: it.product_id,
        _id: it.product_id,
        name: it.product_name,
        sku: it.sku,
        unit: it.product_unit || 'pcs',
        imageUrl: it.product_image || ''
      } : it.product_id,
      productId: it.product_id,
      productName: it.product_name,
      sku: it.sku,
      quantity: parseInt(it.quantity, 10),
      unitCostSnapshot: parseFloat(it.unit_cost_snapshot),
      sellingPriceSnapshot: parseFloat(it.selling_price_snapshot),
      lineTotal: parseFloat(it.line_total),
      profit: parseFloat(it.profit)
    })),
    subtotal: parseFloat(row.subtotal),
    discount: parseFloat(row.discount || 0),
    taxRate: parseFloat(row.tax_rate || 0),
    taxAmount: parseFloat(row.tax_amount || 0),
    grandTotal: parseFloat(row.grand_total),
    totalCost: parseFloat(row.total_cost),
    grossProfit: parseFloat(row.gross_profit),
    paymentMethod: row.payment_method,
    amountPaid: parseFloat(row.amount_paid),
    changeDue: parseFloat(row.change_due || 0),
    status: row.status,
    idempotencyKey: row.idempotency_key,
    soldBy: row.sold_by ? {
      id: row.sold_by,
      _id: row.sold_by,
      name: row.seller_name || 'Staff'
    } : null,
    saleDate: row.sale_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const generateInvoiceNumber = async (clientInstance = null) => {
  const runner = clientInstance || { query };
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const countRes = await runner.query(`SELECT COUNT(*) FROM public.sales;`);
  const seq = String(parseInt(countRes.rows[0].count, 10) + 1).padStart(4, '0');
  const candidate = `INV-${dateStr}-${seq}`;

  const existsRes = await runner.query(`SELECT 1 FROM public.sales WHERE invoice_number = $1;`, [candidate]);
  if (existsRes.rows.length > 0) {
    return `INV-${dateStr}-${seq}-${Date.now().toString().slice(-4)}`;
  }
  return candidate;
};

const getSales = async ({
  search = '',
  paymentMethod = '',
  startDate = '',
  endDate = '',
  page = 1,
  limit = 20
} = {}) => {
  const conditions = [];
  const params = [];

  if (paymentMethod && paymentMethod !== 'ALL') {
    params.push(paymentMethod);
    conditions.push(`s.payment_method = $${params.length}`);
  }

  if (startDate) {
    params.push(new Date(startDate));
    conditions.push(`s.sale_date >= $${params.length}`);
  }

  if (endDate) {
    const e = new Date(endDate);
    e.setHours(23, 59, 59, 999);
    params.push(e);
    conditions.push(`s.sale_date <= $${params.length}`);
  }

  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(s.invoice_number ILIKE $${params.length} OR s.customer_name ILIKE $${params.length} OR s.customer_phone ILIKE $${params.length})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countSql = `SELECT COUNT(*) FROM public.sales s ${whereClause};`;
  const countRes = await query(countSql, params);
  const total = parseInt(countRes.rows[0].count, 10);

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 20;
  const offset = (pageNum - 1) * limitNum;

  const dataParams = [...params, limitNum, offset];
  const dataSql = `
    SELECT 
      s.*,
      u.name as seller_name
    FROM public.sales s
    LEFT JOIN public.users u ON u.id = s.sold_by
    ${whereClause}
    ORDER BY s.sale_date DESC, s.created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2};
  `;
  const dataRes = await query(dataSql, dataParams);

  const salesList = [];
  for (const row of dataRes.rows) {
    const itemsRes = await query(`
      SELECT si.*, p.unit as product_unit, p.image_url as product_image
      FROM public.sale_items si
      LEFT JOIN public.products p ON p.id = si.product_id
      WHERE si.sale_id = $1;
    `, [row.id]);
    salesList.push(formatSale(row, itemsRes.rows));
  }

  return {
    sales: salesList,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum) || 1
  };
};

const getSaleById = async (idOrInvoice) => {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrInvoice);
  const whereClause = isUUID ? `s.id = $1` : `s.mongo_id = $1 OR s.invoice_number = $1 OR s.id::text = $1`;

  const sql = `
    SELECT 
      s.*,
      u.name as seller_name
    FROM public.sales s
    LEFT JOIN public.users u ON u.id = s.sold_by
    WHERE ${whereClause} LIMIT 1;
  `;
  const res = await query(sql, [idOrInvoice]);
  if (!res.rows[0]) return null;

  const itemsRes = await query(`
    SELECT si.*, p.unit as product_unit, p.image_url as product_image
    FROM public.sale_items si
    LEFT JOIN public.products p ON p.id = si.product_id
    WHERE si.sale_id = $1;
  `, [res.rows[0].id]);

  return formatSale(res.rows[0], itemsRes.rows);
};

const findByIdempotencyKey = async (key) => {
  if (!key) return null;
  const res = await query(`SELECT id FROM public.sales WHERE idempotency_key = $1 LIMIT 1;`, [key]);
  if (!res.rows[0]) return null;
  return getSaleById(res.rows[0].id);
};

/**
 * Perform POS sale creation with SELECT FOR UPDATE row locking and atomic stock reduction
 */
const createSaleTransaction = async ({
  customerName = 'Walk-in Customer',
  customerPhone = '',
  items = [],
  discount = 0,
  taxRate = 0,
  paymentMethod = 'CASH',
  amountPaid = 0,
  idempotencyKey = null,
  userId = null
}) => {
  return withTransaction(async (client) => {
    // 1. Process items and validate stock with pessimistic row lock (FOR UPDATE)
    let subtotal = 0;
    let totalCost = 0;
    const validatedItems = [];

    for (const item of items) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.product);
      const pWhere = isUUID ? `id = $1` : `mongo_id = $1 OR id::text = $1`;
      const pRes = await client.query(
        `SELECT * FROM public.products WHERE (${pWhere}) AND is_deleted = false FOR UPDATE;`,
        [item.product]
      );
      const product = pRes.rows[0];

      if (!product) {
        throw new Error(`Product not found or has been removed from catalogue.`);
      }

      const qty = Number(item.quantity);
      if (qty <= 0) {
        throw new Error(`Invalid quantity ${qty} for product "${product.name}"`);
      }

      if (product.stock_quantity < qty) {
        throw new Error(`Insufficient stock for "${product.name}". Available: ${product.stock_quantity}, In Cart: ${qty}`);
      }

      const sellingPrice = item.sellingPrice !== undefined ? Number(item.sellingPrice) : parseFloat(product.selling_price);
      const unitCost = parseFloat(product.purchase_cost);
      const lineTotal = Number((qty * sellingPrice).toFixed(2));
      const lineCost = Number((qty * unitCost).toFixed(2));
      const lineProfit = Number((lineTotal - lineCost).toFixed(2));

      subtotal += lineTotal;
      totalCost += lineCost;

      validatedItems.push({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantity: qty,
        unitCostSnapshot: unitCost,
        sellingPriceSnapshot: sellingPrice,
        lineTotal,
        profit: lineProfit,
        currentStock: product.stock_quantity
      });
    }

    subtotal = Number(subtotal.toFixed(2));
    totalCost = Number(totalCost.toFixed(2));
    const discNum = Math.max(Number(discount) || 0, 0);
    const taxRateNum = Math.max(Number(taxRate) || 0, 0);
    const discountedSubtotal = Math.max(subtotal - discNum, 0);
    const taxAmount = Number(((discountedSubtotal * taxRateNum) / 100).toFixed(2));
    const grandTotal = Number((discountedSubtotal + taxAmount).toFixed(2));
    const paidNum = Number(amountPaid);

    if (paidNum < grandTotal && paymentMethod !== 'BANK_TRANSFER') {
      throw new Error(`Amount paid (₹${paidNum}) cannot be less than grand total (₹${grandTotal})`);
    }

    const changeDue = Number(Math.max(paidNum - grandTotal, 0).toFixed(2));
    const grossProfit = Number((grandTotal - totalCost).toFixed(2));
    const invoiceNumber = await generateInvoiceNumber(client);

    // 2. Insert into sales table
    const sRes = await client.query(`
      INSERT INTO public.sales (
        invoice_number, customer_name, customer_phone, subtotal, discount,
        tax_rate, tax_amount, grand_total, total_cost, gross_profit,
        payment_method, amount_paid, change_due, status, idempotency_key,
        sold_by, sale_date, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'COMPLETED', $14, $15, NOW(), NOW(), NOW())
      RETURNING *;
    `, [
      invoiceNumber, (customerName || 'Walk-in Customer').trim(),
      (customerPhone || '').trim(), subtotal, discNum, taxRateNum,
      taxAmount, grandTotal, totalCost, grossProfit, paymentMethod,
      paidNum, changeDue, idempotencyKey || null, userId
    ]);
    const sale = sRes.rows[0];

    // 3. Insert sale_items, reduce stock, and insert stock_movements
    for (const item of validatedItems) {
      await client.query(`
        INSERT INTO public.sale_items (
          sale_id, product_id, product_name, sku, quantity,
          unit_cost_snapshot, selling_price_snapshot, line_total, profit, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW());
      `, [
        sale.id, item.productId, item.productName, item.sku,
        item.quantity, item.unitCostSnapshot, item.sellingPriceSnapshot,
        item.lineTotal, item.profit
      ]);

      const newStock = item.currentStock - item.quantity;
      await client.query(`
        UPDATE public.products 
        SET stock_quantity = $1, updated_at = NOW() 
        WHERE id = $2;
      `, [newStock, item.productId]);

      await client.query(`
        INSERT INTO public.stock_movements (
          product_id, movement_type, quantity_changed, balance_after,
          reference_type, reference_id, notes, performed_by, created_at
        ) VALUES ($1, 'SALE_OUTWARD', $2, $3, 'SALE', $4, $5, $6, NOW());
      `, [
        item.productId, -item.quantity, newStock, invoiceNumber,
        `POS Sale to ${customerName || 'Walk-in'} (Invoice #${invoiceNumber})`, userId
      ]);
    }

    return getSaleById(sale.id);
  });
};

module.exports = {
  formatSale,
  generateInvoiceNumber,
  getSales,
  getSaleById,
  findByIdempotencyKey,
  createSaleTransaction
};
