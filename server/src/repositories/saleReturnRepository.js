/**
 * StockWise / MFEF - Sale Return Repository (PostgreSQL)
 * Transactional credit notes and inventory restoration
 */

const { query, withTransaction } = require('./db');

const formatReturn = (row, items = []) => {
  if (!row) return null;
  return {
    id: row.id,
    _id: row.id,
    mongoId: row.mongo_id,
    returnNumber: row.return_number,
    sale: row.sale_id ? {
      id: row.sale_id,
      _id: row.sale_id,
      invoiceNumber: row.invoice_number
    } : null,
    saleId: row.sale_id,
    invoiceNumber: row.invoice_number,
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
      refundAmount: parseFloat(it.refund_amount),
      unitCostSnapshot: parseFloat(it.unit_cost_snapshot)
    })),
    refundTotal: parseFloat(row.refund_total),
    refundMethod: row.refund_method,
    reason: row.reason,
    processedBy: row.processed_by ? {
      id: row.processed_by,
      _id: row.processed_by,
      name: row.processor_name || 'Staff'
    } : null,
    returnDate: row.return_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const getReturnsBySaleId = async (saleId) => {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(saleId);
  const whereClause = isUUID ? `sr.sale_id = $1` : `s.mongo_id = $1 OR sr.sale_id::text = $1`;
  const sql = `
    SELECT sr.*, u.name as processor_name
    FROM public.sale_returns sr
    LEFT JOIN public.sales s ON s.id = sr.sale_id
    LEFT JOIN public.users u ON u.id = sr.processed_by
    WHERE ${whereClause}
    ORDER BY sr.return_date DESC;
  `;
  const res = await query(sql, [saleId]);
  const returnsList = [];
  for (const r of res.rows) {
    const itemsRes = await query(`SELECT * FROM public.sale_return_items WHERE return_id = $1;`, [r.id]);
    returnsList.push(formatReturn(r, itemsRes.rows));
  }
  return returnsList;
};

const createSaleReturnTransaction = async ({
  saleIdOrInvoice,
  returnItems = [],
  reason = 'Customer return',
  refundMethod = 'CASH',
  userId = null
}) => {
  return withTransaction(async (client) => {
    // 1. Fetch original sale and lock it
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(saleIdOrInvoice);
    const sWhere = isUUID ? `id = $1` : `mongo_id = $1 OR invoice_number = $1 OR id::text = $1`;
    const sRes = await client.query(`SELECT * FROM public.sales WHERE ${sWhere} FOR UPDATE;`, [saleIdOrInvoice]);
    const sale = sRes.rows[0];

    if (!sale) {
      throw new Error('Sale not found');
    }

    if (sale.status === 'CANCELLED' || sale.status === 'RETURNED') {
      throw new Error(`Sale has already been marked as ${sale.status}`);
    }

    // Fetch original sale items
    const origItemsRes = await client.query(`SELECT * FROM public.sale_items WHERE sale_id = $1;`, [sale.id]);
    const origItems = origItemsRes.rows;

    const itemsToReturn = returnItems && returnItems.length > 0 ? returnItems : origItems;

    const returnSeqRes = await client.query(`SELECT COUNT(*) FROM public.sale_returns;`);
    const seq = String(parseInt(returnSeqRes.rows[0].count, 10) + 1).padStart(4, '0');
    const returnNumber = `RET-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${seq}`;

    let refundTotal = 0;
    const validatedReturnItems = [];

    for (const retItem of itemsToReturn) {
      const origItem = origItems.find((i) => {
        const retProd = retItem.product ? (retItem.product.id || retItem.product._id || retItem.product).toString() : '';
        return (i.product_id && retProd && (i.product_id === retProd || i.product_id.toString() === retProd)) ||
               (i.sku && retItem.sku && i.sku.toUpperCase() === retItem.sku.toUpperCase());
      });
      if (!origItem) continue;

      const returnQty = Math.min(Number(retItem.quantity) || origItem.quantity, origItem.quantity);
      if (returnQty <= 0) continue;

      const lineRefund = Number((returnQty * parseFloat(origItem.selling_price_snapshot)).toFixed(2));
      refundTotal += lineRefund;

      // Lock product row
      const pRes = await client.query(`SELECT * FROM public.products WHERE id = $1 FOR UPDATE;`, [origItem.product_id]);
      const product = pRes.rows[0];

      validatedReturnItems.push({
        productId: origItem.product_id,
        productName: origItem.product_name,
        sku: origItem.sku,
        quantity: returnQty,
        refundAmount: lineRefund,
        unitCostSnapshot: parseFloat(origItem.unit_cost_snapshot),
        currentStock: product ? product.stock_quantity : 0
      });
    }

    if (validatedReturnItems.length === 0) {
      throw new Error('No valid items found to return from this sale invoice');
    }

    refundTotal = Number(refundTotal.toFixed(2));

    // 2. Insert into sale_returns
    const srRes = await client.query(`
      INSERT INTO public.sale_returns (
        return_number, sale_id, invoice_number, refund_total,
        refund_method, reason, processed_by, return_date, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW())
      RETURNING *;
    `, [
      returnNumber, sale.id, sale.invoice_number, refundTotal,
      refundMethod || 'CASH', (reason || '').trim(), userId
    ]);
    const returnRecord = srRes.rows[0];

    // 3. Insert return items and restore inventory
    const savedItems = [];
    for (const item of validatedReturnItems) {
      const sriRes = await client.query(`
        INSERT INTO public.sale_return_items (
          return_id, product_id, product_name, sku, quantity,
          refund_amount, unit_cost_snapshot, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING *;
      `, [
        returnRecord.id, item.productId, item.productName, item.sku,
        item.quantity, item.refundAmount, item.unitCostSnapshot
      ]);
      savedItems.push(sriRes.rows[0]);

      // Restore stock
      const newStock = item.currentStock + item.quantity;
      await client.query(`
        UPDATE public.products 
        SET stock_quantity = $1, updated_at = NOW() 
        WHERE id = $2;
      `, [newStock, item.productId]);

      // Record movement
      await client.query(`
        INSERT INTO public.stock_movements (
          product_id, movement_type, quantity_changed, balance_after,
          reference_type, reference_id, notes, performed_by, created_at
        ) VALUES ($1, 'SALE_RETURN', $2, $3, 'RETURN', $4, $5, $6, NOW());
      `, [
        item.productId, item.quantity, newStock, returnNumber,
        `Customer return from invoice ${sale.invoice_number}: ${reason}`, userId
      ]);
    }

    // 4. Mark sale status as RETURNED
    await client.query(`UPDATE public.sales SET status = 'RETURNED', updated_at = NOW() WHERE id = $1;`, [sale.id]);

    return formatReturn(returnRecord, savedItems);
  });
};

module.exports = {
  formatReturn,
  getReturnsBySaleId,
  createSaleReturnTransaction
};
