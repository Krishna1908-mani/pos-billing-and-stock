const Product = require('../models/Product');
const Sale = require('../models/Sale');

/**
 * Calculate Restock Intelligence Recommendations
 *
 * Mathematical Framework:
 * 1. Analysis Window: Configurable past N days (default: 30 days)
 * 2. Average Daily Sales (ADS): Total Units Sold in Window / Window Days
 * 3. Lead Time Demand (LTD): ADS * Supplier Lead Time (Days)
 * 4. Safety Stock (SS): ADS * Safety Stock Days (Buffer against demand spikes)
 * 5. Reorder Point (ROP): LTD + SS
 * 6. Days Until Stockout: Current Stock / ADS
 * 7. Recommended Order Qty: Math.max((ROP * 2) - Current Stock, Batch Size)
 *
 * Fallback Strategy:
 * When sales history has fewer than 3 events or total units < 5,
 * confidence is tagged 'LIMITED_DATA' and ROP falls back to Product.lowStockThreshold.
 */
const getRestockRecommendations = async ({
  windowDays = 30,
  leadTimeDays = 7,
  safetyStockDays = 3,
  category = null,
  supplierId = null
} = {}) => {
  const windowDaysNum = Math.max(Number(windowDays) || 30, 7);
  const leadTimeNum = Math.max(Number(leadTimeDays) || 7, 1);
  const safetyStockNum = Math.max(Number(safetyStockDays) || 3, 1);

  const windowStartDate = new Date();
  windowStartDate.setDate(windowStartDate.getDate() - windowDaysNum);

  // 1. Fetch products filter
  const productQuery = { isDeleted: false };
  if (category && category !== 'ALL') {
    productQuery.category = category;
  }
  if (supplierId) {
    productQuery.supplier = supplierId;
  }

  const products = await Product.find(productQuery).populate('supplier', 'name company phone');

  // 2. Aggregate sales in the window by product
  const salesAgg = await Sale.aggregate([
    {
      $match: {
        status: 'COMPLETED',
        saleDate: { $gte: windowStartDate }
      }
    },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        totalUnitsSold: { $sum: '$items.quantity' },
        salesCount: { $sum: 1 },
        totalRevenue: { $sum: '$items.lineTotal' }
      }
    }
  ]);

  const salesMap = new Map();
  salesAgg.forEach((s) => {
    salesMap.set(s._id.toString(), s);
  });

  // 3. Process recommendations for each product
  const recommendations = [];

  for (const product of products) {
    const saleData = salesMap.get(product._id.toString()) || {
      totalUnitsSold: 0,
      salesCount: 0,
      totalRevenue: 0
    };

    const totalSold = saleData.totalUnitsSold;
    const currentStock = product.stockQuantity;

    // ADS
    const averageDailySales = Number((totalSold / windowDaysNum).toFixed(2));

    // Data sufficiency / confidence
    let confidence = 'HIGH';
    let dataSufficiencyNote = 'Robust sales history available over analysis window.';

    if (totalSold === 0) {
      confidence = 'INSUFFICIENT_DATA';
      dataSufficiencyNote = 'No sales recorded in the window. Using static low-stock threshold.';
    } else if (totalSold < 5 || saleData.salesCount < 2) {
      confidence = 'LIMITED_DATA';
      dataSufficiencyNote = 'Sparse transaction history. Low-stock threshold given higher weight.';
    } else if (saleData.salesCount < 5) {
      confidence = 'MODERATE';
      dataSufficiencyNote = 'Moderate volume. Estimates are reasonably dependable.';
    }

    // Lead time demand & safety stock
    let leadTimeDemand = 0;
    let safetyStock = 0;
    let reorderPoint = product.lowStockThreshold;

    if (confidence === 'HIGH' || confidence === 'MODERATE') {
      leadTimeDemand = Number((averageDailySales * leadTimeNum).toFixed(1));
      safetyStock = Number((averageDailySales * safetyStockNum).toFixed(1));
      reorderPoint = Math.ceil(leadTimeDemand + safetyStock);
      // Ensure ROP is at least equal to product's configured lowStockThreshold
      reorderPoint = Math.max(reorderPoint, product.lowStockThreshold);
    } else if (confidence === 'LIMITED_DATA') {
      leadTimeDemand = Number((averageDailySales * leadTimeNum).toFixed(1));
      safetyStock = Number((averageDailySales * safetyStockNum).toFixed(1));
      reorderPoint = Math.max(Math.ceil(leadTimeDemand + safetyStock), product.lowStockThreshold);
    } else {
      // INSUFFICIENT_DATA
      reorderPoint = product.lowStockThreshold;
    }

    // Days until stockout
    let daysUntilStockout;
    if (currentStock === 0) {
      daysUntilStockout = 0;
    } else if (averageDailySales > 0) {
      daysUntilStockout = Number((currentStock / averageDailySales).toFixed(1));
    } else {
      daysUntilStockout = null; // No consumption rate
    }

    // Reorder recommendation condition
    const needsRestock = currentStock <= reorderPoint;

    // Recommended order quantity (fill to target cycle stock: 2 * ROP or minimum 10 units)
    let recommendedOrderQty = 0;
    if (needsRestock) {
      const targetStockLevel = Math.max(reorderPoint * 2, 10);
      recommendedOrderQty = Math.max(targetStockLevel - currentStock, 5);
    }

    // Urgency level
    let urgency = 'NORMAL';
    if (currentStock === 0) {
      urgency = 'CRITICAL';
    } else if (currentStock <= Math.floor(reorderPoint / 2)) {
      urgency = 'HIGH';
    } else if (needsRestock) {
      urgency = 'MEDIUM';
    }

    recommendations.push({
      product: {
        _id: product._id,
        name: product.name,
        sku: product.sku,
        category: product.category,
        unit: product.unit,
        purchaseCost: product.purchaseCost,
        sellingPrice: product.sellingPrice,
        lowStockThreshold: product.lowStockThreshold,
        supplier: product.supplier
      },
      currentStock,
      averageDailySales,
      totalUnitsSoldInWindow: totalSold,
      leadTimeDemand,
      safetyStock,
      reorderPoint,
      daysUntilStockout,
      needsRestock,
      recommendedOrderQty,
      estimatedRestockCost: Number((recommendedOrderQty * product.purchaseCost).toFixed(2)),
      urgency,
      confidence,
      dataSufficiencyNote
    });
  }

  // Sort: CRITICAL first, then HIGH, then MEDIUM, then others, sorted by daysUntilStockout ascending
  const urgencyWeight = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, NORMAL: 1 };
  recommendations.sort((a, b) => {
    if (urgencyWeight[b.urgency] !== urgencyWeight[a.urgency]) {
      return urgencyWeight[b.urgency] - urgencyWeight[a.urgency];
    }
    if (a.daysUntilStockout !== null && b.daysUntilStockout !== null) {
      return a.daysUntilStockout - b.daysUntilStockout;
    }
    return a.currentStock - b.currentStock;
  });

  return {
    meta: {
      windowDays: windowDaysNum,
      windowStartDate: windowStartDate.toISOString(),
      leadTimeDays: leadTimeNum,
      safetyStockDays: safetyStockNum,
      formulaExplanation: {
        ads: 'ADS = (Units Sold in Window) / Window Days',
        leadTimeDemand: 'LTD = ADS * Lead Time Days',
        safetyStock: 'SS = ADS * Safety Stock Days',
        reorderPoint: 'ROP = Max(LTD + SS, Low Stock Threshold)',
        daysUntilStockout: 'Days to Stockout = Current Stock / ADS'
      },
      totalProductsAnalyzed: products.length,
      productsNeedingRestock: recommendations.filter((r) => r.needsRestock).length
    },
    recommendations
  };
};

module.exports = {
  getRestockRecommendations
};
