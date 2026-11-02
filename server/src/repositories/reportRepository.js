/**
 * StockWise / MFEF - Report Repository (PostgreSQL)
 * Detailed accounting, sales margins, and inventory valuation reports
 */

const { query } = require('./db');

const getSalesReport = async ({ startDate = '', endDate = '' } = {}) => {
  const conditions = ["s.status = 'COMPLETED'"];
  const params = [];

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

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const sql = `
    SELECT 
      TO_CHAR(s.sale_date, 'YYYY-MM-DD') as date,
      ROUND(SUM(s.grand_total), 2) as "totalSales",
      ROUND(SUM(s.total_cost), 2) as "totalCost",
      ROUND(SUM(s.gross_profit), 2) as "grossProfit",
      COUNT(DISTINCT s.id) as "invoiceCount",
      COALESCE(SUM(si.quantity), 0) as "unitsSold"
    FROM public.sales s
    LEFT JOIN public.sale_items si ON si.sale_id = s.id
    ${whereClause}
    GROUP BY TO_CHAR(s.sale_date, 'YYYY-MM-DD')
    ORDER BY date ASC;
  `;

  const res = await query(sql, params);

  const dailyBreakdown = res.rows.map(r => ({
    _id: r.date,
    date: r.date,
    totalSales: parseFloat(r.totalSales || 0),
    totalCost: parseFloat(r.totalCost || 0),
    grossProfit: parseFloat(r.grossProfit || 0),
    invoiceCount: parseInt(r.invoiceCount || 0, 10),
    unitsSold: parseInt(r.unitsSold || 0, 10)
  }));

  const overallSummary = dailyBreakdown.reduce(
    (acc, day) => {
      acc.totalRevenue += day.totalSales;
      acc.totalCost += day.totalCost;
      acc.grossProfit += day.grossProfit;
      acc.totalInvoices += day.invoiceCount;
      acc.totalUnitsSold += day.unitsSold;
      return acc;
    },
    { totalRevenue: 0, totalCost: 0, grossProfit: 0, totalInvoices: 0, totalUnitsSold: 0 }
  );

  overallSummary.totalRevenue = Number(overallSummary.totalRevenue.toFixed(2));
  overallSummary.totalCost = Number(overallSummary.totalCost.toFixed(2));
  overallSummary.grossProfit = Number(overallSummary.grossProfit.toFixed(2));

  const overallMargin = overallSummary.totalRevenue > 0
    ? Number(((overallSummary.grossProfit / overallSummary.totalRevenue) * 100).toFixed(2))
    : 0;

  return {
    dailyBreakdown,
    overallSummary: {
      ...overallSummary,
      overallMargin
    }
  };
};

const getInventoryValuationReport = async () => {
  const [catRes, prodRes] = await Promise.all([
    query(`
      SELECT 
        category as _id,
        category,
        COUNT(*) as "productCount",
        COALESCE(SUM(stock_quantity), 0) as "totalUnits",
        COALESCE(SUM(stock_quantity * purchase_cost), 0.00) as "categoryValuationAtCost",
        COALESCE(SUM(stock_quantity * selling_price), 0.00) as "categoryValuationAtSelling"
      FROM public.products
      WHERE is_deleted = false
      GROUP BY category
      ORDER BY "categoryValuationAtCost" DESC;
    `),
    query(`
      SELECT 
        p.id, p.id as _id, p.name, p.sku, p.category, p.stock_quantity as "stockQuantity",
        p.purchase_cost as "purchaseCost", p.selling_price as "sellingPrice",
        p.low_stock_threshold as "lowStockThreshold", p.unit,
        s.name as "supplierName", s.company as "supplierCompany"
      FROM public.products p
      LEFT JOIN public.suppliers s ON s.id = p.supplier_id
      WHERE p.is_deleted = false
      ORDER BY (p.stock_quantity * p.purchase_cost) DESC;
    `)
  ]);

  const categoryBreakdown = catRes.rows.map(r => ({
    _id: r.category,
    category: r.category,
    productCount: parseInt(r.productCount, 10),
    totalUnits: parseInt(r.totalUnits, 10),
    categoryValuationAtCost: parseFloat(r.categoryValuationAtCost),
    categoryValuationAtSelling: parseFloat(r.categoryValuationAtSelling)
  }));

  const products = prodRes.rows.map(p => {
    const stockQty = parseInt(p.stockQuantity, 10);
    const cost = parseFloat(p.purchaseCost);
    const selling = parseFloat(p.sellingPrice);
    return {
      _id: p.id,
      id: p.id,
      name: p.name,
      sku: p.sku,
      category: p.category,
      unit: p.unit,
      stockQuantity: stockQty,
      purchaseCost: cost,
      sellingPrice: selling,
      valuationAtCost: Number((stockQty * cost).toFixed(2)),
      valuationAtSelling: Number((stockQty * selling).toFixed(2)),
      supplier: p.supplierName ? { name: p.supplierName, company: p.supplierCompany } : null
    };
  });

  const totals = categoryBreakdown.reduce(
    (acc, cat) => {
      acc.totalValuationAtCost += cat.categoryValuationAtCost;
      acc.totalValuationAtSelling += cat.categoryValuationAtSelling;
      acc.totalUnits += cat.totalUnits;
      return acc;
    },
    { totalValuationAtCost: 0, totalValuationAtSelling: 0, totalUnits: 0 }
  );

  return {
    totals: {
      totalProducts: products.length,
      totalUnits: totals.totalUnits,
      totalValuationAtCost: Number(totals.totalValuationAtCost.toFixed(2)),
      totalValuationAtSelling: Number(totals.totalValuationAtSelling.toFixed(2))
    },
    categoryBreakdown,
    products
  };
};

const getPurchasesReport = async ({ startDate = '', endDate = '' } = {}) => {
  const conditions = [];
  const params = [];

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

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT 
      pu.supplier_id as "supplierId",
      s.name as "supplierName",
      s.company as company,
      ROUND(SUM(pu.total_amount), 2) as "totalSpent",
      ROUND(SUM(pu.amount_paid), 2) as "totalPaid",
      ROUND(SUM(pu.balance_due), 2) as "totalBalanceDue",
      COUNT(pu.id) as "purchaseCount"
    FROM public.purchases pu
    JOIN public.suppliers s ON s.id = pu.supplier_id
    ${whereClause}
    GROUP BY pu.supplier_id, s.name, s.company
    ORDER BY "totalSpent" DESC;
  `;

  const res = await query(sql, params);
  return res.rows.map(r => ({
    supplierId: r.supplierId,
    supplierName: r.supplierName,
    company: r.company,
    totalSpent: parseFloat(r.totalSpent || 0),
    totalPaid: parseFloat(r.totalPaid || 0),
    totalBalanceDue: parseFloat(r.totalBalanceDue || 0),
    purchaseCount: parseInt(r.purchaseCount || 0, 10)
  }));
};

const getTopProductsReport = async ({ limit = 10, startDate = '', endDate = '' } = {}) => {
  const conditions = ["s.status = 'COMPLETED'"];
  const params = [];

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

  params.push(parseInt(limit, 10) || 10);
  const limitParam = `$${params.length}`;

  const sql = `
    SELECT 
      si.product_id as _id,
      si.product_name as "productName",
      si.sku,
      SUM(si.quantity) as "unitsSold",
      ROUND(SUM(si.line_total), 2) as "totalRevenue",
      ROUND(SUM(si.profit), 2) as "totalProfit"
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    WHERE ${conditions.join(' AND ')}
    GROUP BY si.product_id, si.product_name, si.sku
    ORDER BY "totalRevenue" DESC
    LIMIT ${limitParam};
  `;

  const res = await query(sql, params);
  return res.rows.map(r => ({
    _id: r._id,
    productName: r.productName,
    sku: r.sku,
    unitsSold: parseInt(r.unitsSold || 0, 10),
    totalRevenue: parseFloat(r.totalRevenue || 0),
    totalProfit: parseFloat(r.totalProfit || 0)
  }));
};

module.exports = {
  getSalesReport,
  getInventoryValuationReport,
  getPurchasesReport,
  getTopProductsReport
};
