/**
 * StockWise / MFEF - Restock Intelligence Repository (PostgreSQL)
 */

const { query } = require('./db');

const getRestockSalesAnalytics = async ({ windowStartDate, category = null, supplierId = null } = {}) => {
  const prodConditions = ['p.is_deleted = false'];
  const prodParams = [];

  if (category && category !== 'ALL') {
    prodParams.push(category);
    prodConditions.push(`p.category = $${prodParams.length}`);
  }

  if (supplierId) {
    prodParams.push(supplierId);
    prodConditions.push(`(p.supplier_id::text = $${prodParams.length} OR s.mongo_id = $${prodParams.length})`);
  }

  const prodWhere = `WHERE ${prodConditions.join(' AND ')}`;

  const prodSql = `
    SELECT 
      p.*,
      s.name as supplier_name,
      s.company as supplier_company,
      s.phone as supplier_phone
    FROM public.view_product_details p
    LEFT JOIN public.suppliers s ON s.id = p.supplier_id
    ${prodWhere}
    ORDER BY p.name ASC;
  `;
  const prodRes = await query(prodSql, prodParams);

  // Sales aggregation in window
  const salesSql = `
    SELECT 
      si.product_id,
      SUM(si.quantity) as "totalUnitsSold",
      COUNT(DISTINCT s.id) as "salesCount",
      ROUND(SUM(si.line_total), 2) as "totalRevenue"
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    WHERE s.status = 'COMPLETED' AND s.sale_date >= $1
    GROUP BY si.product_id;
  `;
  const salesRes = await query(salesSql, [windowStartDate]);

  const salesMap = new Map();
  salesRes.rows.forEach(r => {
    salesMap.set(r.product_id, {
      totalUnitsSold: parseInt(r.totalUnitsSold, 10),
      salesCount: parseInt(r.salesCount, 10),
      totalRevenue: parseFloat(r.totalRevenue)
    });
  });

  return {
    products: prodRes.rows,
    salesMap
  };
};

module.exports = {
  getRestockSalesAnalytics
};

