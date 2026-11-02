/**
 * StockWise / MFEF - Supplier Payment Repository (PostgreSQL)
 * Transactional supplier payments and accounts payable reconciliation
 */

const { query, withTransaction } = require('./db');

const formatPayment = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    _id: row.id,
    mongoId: row.mongo_id,
    paymentNumber: row.payment_number,
    supplier: row.supplier_id ? {
      id: row.supplier_id,
      _id: row.supplier_id,
      name: row.supplier_name,
      company: row.supplier_company,
      phone: row.supplier_phone
    } : null,
    supplierId: row.supplier_id,
    purchase: row.purchase_id ? {
      id: row.purchase_id,
      _id: row.purchase_id,
      purchaseNumber: row.purchase_number,
      totalAmount: parseFloat(row.purchase_total || 0),
      balanceDue: parseFloat(row.purchase_balance || 0)
    } : null,
    purchaseId: row.purchase_id,
    amount: parseFloat(row.amount),
    paymentDate: row.payment_date,
    paymentMethod: row.payment_method,
    referenceNumber: row.reference_number || '',
    notes: row.notes || '',
    recordedBy: row.recorded_by ? {
      id: row.recorded_by,
      _id: row.recorded_by,
      name: row.recorder_name || 'Staff'
    } : null,
    createdAt: row.created_at
  };
};

const getSupplierDues = async () => {
  // Query all active suppliers with their live derived balances from view_supplier_balances
  const suppRes = await query(`
    SELECT * FROM public.view_supplier_balances 
    WHERE is_active = true AND is_deleted = false 
    ORDER BY company ASC;
  `);

  // Query all purchases with balance_due > 0
  const purchRes = await query(`
    SELECT 
      pu.*,
      s.name as supplier_name,
      s.company as supplier_company,
      s.phone as supplier_phone
    FROM public.purchases pu
    JOIN public.suppliers s ON s.id = pu.supplier_id
    WHERE pu.balance_due > 0
    ORDER BY pu.due_date ASC NULLS LAST, pu.purchase_date ASC;
  `);

  const now = new Date();
  let totalOutstandingAll = 0;
  let totalOverdueAll = 0;

  const supplierPayables = suppRes.rows.map(s => {
    const currentOutstanding = parseFloat(s.current_outstanding || 0);
    totalOutstandingAll += currentOutstanding;

    const myUnpaidPurchases = purchRes.rows
      .filter(p => p.supplier_id === s.id)
      .map(p => {
        const isOverdue = p.due_date && new Date(p.due_date) < now;
        if (isOverdue) totalOverdueAll += parseFloat(p.balance_due);
        return {
          id: p.id,
          _id: p.id,
          purchaseNumber: p.purchase_number,
          supplierInvoiceNumber: p.supplier_invoice_number,
          purchaseDate: p.purchase_date,
          dueDate: p.due_date,
          totalAmount: parseFloat(p.total_amount),
          amountPaid: parseFloat(p.amount_paid),
          balanceDue: parseFloat(p.balance_due),
          paymentStatus: p.payment_status,
          isOverdue
        };
      });

    return {
      supplier: {
        id: s.id,
        _id: s.id,
        name: s.name,
        company: s.company,
        phone: s.phone,
        email: s.email,
        openingBalance: parseFloat(s.opening_balance)
      },
      totalPurchased: parseFloat(s.total_purchased || 0),
      totalPaidOnPurchases: parseFloat(s.total_payments || 0),
      totalBalanceDue: currentOutstanding,
      unpaidInvoicesCount: myUnpaidPurchases.length,
      unpaidInvoices: myUnpaidPurchases
    };
  });

  return {
    totalOutstandingAll: Number(totalOutstandingAll.toFixed(2)),
    totalOverdueAll: Number(totalOverdueAll.toFixed(2)),
    supplierCount: supplierPayables.length,
    payables: supplierPayables
  };
};

const getPayments = async ({ supplier = '', purchase = '', page = 1, limit = 20 } = {}) => {
  const conditions = [];
  const params = [];

  if (supplier && supplier !== 'ALL') {
    params.push(supplier);
    conditions.push(`(sp.supplier_id::text = $${params.length} OR s.mongo_id = $${params.length})`);
  }

  if (purchase && purchase !== 'ALL') {
    params.push(purchase);
    conditions.push(`(sp.purchase_id::text = $${params.length} OR pu.mongo_id = $${params.length})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countSql = `SELECT COUNT(*) FROM public.supplier_payments sp LEFT JOIN public.suppliers s ON s.id = sp.supplier_id ${whereClause};`;
  const countRes = await query(countSql, params);
  const total = parseInt(countRes.rows[0].count, 10);

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 20;
  const offset = (pageNum - 1) * limitNum;

  const dataParams = [...params, limitNum, offset];
  const dataSql = `
    SELECT 
      sp.*,
      s.name as supplier_name,
      s.company as supplier_company,
      s.phone as supplier_phone,
      pu.purchase_number,
      pu.total_amount as purchase_total,
      pu.balance_due as purchase_balance,
      u.name as recorder_name
    FROM public.supplier_payments sp
    LEFT JOIN public.suppliers s ON s.id = sp.supplier_id
    LEFT JOIN public.purchases pu ON pu.id = sp.purchase_id
    LEFT JOIN public.users u ON u.id = sp.recorded_by
    ${whereClause}
    ORDER BY sp.payment_date DESC, sp.created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2};
  `;
  const dataRes = await query(dataSql, dataParams);

  return {
    payments: dataRes.rows.map(formatPayment),
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum) || 1
  };
};

const createPaymentTransaction = async ({
  supplierId,
  purchaseId = null,
  amount,
  paymentDate = new Date(),
  paymentMethod = 'BANK_TRANSFER',
  referenceNumber = '',
  notes = '',
  userId = null
}) => {
  return withTransaction(async (client) => {
    const payNum = Number(amount);
    if (!payNum || payNum <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    // Verify supplier
    const isSuppUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(supplierId);
    const sWhere = isSuppUUID ? `id = $1` : `mongo_id = $1 OR id::text = $1`;
    const sRes = await client.query(`SELECT * FROM public.suppliers WHERE ${sWhere} AND is_deleted = false;`, [supplierId]);
    const supplier = sRes.rows[0];
    if (!supplier) throw new Error('Supplier not found');

    let targetPurchase = null;
    if (purchaseId) {
      const isPuUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(purchaseId);
      const puWhere = isPuUUID ? `id = $1` : `mongo_id = $1 OR purchase_number = $1 OR id::text = $1`;
      const puRes = await client.query(`SELECT * FROM public.purchases WHERE ${puWhere} FOR UPDATE;`, [purchaseId]);
      targetPurchase = puRes.rows[0];

      if (!targetPurchase) throw new Error('Purchase record not found');
      if (targetPurchase.supplier_id !== supplier.id) {
        throw new Error('Purchase does not belong to this supplier');
      }
      if (parseFloat(targetPurchase.balance_due) <= 0) {
        throw new Error('This purchase invoice is already fully paid');
      }
    }

    const payCountRes = await client.query(`SELECT COUNT(*) FROM public.supplier_payments;`);
    const seq = String(parseInt(payCountRes.rows[0].count, 10) + 1).padStart(4, '0');
    const paymentNumber = `PAY-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${seq}`;

    // Insert payment
    const spRes = await client.query(`
      INSERT INTO public.supplier_payments (
        payment_number, supplier_id, purchase_id, amount,
        payment_date, payment_method, reference_number, notes,
        recorded_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *;
    `, [
      paymentNumber, supplier.id, targetPurchase ? targetPurchase.id : null,
      payNum, new Date(paymentDate), paymentMethod || 'BANK_TRANSFER',
      (referenceNumber || '').trim(), (notes || '').trim(), userId
    ]);
    const payment = spRes.rows[0];

    // If linked to specific purchase, update purchase paid & status
    if (targetPurchase) {
      const currentPaid = parseFloat(targetPurchase.amount_paid || 0);
      const totalAmount = parseFloat(targetPurchase.total_amount);
      const newPaid = Math.min(Number((currentPaid + payNum).toFixed(2)), totalAmount);
      const newBalanceDue = Math.max(Number((totalAmount - newPaid).toFixed(2)), 0);

      let newStatus = 'PARTIAL';
      if (newBalanceDue === 0) newStatus = 'PAID';

      await client.query(`
        UPDATE public.purchases 
        SET amount_paid = $1, balance_due = $2, payment_status = $3, updated_at = NOW() 
        WHERE id = $4;
      `, [newPaid, newBalanceDue, newStatus, targetPurchase.id]);
    }

    // Return populated payment
    const populatedRes = await client.query(`
      SELECT 
        sp.*,
        s.name as supplier_name,
        s.company as supplier_company,
        s.phone as supplier_phone,
        pu.purchase_number,
        pu.total_amount as purchase_total,
        pu.balance_due as purchase_balance,
        u.name as recorder_name
      FROM public.supplier_payments sp
      LEFT JOIN public.suppliers s ON s.id = sp.supplier_id
      LEFT JOIN public.purchases pu ON pu.id = sp.purchase_id
      LEFT JOIN public.users u ON u.id = sp.recorded_by
      WHERE sp.id = $1;
    `, [payment.id]);

    return formatPayment(populatedRes.rows[0]);
  });
};

module.exports = {
  formatPayment,
  getSupplierDues,
  getPayments,
  createPaymentTransaction
};
