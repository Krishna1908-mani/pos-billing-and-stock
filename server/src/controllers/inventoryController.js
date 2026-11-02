/**
 * StockWise / MFEF - Inventory Controller (PostgreSQL)
 * Preserves exact API contract for /api/inventory
 */

const stockMovementRepository = require('../repositories/stockMovementRepository');
const productRepository = require('../repositories/productRepository');
const { adjustStockAndLog } = require('../services/stockLedgerService');

// @desc    Get stock movement ledger with filters
// @route   GET /api/inventory/movements
// @access  Private
const getMovements = async (req, res, next) => {
  try {
    const {
      product = '',
      movementType = '',
      referenceType = '',
      startDate = '',
      endDate = '',
      search = '',
      page = 1,
      limit = 30
    } = req.query;

    const result = await stockMovementRepository.getMovements({
      product,
      movementType,
      referenceType,
      startDate,
      endDate,
      search,
      page,
      limit
    });

    res.status(200).json({
      success: true,
      data: result.movements,
      pagination: {
        page: result.page,
        limit: parseInt(limit, 10) || 30,
        total: result.total,
        pages: result.pages
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Manual stock adjustment (add / remove / damaged / audit correction)
// @route   POST /api/inventory/adjust
// @access  Private
const adjustStock = async (req, res, next) => {
  try {
    const { productId, type = 'ADD', quantity, reason = 'Inventory audit' } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, message: 'Product is required' });
    }

    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      return res.status(400).json({ success: false, message: 'Quantity must be a positive number' });
    }

    const isAddition = type === 'ADD';
    const movementType = isAddition ? 'ADJUSTMENT_ADD' : 'ADJUSTMENT_SUB';
    const quantityDelta = isAddition ? qty : -qty;

    const { product, movement } = await adjustStockAndLog({
      productId,
      quantityDelta,
      movementType,
      referenceType: 'MANUAL_ADJUSTMENT',
      referenceId: `ADJ-${Date.now().toString().slice(-6)}`,
      notes: reason.trim(),
      userId: req.user ? req.user.id : null
    });

    res.status(200).json({
      success: true,
      message: `Stock successfully adjusted for ${product.name}. New balance: ${product.stockQuantity} ${product.unit}`,
      data: {
        product,
        movement
      }
    });
  } catch (error) {
    if (error.message && (error.message.includes('not found') || error.message.includes('Insufficient stock'))) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

// @desc    Get low stock and out-of-stock items for alerts
// @route   GET /api/inventory/alerts
// @access  Private
const getStockAlerts = async (req, res, next) => {
  try {
    const products = await productRepository.getLowStockProducts();
    const outOfStock = products.filter((p) => p.stockQuantity <= 0);
    const lowStock = products.filter((p) => p.stockQuantity > 0 && p.stockQuantity <= p.lowStockThreshold);

    res.status(200).json({
      success: true,
      data: {
        totalAlerts: products.length,
        outOfStockCount: outOfStock.length,
        lowStockCount: lowStock.length,
        outOfStock,
        lowStock
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMovements,
  adjustStock,
  getStockAlerts
};
