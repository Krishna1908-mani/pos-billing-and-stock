const StockMovement = require('../models/StockMovement');
const Product = require('../models/Product');
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

    const query = {};

    if (product) {
      query.product = product;
    }

    if (movementType && movementType !== 'ALL') {
      query.movementType = movementType;
    }

    if (referenceType && referenceType !== 'ALL') {
      query.referenceType = referenceType;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const eDate = new Date(endDate);
        eDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = eDate;
      }
    }

    if (search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ referenceId: regex }, { notes: regex }];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 30;
    const skip = (pageNum - 1) * limitNum;

    const [movements, total] = await Promise.all([
      StockMovement.find(query)
        .populate('product', 'name sku unit purchaseCost')
        .populate('performedBy', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      StockMovement.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: movements,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1
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
    next(error);
  }
};

// @desc    Get low stock and out-of-stock items for alerts
// @route   GET /api/inventory/alerts
// @access  Private
const getStockAlerts = async (req, res, next) => {
  try {
    const products = await Product.find({
      isDeleted: false,
      $expr: { $lte: ['$stockQuantity', '$lowStockThreshold'] }
    })
      .populate('supplier', 'name company phone')
      .sort({ stockQuantity: 1 });

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

