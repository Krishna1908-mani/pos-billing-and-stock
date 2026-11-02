/**
 * StockWise / MFEF - Payment Controller (PostgreSQL)
 * Preserves exact API contract for /api/payments
 */

const supplierPaymentRepository = require('../repositories/supplierPaymentRepository');

// @desc    Get all supplier dues, outstanding balances, and overdue invoices
// @route   GET /api/payments/dues
// @access  Private
const getSupplierDues = async (req, res, next) => {
  try {
    const result = await supplierPaymentRepository.getSupplierDues();

    const unpaidPurchases = [];
    result.payables.forEach((sp) => {
      if (sp.unpaidInvoices && Array.isArray(sp.unpaidInvoices)) {
        sp.unpaidInvoices.forEach((inv) => {
          unpaidPurchases.push({
            ...inv,
            supplier: sp.supplier
          });
        });
      }
    });

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalOutstanding: result.totalOutstandingAll,
          totalOverdue: result.totalOverdueAll,
          suppliersWithDuesCount: result.payables.filter((sp) => sp.totalBalanceDue > 0).length
        },
        payables: result.payables,
        unpaidPurchases
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Record a payment to a supplier
// @route   POST /api/payments
// @access  Private
const recordSupplierPayment = async (req, res, next) => {
  try {
    const {
      supplier,
      purchase = null,
      amount,
      paymentDate = new Date(),
      paymentMethod = 'BANK_TRANSFER',
      referenceNumber = '',
      notes = ''
    } = req.body;

    if (!supplier) {
      return res.status(400).json({ success: false, message: 'Supplier is required' });
    }

    const payAmount = Number(amount);
    if (!payAmount || payAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Payment amount must be greater than zero'
      });
    }

    const payment = await supplierPaymentRepository.createPaymentTransaction({
      supplierId: supplier,
      purchaseId: purchase || null,
      amount: payAmount,
      paymentDate,
      paymentMethod,
      referenceNumber,
      notes,
      userId: req.user ? req.user.id : null
    });

    res.status(201).json({
      success: true,
      message: `Payment of ₹${payAmount.toFixed(2)} recorded successfully`,
      data: payment
    });
  } catch (error) {
    if (error.message && (error.message.includes('not found') || error.message.includes('already fully paid') || error.message.includes('greater than zero'))) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

// @desc    Get payment history
// @route   GET /api/payments/history
// @access  Private
const getPaymentHistory = async (req, res, next) => {
  try {
    const { supplier = '', page = 1, limit = 20 } = req.query;

    const result = await supplierPaymentRepository.getPayments({
      supplier,
      page,
      limit
    });

    res.status(200).json({
      success: true,
      data: result.payments,
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

module.exports = {
  getSupplierDues,
  recordSupplierPayment,
  getPaymentHistory
};
