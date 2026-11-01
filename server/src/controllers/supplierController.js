const Supplier = require('../models/Supplier');
const Purchase = require('../models/Purchase');
const SupplierPayment = require('../models/SupplierPayment');

// @desc    Get all suppliers with search and pagination
// @route   GET /api/suppliers
// @access  Private
const getSuppliers = async (req, res, next) => {
  try {
    const { search = '', page = 1, limit = 50, activeOnly = 'true' } = req.query;

    const query = {};
    if (activeOnly === 'true') {
      query.isActive = true;
    }

    if (search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ name: regex }, { company: regex }, { phone: regex }, { email: regex }];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const [suppliers, total] = await Promise.all([
      Supplier.find(query).sort({ company: 1, name: 1 }).skip(skip).limit(limitNum),
      Supplier.countDocuments(query)
    ]);

    // Calculate current payable balances for each supplier dynamically
    const supplierIds = suppliers.map((s) => s._id);

    const [purchasesAgg, paymentsAgg] = await Promise.all([
      Purchase.aggregate([
        { $match: { supplier: { $in: supplierIds } } },
        {
          $group: {
            _id: '$supplier',
            totalPurchases: { $sum: '$totalAmount' },
            purchaseCount: { $sum: 1 }
          }
        }
      ]),
      SupplierPayment.aggregate([
        { $match: { supplier: { $in: supplierIds } } },
        {
          $group: {
            _id: '$supplier',
            totalPayments: { $sum: '$amount' },
            paymentCount: { $sum: 1 }
          }
        }
      ])
    ]);

    const purchaseMap = new Map();
    purchasesAgg.forEach((p) => purchaseMap.set(p._id.toString(), p));

    const paymentMap = new Map();
    paymentsAgg.forEach((pay) => paymentMap.set(pay._id.toString(), pay));

    const enrichedSuppliers = suppliers.map((s) => {
      const pData = purchaseMap.get(s._id.toString()) || { totalPurchases: 0, purchaseCount: 0 };
      const payData = paymentMap.get(s._id.toString()) || { totalPayments: 0, paymentCount: 0 };

      // Current balance = Opening Balance + Total Purchases - Total Payments
      const currentBalance = Number(
        ((s.openingBalance || 0) + pData.totalPurchases - payData.totalPayments).toFixed(2)
      );

      return {
        ...s.toObject(),
        totalPurchases: Number(pData.totalPurchases.toFixed(2)),
        purchaseCount: pData.purchaseCount,
        totalPayments: Number(payData.totalPayments.toFixed(2)),
        paymentCount: payData.paymentCount,
        currentBalance: Math.max(currentBalance, 0)
      };
    });

    res.status(200).json({
      success: true,
      data: enrichedSuppliers,
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

// @desc    Get single supplier details with statement and history
// @route   GET /api/suppliers/:id
// @access  Private
const getSupplierById = async (req, res, next) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found'
      });
    }

    const [purchases, payments] = await Promise.all([
      Purchase.find({ supplier: supplier._id }).sort({ purchaseDate: -1 }).limit(20),
      SupplierPayment.find({ supplier: supplier._id })
        .sort({ paymentDate: -1 })
        .limit(20)
        .populate('recordedBy', 'name')
    ]);

    const totalPurchases = purchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
    const totalPayments = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const currentBalance = Number(
      ((supplier.openingBalance || 0) + totalPurchases - totalPayments).toFixed(2)
    );

    res.status(200).json({
      success: true,
      data: {
        ...supplier.toObject(),
        totalPurchases: Number(totalPurchases.toFixed(2)),
        totalPayments: Number(totalPayments.toFixed(2)),
        currentBalance: Math.max(currentBalance, 0)
      },
      purchases,
      payments
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new supplier
// @route   POST /api/suppliers
// @access  Private
const createSupplier = async (req, res, next) => {
  try {
    const { name, company, phone, email, address, notes, openingBalance = 0 } = req.body;

    const supplier = await Supplier.create({
      name: name.trim(),
      company: company.trim(),
      phone: phone.trim(),
      email: email ? email.toLowerCase().trim() : '',
      address: (address || '').trim(),
      notes: (notes || '').trim(),
      openingBalance: Number(openingBalance) || 0
    });

    res.status(201).json({
      success: true,
      message: 'Supplier created successfully',
      data: supplier
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update supplier
// @route   PUT /api/suppliers/:id
// @access  Private
const updateSupplier = async (req, res, next) => {
  try {
    const { name, company, phone, email, address, notes, openingBalance, isActive } = req.body;

    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found'
      });
    }

    if (name) supplier.name = name.trim();
    if (company) supplier.company = company.trim();
    if (phone) supplier.phone = phone.trim();
    if (email !== undefined) supplier.email = email.toLowerCase().trim();
    if (address !== undefined) supplier.address = address.trim();
    if (notes !== undefined) supplier.notes = notes.trim();
    if (openingBalance !== undefined) supplier.openingBalance = Number(openingBalance);
    if (isActive !== undefined) supplier.isActive = Boolean(isActive);

    await supplier.save();

    res.status(200).json({
      success: true,
      message: 'Supplier updated successfully',
      data: supplier
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete supplier
// @route   DELETE /api/suppliers/:id
// @access  Private (Admin only)
const deleteSupplier = async (req, res, next) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found'
      });
    }

    // Check if supplier has purchases
    const purchaseCount = await Purchase.countDocuments({ supplier: supplier._id });
    if (purchaseCount > 0) {
      // Soft deactivate
      supplier.isActive = false;
      await supplier.save();
      return res.status(200).json({
        success: true,
        message: 'Supplier has associated purchase records. Deactivated instead of deleted.'
      });
    }

    await Supplier.findByIdAndDelete(supplier._id);

    res.status(200).json({
      success: true,
      message: 'Supplier deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier
};

