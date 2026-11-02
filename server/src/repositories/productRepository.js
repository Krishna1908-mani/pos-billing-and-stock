/**
 * StockWise / MFEF - Product Repository (PostgreSQL)
 * Utilizes view_product_details for Mongoose virtual parity
 */

const { query } = require('./db');

const formatProduct = (row) => {
  if (!row) return null;
  const supplierObj = row.supplier_id ? {
    id: row.supplier_id,
    _id: row.supplier_id,
    name: row.supplier_name || '',
    company: row.supplier_company || '',
    phone: row.supplier_phone || ''
  } : null;

  return {
    id: row.id,
    _id: row.id,
    mongoId: row.mongo_id,
    name: row.name,
    sku: row.sku,
    category: row.category,
    description: row.description || '',
    supplier: supplierObj,
    supplierId: row.supplier_id || null,
    purchaseCost: parseFloat(row.purchase_cost || 0),
    sellingPrice: parseFloat(row.selling_price || 0),
    mrp: row.mrp !== null && row.mrp !== undefined ? parseFloat(row.mrp) : null,
    stockQuantity: parseInt(row.stock_quantity || 0, 10),
    lowStockThreshold: parseInt(row.low_stock_threshold || 10, 10),
    unit: row.unit || 'pcs',
    imageUrl: row.image_url || '',
    isDeleted: row.is_deleted,
    marginPercentage: parseFloat(row.margin_percentage || 0),
    stockStatus: row.stock_status || (row.stock_quantity <= 0 ? 'OUT_OF_STOCK' : (row.stock_quantity <= row.low_stock_threshold ? 'LOW_STOCK' : 'IN_STOCK')),
    stockValuation: parseFloat(row.stock_valuation || (row.stock_quantity * row.purchase_cost).toFixed(2)),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const getProducts = async ({
  search = '',
  category = '',
  stockStatus = '',
  supplier = '',
  page = 1,
  limit = 20,
  sortBy = 'name',
  sortOrder = 'asc'
} = {}) => {
  const conditions = ['p.is_deleted = false'];
  const params = [];

  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.description ILIKE $${params.length})`);
  }

  if (category && category !== 'ALL') {
    params.push(category);
    conditions.push(`p.category = $${params.length}`);
  }

  if (supplier && supplier !== 'ALL') {
    params.push(supplier);
    conditions.push(`(p.supplier_id::text = $${params.length} OR s.mongo_id = $${params.length})`);
  }

  if (stockStatus === 'OUT_OF_STOCK') {
    conditions.push('p.stock_quantity <= 0');
  } else if (stockStatus === 'LOW_STOCK') {
    conditions.push('p.stock_quantity > 0 AND p.stock_quantity <= p.low_stock_threshold');
  } else if (stockStatus === 'IN_STOCK') {
    conditions.push('p.stock_quantity > p.low_stock_threshold');
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  // Count query
  const countSql = `
    SELECT COUNT(*) 
    FROM public.view_product_details p
    LEFT JOIN public.suppliers s ON s.id = p.supplier_id
    ${whereClause};
  `;
  const countRes = await query(countSql, params);
  const total = parseInt(countRes.rows[0].count, 10);

  // Sorting
  const sortMap = {
    name: 'p.name',
    sku: 'p.sku',
    purchaseCost: 'p.purchase_cost',
    sellingPrice: 'p.selling_price',
    stockQuantity: 'p.stock_quantity',
    createdAt: 'p.created_at'
  };
  const sortCol = sortMap[sortBy] || 'p.name';
  const sortDir = sortOrder.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  // Pagination
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 20;
  const offset = (pageNum - 1) * limitNum;

  const dataParams = [...params, limitNum, offset];
  const dataSql = `
    SELECT 
      p.*,
      s.name as supplier_name,
      s.company as supplier_company,
      s.phone as supplier_phone
    FROM public.view_product_details p
    LEFT JOIN public.suppliers s ON s.id = p.supplier_id
    ${whereClause}
    ORDER BY ${sortCol} ${sortDir}
    LIMIT $${params.length + 1} OFFSET $${params.length + 2};
  `;
  const dataRes = await query(dataSql, dataParams);

  return {
    products: dataRes.rows.map(formatProduct),
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum) || 1
  };
};

const getProductById = async (idOrMongoId, clientInstance = null) => {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrMongoId);
  const whereClause = isUUID ? `p.id = $1` : `p.mongo_id = $1 OR p.id::text = $1`;
  const sql = `
    SELECT 
      p.*,
      s.name as supplier_name,
      s.company as supplier_company,
      s.phone as supplier_phone
    FROM public.view_product_details p
    LEFT JOIN public.suppliers s ON s.id = p.supplier_id
    WHERE ${whereClause} LIMIT 1;
  `;
  const runner = clientInstance || { query };
  const res = await runner.query(sql, [idOrMongoId]);
  return formatProduct(res.rows[0]);
};

/**
 * Pessimistic row locking for concurrent checkout safety
 */
const findProductForUpdate = async (idOrMongoId, client) => {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrMongoId);
  const whereClause = isUUID ? `id = $1` : `mongo_id = $1 OR id::text = $1`;
  const sql = `
    SELECT * FROM public.products 
    WHERE (${whereClause}) AND is_deleted = false 
    FOR UPDATE;
  `;
  const res = await client.query(sql, [idOrMongoId]);
  return formatProduct(res.rows[0]);
};

const findProductBySku = async (sku) => {
  const cleanSku = (sku || '').toUpperCase().trim();
  const res = await query(
    `SELECT * FROM public.products WHERE sku = $1 AND is_deleted = false LIMIT 1;`,
    [cleanSku]
  );
  return formatProduct(res.rows[0]);
};

const createProduct = async ({
  name, sku, category, description = '', supplier = null,
  purchaseCost, sellingPrice, mrp = null, stockQuantity = 0,
  lowStockThreshold = 10, unit = 'pcs', imageUrl = ''
}, clientInstance = null) => {
  const cleanSku = (sku || '').toUpperCase().trim();
  const runner = clientInstance || { query };
  const res = await runner.query(
    `INSERT INTO public.products (
      name, sku, category, description, supplier_id,
      purchase_cost, selling_price, mrp, stock_quantity,
      low_stock_threshold, unit, image_url, is_deleted
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, false)
    RETURNING id;`,
    [
      name.trim(), cleanSku, category.trim(), (description || '').trim(),
      supplier || null, Number(purchaseCost || 0), Number(sellingPrice || 0),
      mrp ? Number(mrp) : null, Number(stockQuantity || 0),
      Number(lowStockThreshold || 10), (unit || 'pcs').trim(), (imageUrl || '').trim()
    ]
  );
  return getProductById(res.rows[0].id, clientInstance);
};

const updateProduct = async (idOrMongoId, updates, clientInstance = null) => {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrMongoId);
  const whereClause = isUUID ? `id = $1` : `mongo_id = $1 OR id::text = $1`;

  const fields = [];
  const params = [idOrMongoId];

  if (updates.name !== undefined) {
    params.push(updates.name.trim());
    fields.push(`name = $${params.length}`);
  }
  if (updates.sku !== undefined) {
    params.push(updates.sku.toUpperCase().trim());
    fields.push(`sku = $${params.length}`);
  }
  if (updates.category !== undefined) {
    params.push(updates.category.trim());
    fields.push(`category = $${params.length}`);
  }
  if (updates.description !== undefined) {
    params.push(updates.description.trim());
    fields.push(`description = $${params.length}`);
  }
  if (updates.supplier !== undefined) {
    params.push(updates.supplier || null);
    fields.push(`supplier_id = $${params.length}`);
  }
  if (updates.purchaseCost !== undefined) {
    params.push(Number(updates.purchaseCost));
    fields.push(`purchase_cost = $${params.length}`);
  }
  if (updates.sellingPrice !== undefined) {
    params.push(Number(updates.sellingPrice));
    fields.push(`selling_price = $${params.length}`);
  }
  if (updates.mrp !== undefined) {
    params.push(updates.mrp !== null ? Number(updates.mrp) : null);
    fields.push(`mrp = $${params.length}`);
  }
  if (updates.lowStockThreshold !== undefined) {
    params.push(Number(updates.lowStockThreshold));
    fields.push(`low_stock_threshold = $${params.length}`);
  }
  if (updates.unit !== undefined) {
    params.push(updates.unit.trim());
    fields.push(`unit = $${params.length}`);
  }
  if (updates.imageUrl !== undefined) {
    params.push(updates.imageUrl.trim());
    fields.push(`image_url = $${params.length}`);
  }
  if (updates.stockQuantity !== undefined) {
    params.push(Number(updates.stockQuantity));
    fields.push(`stock_quantity = $${params.length}`);
  }

  if (fields.length === 0) {
    return getProductById(idOrMongoId, clientInstance);
  }

  const runner = clientInstance || { query };
  const sql = `UPDATE public.products SET ${fields.join(', ')}, updated_at = NOW() WHERE ${whereClause} RETURNING id;`;
  const res = await runner.query(sql, params);
  if (!res.rows[0]) return null;
  return getProductById(res.rows[0].id, clientInstance);
};

const updateStock = async (productId, delta, client) => {
  const sql = `
    UPDATE public.products 
    SET stock_quantity = stock_quantity + $2, updated_at = NOW() 
    WHERE id = $1 
    RETURNING *;
  `;
  const res = await client.query(sql, [productId, delta]);
  return formatProduct(res.rows[0]);
};

const deleteProduct = async (idOrMongoId) => {
  const prod = await getProductById(idOrMongoId);
  if (!prod) return null;

  // Check historical transactions in sales, purchases, or ledger
  const [salesRes, purchRes, ledgerRes] = await Promise.all([
    query(`SELECT COUNT(*) FROM public.sale_items WHERE product_id = $1;`, [prod.id]),
    query(`SELECT COUNT(*) FROM public.purchase_items WHERE product_id = $1;`, [prod.id]),
    query(`SELECT COUNT(*) FROM public.stock_movements WHERE product_id = $1;`, [prod.id])
  ]);

  const salesCount = parseInt(salesRes.rows[0].count, 10);
  const purchCount = parseInt(purchRes.rows[0].count, 10);
  const ledgerCount = parseInt(ledgerRes.rows[0].count, 10);

  if (salesCount > 0 || purchCount > 0 || ledgerCount > 0) {
    // Historical transactions exist -> soft delete
    const archivedSku = `${prod.sku}_DELETED_${Date.now()}`;
    await query(
      `UPDATE public.products SET is_deleted = true, sku = $1, updated_at = NOW() WHERE id = $2;`,
      [archivedSku, prod.id]
    );
    return {
      softDeleted: true,
      message: 'Product has historical transactions. Soft deleted to maintain audit integrity.'
    };
  }

  // Completely new and unused -> remove permanently
  await query(`DELETE FROM public.products WHERE id = $1;`, [prod.id]);
  return { softDeleted: false, message: 'Product deleted permanently' };
};

const getCategories = async () => {
  const res = await query(
    `SELECT DISTINCT category FROM public.products WHERE is_deleted = false AND category <> '' ORDER BY category ASC;`
  );
  return res.rows.map(r => r.category);
};

const getLowStockProducts = async () => {
  const sql = `
    SELECT 
      p.*,
      s.name as supplier_name,
      s.company as supplier_company,
      s.phone as supplier_phone
    FROM public.view_product_details p
    LEFT JOIN public.suppliers s ON s.id = p.supplier_id
    WHERE p.is_deleted = false AND p.stock_quantity <= p.low_stock_threshold
    ORDER BY p.stock_quantity ASC;
  `;
  const res = await query(sql);
  return res.rows.map(formatProduct);
};

module.exports = {
  formatProduct,
  getProducts,
  getProductById,
  findProductForUpdate,
  findProductBySku,
  createProduct,
  updateProduct,
  updateStock,
  deleteProduct,
  getCategories,
  getLowStockProducts
};

