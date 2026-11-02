/**
 * StockWise / MFEF - Sale Controller (PostgreSQL)
 * Preserves exact API contract for /api/sales
 */

const saleRepository = require('../repositories/saleRepository');
const saleReturnRepository = require('../repositories/saleReturnRepository');
const { generateInvoicePDF } = require('../services/pdfService');

// @desc    Get all sales / invoices with filters and pagination
// @route   GET /api/sales
// @access  Private
const getSales = async (req, res, next) => {
  try {
    const {
      search = '',
      paymentMethod = '',
      startDate = '',
      endDate = '',
      page = 1,
      limit = 20
    } = req.query;

    const result = await saleRepository.getSales({
      search,
      paymentMethod,
      startDate,
      endDate,
      page,
      limit
    });

    res.status(200).json({
      success: true,
      data: result.sales,
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

// @desc    Get single sale by ID or Invoice Number
// @route   GET /api/sales/:id
// @access  Private
const getSaleById = async (req, res, next) => {
  try {
    const sale = await saleRepository.getSaleById(req.params.id);
    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    const returns = await saleReturnRepository.getReturnsBySaleId(sale.id);

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
      const existing = await saleRepository.findByIdempotencyKey(idempotencyKey);
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

    const sale = await saleRepository.createSaleTransaction({
      customerName,
      customerPhone,
      items,
      discount,
      taxRate,
      paymentMethod,
      amountPaid,
      idempotencyKey,
      userId: req.user ? req.user.id : null
    });

    res.status(201).json({
      success: true,
      message: 'Sale completed successfully',
      data: sale
    });
  } catch (error) {
    // If stock is insufficient or concurrent lock conflict
    if (error.message && (error.message.includes('Insufficient stock') || error.message.includes('not found') || error.message.includes('Amount paid'))) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
};

// @desc    Download PDF invoice
// @route   GET /api/sales/:id/pdf
// @access  Private
const downloadInvoice = async (req, res, next) => {
  try {
    const sale = await saleRepository.getSaleById(req.params.id);
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

    const saleReturnRecord = await saleReturnRepository.createSaleReturnTransaction({
      saleIdOrInvoice: req.params.id,
      returnItems,
      reason,
      refundMethod,
      userId: req.user ? req.user.id : null
    });

    res.status(200).json({
      success: true,
      message: 'Sale returned successfully and stock restored to inventory',
      data: saleReturnRecord
    });
  } catch (error) {
    if (error.message && (error.message.includes('not found') || error.message.includes('already been marked') || error.message.includes('No valid items'))) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
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
