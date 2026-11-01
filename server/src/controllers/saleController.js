const Sale = require('../models/Sale');
const Product = require('../models/Product');
const SaleReturn = require('../models/SaleReturn');
const { adjustStockAndLog } = require('../services/stockLedgerService');
const { generateInvoicePDF } = require('../services/pdfService');

// Helper to generate unique invoice number
const generateInvoiceNumber = async () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const count = await Sale.countDocuments();
  const seq = String(count + 1).padStart(4, '0');
  const number = `INV-${dateStr}-${seq}`;

  const exists = await Sale.findOne({ invoiceNumber: number });
  if (exists) {
    return `INV-${dateStr}-${seq}-${Date.now().toString().slice(-4)}`;
  }
  return number;
};

// @desc    Get all sales / invoices with filters and pagination
// @route   GET /api/sales
// @access  Private
const getSales = async (req, res, next) => {
  try {
    const {
      search = '',
      status = '',
      paymentMethod = '',
      startDate = '',
      endDate = '',
      page = 1,
      limit = 20
    } = req.query;

    const query = {};

    if (status && status !== 'ALL') {
      query.status = status;
    }

    if (paymentMethod && paymentMethod !== 'ALL') {
      query.paymentMethod = paymentMethod;
    }

    if (startDate || endDate) {
      query.saleDate = {};
      if (startDate) query.saleDate.$gte = new Date(startDate);
      if (endDate) {
        const eDate = new Date(endDate);
        eDate.setHours(23, 59, 59, 999);
        query.saleDate.$lte = eDate;
      }
    }

    if (search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ invoiceNumber: regex }, { customerName: regex }, { customerPhone: regex }];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const [sales, total] = await Promise.all([
      Sale.find(query)
        .populate('soldBy', 'name')
        .sort({ saleDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Sale.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: sales,
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

// @desc    Get single sale by ID or Invoice Number
// @route   GET /api/sales/:id
// @access  Private
const getSaleById = async (req, res, next) => {
  try {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(req.params.id);
    const query = isObjectId ? { _id: req.params.id } : { invoiceNumber: req.params.id.toUpperCase() };

    const sale = await Sale.findOne(query)
      .populate('items.product', 'name sku unit imageUrl')
      .populate('soldBy', 'name email');

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Check if there are returns on this invoice
    const returns = await SaleReturn.find({ sale: sale._id }).populate('processedBy', 'name');

    res.status(200).json({
      success: true,
      data: sale,
      returns
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new sale / POS checkout
// @route   POST /api/sales
// @access  Private
const createSale = async (req, res, next) => {
  try {
    const {
      customerName = 'Walk-in Customer',
      customerPhone = '',
      items,
      discount = 0,
      taxRate = 0,
      paymentMethod = 'CASH',
      amountPaid = 0,
      idempotencyKey
    } = req.body;

    // Idempotency check to prevent duplicate checkout and stock reduction
    if (idempotencyKey) {
      const existing = await Sale.findOne({ idempotencyKey });
      if (existing) {
        return res.status(200).json({
          success: true,
          message: 'Sale already processed (idempotent response)',
          data: existing
        });
      }
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart cannot be empty' });
    }

    // Pre-validate stock availability for all items first
    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product || product.isDeleted) {
        return res.status(400).json({
          success: false,
          message: `Product not found or has been removed from catalogue.`
        });
      }
      if (product.stockQuantity < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${product.name}". Available: ${product.stockQuantity}, In Cart: ${item.quantity}`
        });
      }
    }

    // Calculate authoritative totals and prepare line items snapshots
    let subtotal = 0;
    let totalCost = 0;
    const processedItems = [];

    for (const item of items) {
      const product = await Product.findById(item.product);
      const qty = Number(item.quantity);
      // Selling price: respect user entered discount price if provided, otherwise default to product.sellingPrice
      const sellingPrice = item.sellingPrice !== undefined ? Number(item.sellingPrice) : product.sellingPrice;
      const unitCost = product.purchaseCost;

      const lineTotal = Number((qty * sellingPrice).toFixed(2));
      const lineCost = Number((qty * unitCost).toFixed(2));
      const lineProfit = Number((lineTotal - lineCost).toFixed(2));

      subtotal += lineTotal;
      totalCost += lineCost;

      processedItems.push({
        product: product._id,
        productName: product.name,
        sku: product.sku,
        quantity: qty,
        unitCostSnapshot: unitCost,
        sellingPriceSnapshot: sellingPrice,
        lineTotal,
        profit: lineProfit
      });
    }

    subtotal = Number(subtotal.toFixed(2));
    totalCost = Number(totalCost.toFixed(2));

    const discNum = Math.max(Number(discount) || 0, 0);
    const taxRateNum = Math.max(Number(taxRate) || 0, 0);

    const discountedSubtotal = Math.max(subtotal - discNum, 0);
    const taxAmount = Number(((discountedSubtotal * taxRateNum) / 100).toFixed(2));
    const grandTotal = Number((discountedSubtotal + taxAmount).toFixed(2));

    const paidNum = Number(amountPaid);
    if (paidNum < grandTotal && paymentMethod !== 'BANK_TRANSFER') {
      return res.status(400).json({
        success: false,
        message: `Amount paid (₹${paidNum}) cannot be less than grand total (₹${grandTotal})`
      });
    }

    const changeDue = Number(Math.max(paidNum - grandTotal, 0).toFixed(2));
    const grossProfit = Number((grandTotal - totalCost).toFixed(2));

    const invoiceNumber = await generateInvoiceNumber();

    // Perform atomic stock reduction with rollback protection
    const deductedItems = [];
    try {
      for (const item of processedItems) {
        await adjustStockAndLog({
          productId: item.product,
          quantityDelta: -item.quantity,
          movementType: 'SALE_OUTWARD',
          referenceType: 'SALE',
          referenceId: invoiceNumber,
          notes: `POS Sale to ${customerName || 'Walk-in'} (Invoice #${invoiceNumber})`,
          userId: req.user ? req.user.id : null
        });
        deductedItems.push(item);
      }
    } catch (concurrencyErr) {
      // Rollback any items that were successfully deducted before failure
      for (const rolledBackItem of deductedItems) {
        await adjustStockAndLog({
          productId: rolledBackItem.product,
          quantityDelta: rolledBackItem.quantity,
          movementType: 'ADJUSTMENT_ADD',
          referenceType: 'MANUAL_ADJUSTMENT',
          referenceId: invoiceNumber,
          notes: `Automatic compensation rollback for failed sale ${invoiceNumber}`,
          userId: req.user ? req.user.id : null
        });
      }
      return res.status(409).json({
        success: false,
        message: concurrencyErr.message || 'Concurrent stock update detected. Please try checkout again.'
      });
    }

    const sale = await Sale.create({
      invoiceNumber,
      customerName: (customerName || 'Walk-in Customer').trim(),
      customerPhone: (customerPhone || '').trim(),
      items: processedItems,
      subtotal,
      discount: discNum,
      taxRate: taxRateNum,
      taxAmount,
      grandTotal,
      totalCost,
      grossProfit,
      paymentMethod,
      amountPaid: paidNum,
      changeDue,
      status: 'COMPLETED',
      idempotencyKey: idempotencyKey || null,
      soldBy: req.user ? req.user.id : null,
      saleDate: new Date()
    });

    res.status(201).json({
      success: true,
      message: 'Sale completed successfully',
      data: sale
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Download PDF invoice
// @route   GET /api/sales/:id/pdf
// @access  Private
const downloadInvoice = async (req, res, next) => {
  try {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(req.params.id);
    const query = isObjectId ? { _id: req.params.id } : { invoiceNumber: req.params.id.toUpperCase() };

    const sale = await Sale.findOne(query);
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    generateInvoicePDF(sale, res);
  } catch (error) {
    next(error);
  }
};

// @desc    Return or cancel a sale with stock restoration
// @route   POST /api/sales/:id/return
// @access  Private
const returnSale = async (req, res, next) => {
  try {
    const { reason = 'Customer return', refundMethod = 'CASH', returnItems } = req.body;

    const sale = await Sale.findById(req.params.id);
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sale not found' });
    }

    if (sale.status === 'CANCELLED' || sale.status === 'RETURNED') {
      return res.status(400).json({
        success: false,
        message: `Sale has already been marked as ${sale.status}`
      });
    }

    // Default to returning all items if returnItems is not provided
    const itemsToReturn = returnItems && returnItems.length > 0 ? returnItems : sale.items;

    const returnSeq = await SaleReturn.countDocuments();
    const returnNumber = `RET-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(returnSeq + 1).padStart(4, '0')}`;

    let refundTotal = 0;
    const processedReturnItems = [];

    for (const retItem of itemsToReturn) {
      // Find matching item in original sale
      const origItem = sale.items.find(
        (i) => i.product.toString() === retItem.product.toString() || i.sku === retItem.sku
      );
      if (!origItem) continue;

      const returnQty = Math.min(Number(retItem.quantity) || origItem.quantity, origItem.quantity);
      const lineRefund = Number((returnQty * origItem.sellingPriceSnapshot).toFixed(2));
      refundTotal += lineRefund;

      processedReturnItems.push({
        product: origItem.product,
        productName: origItem.productName,
        sku: origItem.sku,
        quantity: returnQty,
        refundAmount: lineRefund,
        unitCostSnapshot: origItem.unitCostSnapshot
      });

      // Restore stock atomically and log movement
      await adjustStockAndLog({
        productId: origItem.product,
        quantityDelta: returnQty,
        movementType: 'SALE_RETURN',
        referenceType: 'RETURN',
        referenceId: returnNumber,
        notes: `Customer return from invoice ${sale.invoiceNumber}: ${reason}`,
        userId: req.user ? req.user.id : null
      });
    }

    refundTotal = Number(refundTotal.toFixed(2));

    const saleReturnRecord = await SaleReturn.create({
      returnNumber,
      sale: sale._id,
      invoiceNumber: sale.invoiceNumber,
      items: processedReturnItems,
      refundTotal,
      refundMethod,
      reason: reason.trim(),
      processedBy: req.user ? req.user.id : null,
      returnDate: new Date()
    });

    // Mark sale status as RETURNED
    sale.status = 'RETURNED';
    await sale.save();

    res.status(200).json({
      success: true,
      message: 'Sale returned successfully and stock restored to inventory',
      data: saleReturnRecord
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSales,
  getSaleById,
  createSale,
  downloadInvoice,
  returnSale
};

