/**
 * StockWise / MFEF - Restock Intelligence Service (PostgreSQL)
 * Mathematical Framework for Inventory Replenishment & Stockout Prevention
 */

const { getRestockSalesAnalytics } = require('../repositories/restockRepository');

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

  const { products, salesMap } = await getRestockSalesAnalytics({
    windowStartDate,
    category,
    supplierId
  });

  const recommendations = [];

  for (const product of products) {
    const saleData = salesMap.get(product.id) || {
      totalUnitsSold: 0,
      salesCount: 0,
      totalRevenue: 0
    };

    const totalSold = saleData.totalUnitsSold;
    const currentStock = parseInt(product.stock_quantity, 10);
    const purchaseCost = parseFloat(product.purchase_cost);
    const lowStockThreshold = parseInt(product.low_stock_threshold, 10);

    // Average Daily Sales (ADS)
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
    let reorderPoint = lowStockThreshold;

    if (confidence === 'HIGH' || confidence === 'MODERATE') {
      leadTimeDemand = Number((averageDailySales * leadTimeNum).toFixed(1));
      safetyStock = Number((averageDailySales * safetyStockNum).toFixed(1));
      reorderPoint = Math.ceil(leadTimeDemand + safetyStock);
      reorderPoint = Math.max(reorderPoint, lowStockThreshold);
    } else if (confidence === 'LIMITED_DATA') {
      leadTimeDemand = Number((averageDailySales * leadTimeNum).toFixed(1));
      safetyStock = Number((averageDailySales * safetyStockNum).toFixed(1));
      reorderPoint = Math.max(Math.ceil(leadTimeDemand + safetyStock), lowStockThreshold);
    } else {
      reorderPoint = lowStockThreshold;
    }

    // Days until stockout
    let daysUntilStockout;
    if (currentStock === 0) {
      daysUntilStockout = 0;
    } else if (averageDailySales > 0) {
      daysUntilStockout = Number((currentStock / averageDailySales).toFixed(1));
    } else {
      daysUntilStockout = null;
    }

    const needsRestock = currentStock <= reorderPoint;

    let recommendedOrderQty = 0;
    if (needsRestock) {
      const targetStockLevel = Math.max(reorderPoint * 2, 10);
      recommendedOrderQty = Math.max(targetStockLevel - currentStock, 5);
    }

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
        _id: product.id,
        id: product.id,
        name: product.name,
        sku: product.sku,
        category: product.category,
        unit: product.unit,
        purchaseCost,
        sellingPrice: parseFloat(product.selling_price),
        lowStockThreshold,
        supplier: product.supplier_id ? {
          _id: product.supplier_id,
          id: product.supplier_id,
          name: product.supplier_name,
          company: product.supplier_company,
          phone: product.supplier_phone
        } : null
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
      estimatedRestockCost: Number((recommendedOrderQty * purchaseCost).toFixed(2)),
      urgency,
      confidence,
      dataSufficiencyNote
    });
  }

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
