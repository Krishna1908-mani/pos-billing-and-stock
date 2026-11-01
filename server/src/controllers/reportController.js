const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const SupplierPayment = require('../models/SupplierPayment');

// @desc    Get Sales & Profit analytics report
// @route   GET /api/reports/sales
// @access  Private
const getSalesReport = async (req, res, next) => {
  try {
    const { startDate, endDate, format } = req.query;

    const matchQuery = { status: 'COMPLETED' };
    if (startDate || endDate) {
      matchQuery.saleDate = {};
      if (startDate) matchQuery.saleDate.$gte = new Date(startDate);
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        matchQuery.saleDate.$lte = e;
      }
    }

    // Daily sales breakdown aggregation
    const dailyBreakdown = await Sale.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } },
          totalSales: { $sum: '$grandTotal' },
          totalCost: { $sum: '$totalCost' },
          grossProfit: { $sum: '$grossProfit' },
          invoiceCount: { $sum: 1 },
          unitsSold: { $sum: { $sum: '$items.quantity' } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Overall summary metrics
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

    const overallMargin = overallSummary.totalRevenue > 0
      ? Number(((overallSummary.grossProfit / overallSummary.totalRevenue) * 100).toFixed(2))
      : 0;

    // Handle CSV export format
    if (format === 'csv') {
      let csv = 'Date,Invoices,Units Sold,Revenue (INR),Cost (INR),Gross Profit (INR),Margin (%)\n';
      dailyBreakdown.forEach((row) => {
        const margin = row.totalSales > 0 ? ((row.grossProfit / row.totalSales) * 100).toFixed(2) : 0;
        csv += `${row._id},${row.invoiceCount},${row.unitsSold},${row.totalSales.toFixed(2)},${row.totalCost.toFixed(2)},${row.grossProfit.toFixed(2)},${margin}%\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=SalesReport.csv');
      return res.status(200).send(csv);
    }

    res.status(200).json({
      success: true,
      summary: {
        totalRevenue: Number(overallSummary.totalRevenue.toFixed(2)),
        totalCost: Number(overallSummary.totalCost.toFixed(2)),
        grossProfit: Number(overallSummary.grossProfit.toFixed(2)),
        overallMargin,
        totalInvoices: overallSummary.totalInvoices,
        totalUnitsSold: overallSummary.totalUnitsSold
      },
      dailyBreakdown
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Inventory Valuation report by category
// @route   GET /api/reports/inventory-valuation
// @access  Private
const getInventoryValuationReport = async (req, res, next) => {
  try {
    const { format } = req.query;

    const products = await Product.find({ isDeleted: false }).populate('supplier', 'name company');

    let totalUnits = 0;
    let totalCostValuation = 0;
    let totalRetailValuation = 0;

    const categoryMap = {};

    products.forEach((p) => {
      const units = p.stockQuantity || 0;
      const costVal = units * p.purchaseCost;
      const retailVal = units * p.sellingPrice;

      totalUnits += units;
      totalCostValuation += costVal;
      totalRetailValuation += retailVal;

      const cat = p.category || 'Uncategorized';
      if (!categoryMap[cat]) {
        categoryMap[cat] = {
          category: cat,
          productCount: 0,
          totalUnits: 0,
          costValuation: 0,
          retailValuation: 0
        };
      }

      categoryMap[cat].productCount += 1;
      categoryMap[cat].totalUnits += units;
      categoryMap[cat].costValuation += costVal;
      categoryMap[cat].retailValuation += retailVal;
    });

    const categorySummary = Object.values(categoryMap).map((c) => ({
      ...c,
      costValuation: Number(c.costValuation.toFixed(2)),
      retailValuation: Number(c.retailValuation.toFixed(2)),
      potentialProfit: Number((c.retailValuation - c.costValuation).toFixed(2))
    }));

    if (format === 'csv') {
      let csv = 'Category,Products Count,Units in Stock,Cost Valuation (INR),Retail Valuation (INR),Potential Profit (INR)\n';
      categorySummary.forEach((c) => {
        csv += `"${c.category}",${c.productCount},${c.totalUnits},${c.costValuation},${c.retailValuation},${c.potentialProfit}\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=InventoryValuationReport.csv');
      return res.status(200).send(csv);
    }

    res.status(200).json({
      success: true,
      summary: {
        totalProducts: products.length,
        totalUnits,
        totalCostValuation: Number(totalCostValuation.toFixed(2)),
        totalRetailValuation: Number(totalRetailValuation.toFixed(2)),
        potentialGrossProfit: Number((totalRetailValuation - totalCostValuation).toFixed(2))
      },
      categories: categorySummary
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Purchases report
// @route   GET /api/reports/purchases
// @access  Private
const getPurchasesReport = async (req, res, next) => {
  try {
    const { startDate, endDate, format } = req.query;

    const matchQuery = {};
    if (startDate || endDate) {
      matchQuery.purchaseDate = {};
      if (startDate) matchQuery.purchaseDate.$gte = new Date(startDate);
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        matchQuery.purchaseDate.$lte = e;
      }
    }

    const purchasesBySupplier = await Purchase.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$supplier',
          totalSpent: { $sum: '$totalAmount' },
          totalPaid: { $sum: '$amountPaid' },
          totalBalanceDue: { $sum: '$balanceDue' },
          purchaseCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'suppliers',
          localField: '_id',
          foreignField: '_id',
          as: 'supplierDoc'
        }
      },
      { $unwind: '$supplierDoc' },
      {
        $project: {
          supplierId: '$_id',
          supplierName: '$supplierDoc.name',
          company: '$supplierDoc.company',
          totalSpent: 1,
          totalPaid: 1,
          totalBalanceDue: 1,
          purchaseCount: 1
        }
      },
      { $sort: { totalSpent: -1 } }
    ]);

    if (format === 'csv') {
      let csv = 'Supplier,Company,Purchase Invoices,Total Spent (INR),Amount Paid (INR),Balance Due (INR)\n';
      purchasesBySupplier.forEach((p) => {
        csv += `"${p.supplierName}","${p.company}",${p.purchaseCount},${p.totalSpent.toFixed(2)},${p.totalPaid.toFixed(2)},${p.totalBalanceDue.toFixed(2)}\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=PurchasesReport.csv');
      return res.status(200).send(csv);
    }

    res.status(200).json({
      success: true,
      data: purchasesBySupplier
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Best-Selling products report
// @route   GET /api/reports/top-products
// @access  Private
const getTopProductsReport = async (req, res, next) => {
  try {
    const { limit = 10, startDate, endDate, format } = req.query;

    const matchQuery = { status: 'COMPLETED' };
    if (startDate || endDate) {
      matchQuery.saleDate = {};
      if (startDate) matchQuery.saleDate.$gte = new Date(startDate);
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        matchQuery.saleDate.$lte = e;
      }
    }

    const topProducts = await Sale.aggregate([
      { $match: matchQuery },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          productName: { $first: '$items.productName' },
          sku: { $first: '$items.sku' },
          unitsSold: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$items.lineTotal' },
          totalProfit: { $sum: '$items.profit' }
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: parseInt(limit, 10) || 10 }
    ]);

    if (format === 'csv') {
      let csv = 'Product Name,SKU,Units Sold,Total Revenue (INR),Gross Profit (INR)\n';
      topProducts.forEach((p) => {
        csv += `"${p.productName}",${p.sku},${p.unitsSold},${p.totalRevenue.toFixed(2)},${p.totalProfit.toFixed(2)}\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=TopProductsReport.csv');
      return res.status(200).send(csv);
    }

    res.status(200).json({
      success: true,
      data: topProducts
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSalesReport,
  getInventoryValuationReport,
  getPurchasesReport,
  getTopProductsReport
};

