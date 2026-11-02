/**
 * StockWise / MFEF - Purchase Controller (PostgreSQL)
 * Preserves exact API contract for /api/purchases
 */

const purchaseRepository = require('../repositories/purchaseRepository');
const supplierRepository = require('../repositories/supplierRepository');

// @desc    Get all purchases with filters and pagination
// @route   GET /api/purchases
// @access  Private
const getPurchases = async (req, res, next) => {
  try {
    const {
      supplier = '',
      paymentStatus = '',
      startDate = '',
      endDate = '',
      search = '',
      page = 1,
      limit = 20
    } = req.query;

    const result = await purchaseRepository.getPurchases({
      supplier,
      paymentStatus,
      startDate,
      endDate,
      search,
      page,
      limit
    });

    res.status(200).json({
      success: true,
      data: result.purchases,
      pagination: {
        page: result.page,
        limit: parseInt(limit, 10) || 20,
        total: result.total,
        pages: result.pages
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single purchase by ID
// @route   GET /api/purchases/:id
// @access  Private
const getPurchaseById = async (req, res, next) => {
  try {
    const purchase = await purchaseRepository.getPurchaseById(req.params.id);
    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: 'Purchase record not found'
      });
    }

    res.status(200).json({
      success: true,
      data: purchase,
      payments: purchase.payments || []
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new purchase and inward stock
// @route   POST /api/purchases
// @access  Private
const createPurchase = async (req, res, next) => {
  try {
    const {
      supplier,
      supplierInvoiceNumber = '',
      purchaseDate = new Date(),
      dueDate = null,
      items,
      discount = 0,
      tax = 0,
      amountPaid = 0,
      paymentMethod = 'BANK_TRANSFER',
      notes = '',
      idempotencyKey
    } = req.body;

    // Idempotency check to prevent duplicate inventory movements
    if (idempotencyKey) {
      const existing = await purchaseRepository.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        return res.status(200).json({
          success: true,
          message: 'Purchase already processed (idempotent response)',
          data: existing
        });
      }
    }

    if (!supplier) {
      return res.status(400).json({ success: false, message: 'Supplier is required' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one purchase item is required' });
    }

    const supplierDoc = await supplierRepository.getSupplierById(supplier);
    if (!supplierDoc) {
      return res.status(400).json({ success: false, message: 'Supplier does not exist' });
    }

    const purchase = await purchaseRepository.createPurchaseTransaction({
      supplierId: supplierDoc.id,
      supplierInvoiceNumber,
      purchaseDate,
      dueDate,
      items,
      discount,
      tax,
      amountPaid,
      paymentMethod,
      notes,
      idempotencyKey,
      userId: req.user ? req.user.id : null
    });

    res.status(201).json({
      success: true,
      message: 'Purchase recorded and stock inwarded successfully',
      data: purchase
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPurchases,
  getPurchaseById,
  createPurchase
};
