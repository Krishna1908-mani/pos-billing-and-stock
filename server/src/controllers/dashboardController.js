const Product = require('../models/Product');
const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const Supplier = require('../models/Supplier');
const SupplierPayment = require('../models/SupplierPayment');

// @desc    Get live dashboard metrics, charts, and recent activity
// @route   GET /api/dashboard
// @access  Private
const getDashboardMetrics = async (req, res, next) => {
  try {
    const { timeRange = '30d' } = req.query;

    // Determine date range for charts
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
      // Default: 30 days
      startDate.setDate(now.getDate() - 30);
    }

    // Today's bounds
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // 1. Parallel execution of core queries
    const [
      totalProductsCount,
      inventoryValuationAgg,
      stockStatusAgg,
      todaySalesAgg,
      salesChartAgg,
      topProductsAgg,
      recentSales,
      recentPurchases,
      suppliersAgg,
      purchasesTotalAgg,
      paymentsTotalAgg
    ] = await Promise.all([
      // Total active products
      Product.countDocuments({ isDeleted: false }),

      // Total units & Valuation at cost
      Product.aggregate([
        { $match: { isDeleted: false } },
        {
          $group: {
            _id: null,
            totalUnits: { $sum: '$stockQuantity' },
            stockValuation: { $sum: { $multiply: ['$stockQuantity', '$purchaseCost'] } }
          }
        }
      ]),

      // Low stock and out of stock counts
      Product.aggregate([
        { $match: { isDeleted: false } },
        {
          $group: {
            _id: null,
            outOfStock: {
              $sum: { $cond: [{ $lte: ['$stockQuantity', 0] }, 1, 0] }
            },
            lowStock: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gt: ['$stockQuantity', 0] },
                      { $lte: ['$stockQuantity', '$lowStockThreshold'] }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]),

      // Today's sales revenue & gross profit
      Sale.aggregate([
        {
          $match: {
            status: 'COMPLETED',
            saleDate: { $gte: todayStart }
          }
        },
        {
          $group: {
            _id: null,
            todayRevenue: { $sum: '$grandTotal' },
            todayProfit: { $sum: '$grossProfit' },
            todayCount: { $sum: 1 }
          }
        }
      ]),

      // Chart: Sales & Profit over selected time range
      Sale.aggregate([
        {
          $match: {
            status: 'COMPLETED',
            saleDate: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } },
            revenue: { $sum: '$grandTotal' },
            profit: { $sum: '$grossProfit' },
            invoices: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),

      // Top 5 selling products in range
      Sale.aggregate([
        {
          $match: {
            status: 'COMPLETED',
            saleDate: { $gte: startDate }
          }
        },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product',
            name: { $first: '$items.productName' },
            sku: { $first: '$items.sku' },
            unitsSold: { $sum: '$items.quantity' },
            revenue: { $sum: '$items.lineTotal' }
          }
        },
        { $sort: { revenue: -1 } },
        { $limit: 5 }
      ]),

      // Recent 5 sales
      Sale.find()
        .sort({ saleDate: -1 })
        .limit(5)
        .populate('soldBy', 'name'),

      // Recent 5 purchases
      Purchase.find()
        .sort({ purchaseDate: -1 })
        .limit(5)
        .populate('supplier', 'name company'),

      // Suppliers opening balances
      Supplier.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: null, totalOpeningBalance: { $sum: '$openingBalance' } } }
      ]),

      // All purchases total amount
      Purchase.aggregate([
        { $group: { _id: null, totalPurchases: { $sum: '$totalAmount' } } }
      ]),

      // All supplier payments
      SupplierPayment.aggregate([
        { $group: { _id: null, totalPayments: { $sum: '$amount' } } }
      ])
    ]);

    // Format metrics
    const invData = inventoryValuationAgg[0] || { totalUnits: 0, stockValuation: 0 };
    const stockStatus = stockStatusAgg[0] || { outOfStock: 0, lowStock: 0 };
    const todayData = todaySalesAgg[0] || { todayRevenue: 0, todayProfit: 0, todayCount: 0 };

    // Calculate outstanding supplier balances dynamically
    const openingBal = suppliersAgg[0]?.totalOpeningBalance || 0;
    const allPurchases = purchasesTotalAgg[0]?.totalPurchases || 0;
    const allPayments = paymentsTotalAgg[0]?.totalPayments || 0;
    const outstandingSupplierBalance = Math.max(
      Number((openingBal + allPurchases - allPayments).toFixed(2)),
      0
    );

    // Prepare critical alerts
    const alerts = [];
    if (stockStatus.outOfStock > 0) {
      alerts.push({
        type: 'danger',
        message: `${stockStatus.outOfStock} product(s) are completely out of stock! Immediate restock needed.`
      });
    }
    if (stockStatus.lowStock > 0) {
      alerts.push({
        type: 'warning',
        message: `${stockStatus.lowStock} product(s) are below their low-stock safety threshold.`
      });
    }

    res.status(200).json({
      success: true,
      data: {
        kpis: {
          totalProducts: totalProductsCount,
          totalUnitsInStock: invData.totalUnits,
          currentStockValue: Number(invData.stockValuation.toFixed(2)),
          todaySalesRevenue: Number(todayData.todayRevenue.toFixed(2)),
          todayGrossProfit: Number(todayData.todayProfit.toFixed(2)),
          todayInvoicesCount: todayData.todayCount,
          lowStockCount: stockStatus.lowStock,
          outOfStockCount: stockStatus.outOfStock,
          outstandingSupplierBalance
        },
        charts: {
          salesTrend: salesChartAgg.map((s) => ({
            date: s._id,
            revenue: Number(s.revenue.toFixed(2)),
            profit: Number(s.profit.toFixed(2)),
            invoices: s.invoices
          })),
          topProducts: topProductsAgg.map((p) => ({
            id: p._id,
            name: p.name,
            sku: p.sku,
            unitsSold: p.unitsSold,
            revenue: Number(p.revenue.toFixed(2))
          }))
        },
        recentActivity: {
          sales: recentSales,
          purchases: recentPurchases
        },
        alerts
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboardMetrics
};

