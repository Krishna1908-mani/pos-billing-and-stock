/**
 * StockWise / MFEF - Supplier Repository (PostgreSQL)
 * Utilizes view_supplier_balances for dynamically derived balances
 */

const { query } = require('./db');

const formatSupplier = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    _id: row.id,
    mongoId: row.mongo_id,
    name: row.name,
    company: row.company,
    phone: row.phone,
    email: row.email,
    address: row.address,
    notes: row.notes,
    openingBalance: parseFloat(row.opening_balance || 0),
    currentBalance: parseFloat(row.current_balance !== undefined ? row.current_balance : row.opening_balance || 0),
    totalPurchased: parseFloat(row.total_purchased || 0),
    totalPayments: parseFloat(row.total_payments || 0),
    purchaseCount: parseInt(row.purchase_count || 0, 10),
    paymentCount: parseInt(row.payment_count || 0, 10),
    isActive: row.is_active,
    isDeleted: row.is_deleted,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const getSuppliers = async ({ search = '', page = 1, limit = 50, activeOnly = 'true' } = {}) => {
  const conditions = ['is_deleted = false'];
  const params = [];

  if (activeOnly === 'true') {
    conditions.push('is_active = true');
  }

  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(name ILIKE $${params.length} OR company ILIKE $${params.length} OR phone ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count query
  const countRes = await query(`SELECT COUNT(*) FROM public.view_supplier_balances ${whereClause};`, params);
  const total = parseInt(countRes.rows[0].count, 10);

  // Pagination
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 50;
  const offset = (pageNum - 1) * limitNum;

  const dataParams = [...params, limitNum, offset];
  const dataRes = await query(
    `SELECT * FROM public.view_supplier_balances
     ${whereClause}
     ORDER BY company ASC, name ASC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2};`,
    dataParams
  );

  return {
    suppliers: dataRes.rows.map(formatSupplier),
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum) || 1
  };
};

const getSupplierById = async (idOrMongoId) => {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrMongoId);
  const sql = isUUID
    ? `SELECT * FROM public.view_supplier_balances WHERE id = $1 LIMIT 1;`
    : `SELECT * FROM public.view_supplier_balances WHERE mongo_id = $1 OR id::text = $1 LIMIT 1;`;
  const res = await query(sql, [idOrMongoId]);
  return formatSupplier(res.rows[0]);
};

const getSupplierStatement = async (supplierId) => {
  const [pRes, payRes] = await Promise.all([
    query(`SELECT * FROM public.purchases WHERE supplier_id = $1 ORDER BY purchase_date DESC LIMIT 20;`, [supplierId]),
    query(`
      SELECT sp.*, u.name as recorded_by_name
      FROM public.supplier_payments sp
      LEFT JOIN public.users u ON u.id = sp.recorded_by
      WHERE sp.supplier_id = $1
      ORDER BY sp.payment_date DESC LIMIT 20;
    `, [supplierId])
  ]);
  return {
    purchases: pRes.rows.map(r => ({
      id: r.id,
      _id: r.id,
      purchaseNumber: r.purchase_number,
      totalAmount: parseFloat(r.total_amount),
      amountPaid: parseFloat(r.amount_paid),
      balanceDue: parseFloat(r.balance_due),
      paymentStatus: r.payment_status,
      purchaseDate: r.purchase_date
    })),
    payments: payRes.rows.map(r => ({
      id: r.id,
      _id: r.id,
      paymentNumber: r.payment_number,
      amount: parseFloat(r.amount),
      paymentDate: r.payment_date,
      paymentMethod: r.payment_method,
      referenceNumber: r.reference_number,
      recordedBy: r.recorded_by ? { id: r.recorded_by, _id: r.recorded_by, name: r.recorded_by_name } : null
    }))
  };
};

const createSupplier = async ({ name, company, phone, email = '', address = '', notes = '', openingBalance = 0, isActive = true }) => {
  const res = await query(
    `INSERT INTO public.suppliers (name, company, phone, email, address, notes, opening_balance, is_active, is_deleted)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
     RETURNING *;`,
    [name.trim(), company.trim(), phone.trim(), (email || '').trim(), (address || '').trim(), (notes || '').trim(), Number(openingBalance || 0), isActive]
  );
  return getSupplierById(res.rows[0].id);
};

const updateSupplier = async (idOrMongoId, updates) => {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrMongoId);
  const whereClause = isUUID ? `id = $1` : `mongo_id = $1 OR id::text = $1`;

  const fields = [];
  const params = [idOrMongoId];

  if (updates.name !== undefined) {
    params.push(updates.name.trim());
    fields.push(`name = $${params.length}`);
  }
  if (updates.company !== undefined) {
    params.push(updates.company.trim());
    fields.push(`company = $${params.length}`);
  }
  if (updates.phone !== undefined) {
    params.push(updates.phone.trim());
    fields.push(`phone = $${params.length}`);
  }
  if (updates.email !== undefined) {
    params.push(updates.email.trim());
    fields.push(`email = $${params.length}`);
  }
  if (updates.address !== undefined) {
    params.push(updates.address.trim());
    fields.push(`address = $${params.length}`);
  }
  if (updates.notes !== undefined) {
    params.push(updates.notes.trim());
    fields.push(`notes = $${params.length}`);
  }
  if (updates.openingBalance !== undefined) {
    params.push(Number(updates.openingBalance));
    fields.push(`opening_balance = $${params.length}`);
  }
  if (updates.isActive !== undefined) {
    params.push(updates.isActive);
    fields.push(`is_active = $${params.length}`);
  }

  if (fields.length === 0) {
    return getSupplierById(idOrMongoId);
  }

  const sql = `UPDATE public.suppliers SET ${fields.join(', ')}, updated_at = NOW() WHERE ${whereClause} RETURNING id;`;
  const res = await query(sql, params);
  if (!res.rows[0]) return null;
  return getSupplierById(res.rows[0].id);
};

const deleteSupplier = async (idOrMongoId) => {
  const supplier = await getSupplierById(idOrMongoId);
  if (!supplier) return null;

  // Check if supplier has purchases
  const pCheck = await query(`SELECT COUNT(*) FROM public.purchases WHERE supplier_id = $1;`, [supplier.id]);
  const purchaseCount = parseInt(pCheck.rows[0].count, 10);

  if (purchaseCount > 0) {
    // Soft deactivation
    await query(`UPDATE public.suppliers SET is_active = false, is_deleted = true, updated_at = NOW() WHERE id = $1;`, [supplier.id]);
    return { softDeleted: true, message: 'Supplier has associated purchase records. Deactivated instead of deleted.' };
  }

  // Hard delete if no child transactions
  await query(`DELETE FROM public.suppliers WHERE id = $1;`, [supplier.id]);
  return { softDeleted: false, message: 'Supplier deleted successfully' };
};

module.exports = {
  formatSupplier,
  getSuppliers,
  getSupplierById,
  getSupplierStatement,
  createSupplier,
  updateSupplier,
  deleteSupplier
};
