const Purchase = require('../models/Purchase');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const SupplierPayment = require('../models/SupplierPayment');
const { adjustStockAndLog } = require('../services/stockLedgerService');

// Helper to generate unique purchase number
const generatePurchaseNumber = async () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const count = await Purchase.countDocuments();
  const seq = String(count + 1).padStart(4, '0');
  const number = `PUR-${dateStr}-${seq}`;

  // Ensure uniqueness
  const exists = await Purchase.findOne({ purchaseNumber: number });
  if (exists) {
    return `PUR-${dateStr}-${seq}-${Date.now().toString().slice(-4)}`;
  }
  return number;
};

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

    const query = {};

    if (supplier && supplier !== 'ALL') {
      query.supplier = supplier;
    }

    if (paymentStatus && paymentStatus !== 'ALL') {
      query.paymentStatus = paymentStatus;
    }

    if (startDate || endDate) {
      query.purchaseDate = {};
      if (startDate) query.purchaseDate.$gte = new Date(startDate);
      if (endDate) {
        const eDate = new Date(endDate);
        eDate.setHours(23, 59, 59, 999);
        query.purchaseDate.$lte = eDate;
      }
    }

    if (search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ purchaseNumber: regex }, { supplierInvoiceNumber: regex }];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const [purchases, total] = await Promise.all([
      Purchase.find(query)
        .populate('supplier', 'name company phone')
        .populate('createdBy', 'name')
        .sort({ purchaseDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Purchase.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: purchases,
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

// @desc    Get single purchase by ID
// @route   GET /api/purchases/:id
// @access  Private
const getPurchaseById = async (req, res, next) => {
  try {
    const purchase = await Purchase.findById(req.params.id)
      .populate('supplier')
      .populate('items.product', 'name sku unit purchaseCost sellingPrice')
      .populate('createdBy', 'name');

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: 'Purchase record not found'
      });
    }

    // Get payments recorded specifically against this purchase
    const payments = await SupplierPayment.find({ purchase: purchase._id })
      .populate('recordedBy', 'name')
      .sort({ paymentDate: -1 });

    res.status(200).json({
      success: true,
      data: purchase,
      payments
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
      const existing = await Purchase.findOne({ idempotencyKey })
        .populate('supplier', 'name company')
        .populate('items.product', 'name sku');
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

    const supplierDoc = await Supplier.findById(supplier);
    if (!supplierDoc) {
      return res.status(400).json({ success: false, message: 'Supplier does not exist' });
    }

    // Authoritative calculation of items
    const processedItems = [];
    let subtotal = 0;

    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product || product.isDeleted) {
        return res.status(400).json({
          success: false,
          message: `Product with ID ${item.product} not found or is archived`
        });
      }

      const qty = Number(item.quantity);
      const unitCost = Number(item.unitCost);

      if (qty <= 0 || unitCost < 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid quantity or cost for product "${product.name}"`
        });
      }

      const lineTotal = Number((qty * unitCost).toFixed(2));
      subtotal += lineTotal;

      processedItems.push({
        product: product._id,
        productName: product.name,
        sku: product.sku,
        quantity: qty,
        unitCost,
        lineTotal
      });
    }

    subtotal = Number(subtotal.toFixed(2));
    const discNum = Math.max(Number(discount) || 0, 0);
    const taxNum = Math.max(Number(tax) || 0, 0);
    const totalAmount = Number((subtotal - discNum + taxNum).toFixed(2));

    const paidNum = Math.min(Math.max(Number(amountPaid) || 0, 0), totalAmount);
    const balanceDue = Number((totalAmount - paidNum).toFixed(2));

    let paymentStatus = 'UNPAID';
    if (paidNum >= totalAmount) {
      paymentStatus = 'PAID';
    } else if (paidNum > 0) {
      paymentStatus = 'PARTIAL';
    }

    const purchaseNumber = await generatePurchaseNumber();

    const purchase = await Purchase.create({
      purchaseNumber,
      supplier: supplierDoc._id,
      supplierInvoiceNumber: supplierInvoiceNumber.trim(),
      purchaseDate: new Date(purchaseDate),
      dueDate: dueDate ? new Date(dueDate) : null,
      items: processedItems,
      subtotal,
      discount: discNum,
      tax: taxNum,
      totalAmount,
      amountPaid: paidNum,
      balanceDue,
      paymentStatus,
      notes: notes.trim(),
      idempotencyKey: idempotencyKey || null,
      createdBy: req.user ? req.user.id : null
    });

    // Inward stock atomically for each line item and log movement with compensation rollback
    const inwardedItems = [];
    try {
      for (const item of processedItems) {
        await adjustStockAndLog({
          productId: item.product,
          quantityDelta: item.quantity,
          movementType: 'PURCHASE_INWARD',
          referenceType: 'PURCHASE',
          referenceId: purchase.purchaseNumber,
          notes: `Inward from Supplier ${supplierDoc.company} (Invoice #${purchase.purchaseNumber})`,
          userId: req.user ? req.user.id : null
        });
        inwardedItems.push(item);

        // Optionally update latest purchase cost on product
        await Product.findByIdAndUpdate(item.product, {
          purchaseCost: item.unitCost
        });
      }

      // If an initial payment was made during purchase, record the SupplierPayment
      if (paidNum > 0) {
        const paySeq = await SupplierPayment.countDocuments();
        const payNumber = `PAY-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(paySeq + 1).padStart(4, '0')}`;
        await SupplierPayment.create({
          paymentNumber: payNumber,
          supplier: supplierDoc._id,
          purchase: purchase._id,
          amount: paidNum,
          paymentDate: new Date(purchaseDate),
          paymentMethod: paymentMethod || 'BANK_TRANSFER',
          referenceNumber: `Initial payment for ${purchase.purchaseNumber}`,
          notes: `Paid on purchase creation`,
          recordedBy: req.user ? req.user.id : null
        });
      }
    } catch (inwardErr) {
      // Rollback inwarded items
      for (const item of inwardedItems) {
        try {
          await adjustStockAndLog({
            productId: item.product,
            quantityDelta: -item.quantity,
            movementType: 'ADJUSTMENT_SUB',
            referenceType: 'MANUAL_ADJUSTMENT',
            referenceId: purchase.purchaseNumber,
            notes: `Automatic compensation rollback for failed purchase inward ${purchase.purchaseNumber}`,
            userId: req.user ? req.user.id : null
          });
        } catch (rbErr) {
          console.error(`Rollback inward failed for item ${item.product}:`, rbErr);
        }
      }
      await Purchase.findByIdAndDelete(purchase._id);
      return res.status(500).json({
        success: false,
        message: inwardErr.message || 'Error occurred during stock inwarding. Rolled back changes.'
      });
    }

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

