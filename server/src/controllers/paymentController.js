const SupplierPayment = require('../models/SupplierPayment');
const Purchase = require('../models/Purchase');
const Supplier = require('../models/Supplier');

// @desc    Get all supplier dues, outstanding balances, and overdue invoices
// @route   GET /api/payments/dues
// @access  Private
const getSupplierDues = async (req, res, next) => {
  try {
    const suppliers = await Supplier.find({ isActive: true }).sort({ company: 1 });
    const supplierIds = suppliers.map((s) => s._id);

    // Aggregate purchases and payments for all active suppliers
    const [purchasesAgg, paymentsAgg, unpaidPurchases] = await Promise.all([
      Purchase.aggregate([
        { $match: { supplier: { $in: supplierIds } } },
        {
          $group: {
            _id: '$supplier',
            totalPurchased: { $sum: '$totalAmount' },
            totalPaidOnPurchases: { $sum: '$amountPaid' },
            totalBalanceDue: { $sum: '$balanceDue' }
          }
        }
      ]),
      SupplierPayment.aggregate([
        { $match: { supplier: { $in: supplierIds } } },
        {
          $group: {
            _id: '$supplier',
            totalPayments: { $sum: '$amount' }
          }
        }
      ]),
      Purchase.find({
        supplier: { $in: supplierIds },
        balanceDue: { $gt: 0 }
      })
        .populate('supplier', 'name company phone')
        .sort({ dueDate: 1, purchaseDate: 1 })
    ]);

    const purchaseMap = new Map();
    purchasesAgg.forEach((p) => purchaseMap.set(p._id.toString(), p));

    const paymentMap = new Map();
    paymentsAgg.forEach((pay) => paymentMap.set(pay._id.toString(), pay));

    const now = new Date();
    let totalOutstandingAll = 0;
    let totalOverdueAll = 0;

    const supplierPayables = suppliers.map((s) => {
      const pData = purchaseMap.get(s._id.toString()) || {
        totalPurchased: 0,
        totalPaidOnPurchases: 0,
        totalBalanceDue: 0
      };
      const payData = paymentMap.get(s._id.toString()) || { totalPayments: 0 };

      // Total Balance Due = Opening Balance + Total Purchases - Total Payments
      const calculatedBalance = Number(
        ((s.openingBalance || 0) + pData.totalPurchased - payData.totalPayments).toFixed(2)
      );
      const currentOutstanding = Math.max(calculatedBalance, 0);

      totalOutstandingAll += currentOutstanding;

      // Filter unpaid purchases for this supplier
      const myUnpaidPurchases = unpaidPurchases.filter(
        (up) => up.supplier._id.toString() === s._id.toString()
      );

      const overduePurchases = myUnpaidPurchases.filter(
        (up) => up.dueDate && new Date(up.dueDate) < now
      );
      const overdueAmount = overduePurchases.reduce((sum, p) => sum + p.balanceDue, 0);
      totalOverdueAll += overdueAmount;

      return {
        supplier: {
          _id: s._id,
          name: s.name,
          company: s.company,
          phone: s.phone,
          email: s.email,
          openingBalance: s.openingBalance
        },
        totalPurchased: Number(pData.totalPurchased.toFixed(2)),
        totalPayments: Number(payData.totalPayments.toFixed(2)),
        currentOutstanding,
        overdueAmount: Number(overdueAmount.toFixed(2)),
        unpaidInvoicesCount: myUnpaidPurchases.length,
        hasOverdue: overduePurchases.length > 0
      };
    });

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalOutstanding: Number(totalOutstandingAll.toFixed(2)),
          totalOverdue: Number(totalOverdueAll.toFixed(2)),
          suppliersWithDuesCount: supplierPayables.filter((sp) => sp.currentOutstanding > 0).length
        },
        payables: supplierPayables,
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

    const supplierDoc = await Supplier.findById(supplier);
    if (!supplierDoc) {
      return res.status(404).json({ success: false, message: 'Supplier not found' });
    }

    const payCount = await SupplierPayment.countDocuments();
    const paymentNumber = `PAY-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(payCount + 1).padStart(4, '0')}`;

    // If specific purchase is selected, update it directly
    if (purchase) {
      const purchaseDoc = await Purchase.findById(purchase);
      if (purchaseDoc) {
        const newPaid = Number((purchaseDoc.amountPaid + payAmount).toFixed(2));
        const newBalance = Number(Math.max(purchaseDoc.totalAmount - newPaid, 0).toFixed(2));
        const newStatus = newBalance <= 0 ? 'PAID' : 'PARTIAL';

        purchaseDoc.amountPaid = newPaid;
        purchaseDoc.balanceDue = newBalance;
        purchaseDoc.paymentStatus = newStatus;
        await purchaseDoc.save();
      }
    } else {
      // Allocate payment towards oldest unpaid purchases (FIFO order)
      let remaining = payAmount;
      const openPurchases = await Purchase.find({
        supplier: supplierDoc._id,
        balanceDue: { $gt: 0 }
      }).sort({ purchaseDate: 1 });

      for (const p of openPurchases) {
        if (remaining <= 0) break;
        const allocation = Math.min(remaining, p.balanceDue);
        p.amountPaid = Number((p.amountPaid + allocation).toFixed(2));
        p.balanceDue = Number((p.balanceDue - allocation).toFixed(2));
        p.paymentStatus = p.balanceDue <= 0 ? 'PAID' : 'PARTIAL';
        await p.save();
        remaining = Number((remaining - allocation).toFixed(2));
      }
    }

    const payment = await SupplierPayment.create({
      paymentNumber,
      supplier: supplierDoc._id,
      purchase: purchase || null,
      amount: payAmount,
      paymentDate: new Date(paymentDate),
      paymentMethod,
      referenceNumber: (referenceNumber || '').trim(),
      notes: (notes || '').trim(),
      recordedBy: req.user ? req.user.id : null
    });

    res.status(201).json({
      success: true,
      message: `Payment of ₹${payAmount.toFixed(2)} recorded successfully for ${supplierDoc.company}`,
      data: payment
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get payment history
// @route   GET /api/payments/history
// @access  Private
const getPaymentHistory = async (req, res, next) => {
  try {
    const { supplier = '', page = 1, limit = 20 } = req.query;

    const query = {};
    if (supplier) query.supplier = supplier;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const [payments, total] = await Promise.all([
      SupplierPayment.find(query)
        .populate('supplier', 'name company phone')
        .populate('purchase', 'purchaseNumber totalAmount balanceDue')
        .populate('recordedBy', 'name')
        .sort({ paymentDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      SupplierPayment.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: payments,
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

module.exports = {
  getSupplierDues,
  recordSupplierPayment,
  getPaymentHistory
};

