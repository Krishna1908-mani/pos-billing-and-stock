/**
 * StockWise / MFEF - Report Controller (PostgreSQL)
 * Preserves exact API contract for /api/reports
 */

const reportRepository = require('../repositories/reportRepository');

// @desc    Get Sales & Profit analytics report
// @route   GET /api/reports/sales
// @access  Private
const getSalesReport = async (req, res, next) => {
  try {
    const { startDate, endDate, format } = req.query;

    const result = await reportRepository.getSalesReport({ startDate, endDate });

    if (format === 'csv') {
      let csv = 'Date,Invoices,Units Sold,Revenue (INR),Cost (INR),Gross Profit (INR),Margin (%)\n';
      result.dailyBreakdown.forEach((row) => {
        const margin = row.totalSales > 0 ? ((row.grossProfit / row.totalSales) * 100).toFixed(2) : 0;
        csv += `${row.date},${row.invoiceCount},${row.unitsSold},${row.totalSales.toFixed(2)},${row.totalCost.toFixed(2)},${row.grossProfit.toFixed(2)},${margin}%\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=SalesReport.csv');
      return res.status(200).send(csv);
    }

    res.status(200).json({
      success: true,
      summary: result.overallSummary,
      dailyBreakdown: result.dailyBreakdown
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

    const result = await reportRepository.getInventoryValuationReport();

    const categories = result.categoryBreakdown.map(c => ({
      category: c.category,
      productCount: c.productCount,
      totalUnits: c.totalUnits,
      costValuation: c.categoryValuationAtCost,
      retailValuation: c.categoryValuationAtSelling,
      potentialProfit: Number((c.categoryValuationAtSelling - c.categoryValuationAtCost).toFixed(2))
    }));

    if (format === 'csv') {
      let csv = 'Category,Products Count,Units in Stock,Cost Valuation (INR),Retail Valuation (INR),Potential Profit (INR)\n';
      categories.forEach((c) => {
        csv += `"${c.category}",${c.productCount},${c.totalUnits},${c.costValuation.toFixed(2)},${c.retailValuation.toFixed(2)},${c.potentialProfit.toFixed(2)}\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=InventoryValuationReport.csv');
      return res.status(200).send(csv);
    }

    res.status(200).json({
      success: true,
      summary: {
        totalProducts: result.totals.totalProducts,
        totalUnits: result.totals.totalUnits,
        totalCostValuation: result.totals.totalValuationAtCost,
        totalRetailValuation: result.totals.totalValuationAtSelling,
        potentialGrossProfit: Number((result.totals.totalValuationAtSelling - result.totals.totalValuationAtCost).toFixed(2))
      },
      categories
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

    const data = await reportRepository.getPurchasesReport({ startDate, endDate });

    if (format === 'csv') {
      let csv = 'Supplier,Company,Purchase Invoices,Total Spent (INR),Amount Paid (INR),Balance Due (INR)\n';
      data.forEach((p) => {
        csv += `"${p.supplierName}","${p.company}",${p.purchaseCount},${p.totalSpent.toFixed(2)},${p.totalPaid.toFixed(2)},${p.totalBalanceDue.toFixed(2)}\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=PurchasesReport.csv');
      return res.status(200).send(csv);
    }

    res.status(200).json({
      success: true,
      data
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

    const data = await reportRepository.getTopProductsReport({ limit, startDate, endDate });

    if (format === 'csv') {
      let csv = 'Product Name,SKU,Units Sold,Total Revenue (INR),Gross Profit (INR)\n';
      data.forEach((p) => {
        csv += `"${p.productName}",${p.sku},${p.unitsSold},${p.totalRevenue.toFixed(2)},${p.totalProfit.toFixed(2)}\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=TopProductsReport.csv');
      return res.status(200).send(csv);
    }

    res.status(200).json({
      success: true,
      data
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
