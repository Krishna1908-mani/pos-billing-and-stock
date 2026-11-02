/**
 * StockWise / MFEF - Dashboard Repository (PostgreSQL)
 * Fast aggregated SQL analytics, charts, and activity feeds
 */

const { query } = require('./db');

const getDashboardMetrics = async ({ timeRange = '30d' } = {}) => {
  const now = new Date();
  const startDate = new Date();

  if (timeRange === '7d') {
    startDate.setDate(now.getDate() - 7);
  } else if (timeRange === 'today') {
    startDate.setHours(0, 0, 0, 0);
  } else if (timeRange === 'month') {
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);
  } else {
    // Default 30d
    startDate.setDate(now.getDate() - 30);
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    productsSummaryRes,
    todaySalesRes,
    salesTrendRes,
    topProductsRes,
    recentSalesRes,
    recentPurchasesRes,
    supplierDuesRes
  ] = await Promise.all([
    // Products and Inventory summary
    query(`
      SELECT 
        COUNT(*) as total_products,
        COALESCE(SUM(stock_quantity), 0) as total_units,
        COALESCE(SUM(stock_quantity * purchase_cost), 0.00) as stock_valuation,
        COALESCE(SUM(CASE WHEN stock_quantity <= 0 THEN 1 ELSE 0 END), 0) as out_of_stock,
        COALESCE(SUM(CASE WHEN stock_quantity > 0 AND stock_quantity <= low_stock_threshold THEN 1 ELSE 0 END), 0) as low_stock
      FROM public.products
      WHERE is_deleted = false;
    `),

    // Today's sales
    query(`
      SELECT 
        COALESCE(SUM(grand_total), 0.00) as today_revenue,
        COALESCE(SUM(gross_profit), 0.00) as today_profit,
        COUNT(*) as today_count
      FROM public.sales
      WHERE status = 'COMPLETED' AND sale_date >= $1;
    `, [todayStart]),

    // Sales Trend Chart (daily breakdown)
    query(`
      SELECT 
        TO_CHAR(sale_date, 'YYYY-MM-DD') as date,
        ROUND(SUM(grand_total), 2) as revenue,
        ROUND(SUM(gross_profit), 2) as profit,
        COUNT(*) as invoices
      FROM public.sales
      WHERE status = 'COMPLETED' AND sale_date >= $1
      GROUP BY TO_CHAR(sale_date, 'YYYY-MM-DD')
      ORDER BY date ASC;
    `, [startDate]),

    // Top 5 selling products
    query(`
      SELECT 
        si.product_id,
        si.product_name as name,
        si.sku,
        SUM(si.quantity) as "unitsSold",
        ROUND(SUM(si.line_total), 2) as revenue
      FROM public.sale_items si
      JOIN public.sales s ON s.id = si.sale_id
      WHERE s.status = 'COMPLETED' AND s.sale_date >= $1
      GROUP BY si.product_id, si.product_name, si.sku
      ORDER BY revenue DESC
      LIMIT 5;
    `, [startDate]),

    // Recent 5 sales
    query(`
      SELECT 
        s.id, s.invoice_number as "invoiceNumber", s.customer_name as "customerName",
        s.grand_total as "grandTotal", s.payment_method as "paymentMethod",
        s.status, s.sale_date as "saleDate", u.name as "sellerName"
      FROM public.sales s
      LEFT JOIN public.users u ON u.id = s.sold_by
      ORDER BY s.sale_date DESC, s.created_at DESC
      LIMIT 5;
    `),

    // Recent 5 purchases
    query(`
      SELECT 
        pu.id, pu.purchase_number as "purchaseNumber",
        pu.total_amount as "totalAmount", pu.payment_status as "paymentStatus",
        pu.purchase_date as "purchaseDate", s.company as "supplierCompany"
      FROM public.purchases pu
      LEFT JOIN public.suppliers s ON s.id = pu.supplier_id
      ORDER BY pu.purchase_date DESC, pu.created_at DESC
      LIMIT 5;
    `),

    // Total supplier dues from view_supplier_balances
    query(`
      SELECT COALESCE(SUM(current_outstanding), 0.00) as total_dues
      FROM public.view_supplier_balances
      WHERE is_active = true AND is_deleted = false;
    `)
  ]);

  const pSum = productsSummaryRes.rows[0];
  const tSales = todaySalesRes.rows[0];
  const totalDues = parseFloat(supplierDuesRes.rows[0].total_dues || 0);

  const outOfStock = parseInt(pSum.out_of_stock, 10);
  const lowStock = parseInt(pSum.low_stock, 10);

  const alerts = [];
  if (outOfStock > 0) {
    alerts.push({
      type: 'danger',
      message: `${outOfStock} product(s) are completely out of stock.`
    });
  }
  if (lowStock > 0) {
    alerts.push({
      type: 'warning',
      message: `${lowStock} product(s) are below their low-stock safety threshold.`
    });
  }

  return {
    kpis: {
      totalProducts: parseInt(pSum.total_products, 10),
      totalUnitsInStock: parseInt(pSum.total_units, 10),
      currentStockValue: Number(parseFloat(pSum.stock_valuation).toFixed(2)),
      todaySalesRevenue: Number(parseFloat(tSales.today_revenue).toFixed(2)),
      todayGrossProfit: Number(parseFloat(tSales.today_profit).toFixed(2)),
      todayInvoicesCount: parseInt(tSales.today_count, 10),
      lowStockCount: lowStock,
      outOfStockCount: outOfStock,
      outstandingSupplierBalance: Number(totalDues.toFixed(2))
    },
    charts: {
      salesTrend: salesTrendRes.rows.map(r => ({
        date: r.date,
        _id: r.date,
        revenue: Number(parseFloat(r.revenue).toFixed(2)),
        profit: Number(parseFloat(r.profit).toFixed(2)),
        invoices: parseInt(r.invoices, 10)
      })),
      topProducts: topProductsRes.rows.map(r => ({
        id: r.product_id,
        _id: r.product_id,
        name: r.name,
        sku: r.sku,
        unitsSold: parseInt(r.unitsSold, 10),
        revenue: Number(parseFloat(r.revenue).toFixed(2))
      }))
    },
    recentActivity: {
      sales: recentSalesRes.rows.map(r => ({
        ...r,
        _id: r.id,
        grandTotal: parseFloat(r.grandTotal)
      })),
      purchases: recentPurchasesRes.rows.map(r => ({
        ...r,
        _id: r.id,
        totalAmount: parseFloat(r.totalAmount)
      }))
    },
    alerts
  };
};

module.exports = {
  getDashboardMetrics
};
