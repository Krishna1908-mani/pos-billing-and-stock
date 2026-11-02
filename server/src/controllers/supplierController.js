/**
 * StockWise / MFEF - Supplier Controller (PostgreSQL)
 * Preserves exact API contract for /api/suppliers
 */

const supplierRepository = require('../repositories/supplierRepository');

// @desc    Get all suppliers with search and pagination
// @route   GET /api/suppliers
// @access  Private
const getSuppliers = async (req, res, next) => {
  try {
    const { search = '', page = 1, limit = 50, activeOnly = 'true' } = req.query;

    const result = await supplierRepository.getSuppliers({
      search,
      page,
      limit,
      activeOnly
    });

    res.status(200).json({
      success: true,
      data: result.suppliers,
      pagination: {
        page: result.page,
        limit: parseInt(limit, 10) || 50,
        total: result.total,
        pages: result.pages
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
    const supplier = await supplierRepository.getSupplierById(req.params.id);
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found'
      });
    }

    const statement = await supplierRepository.getSupplierStatement(supplier.id);

    res.status(200).json({
      success: true,
      data: supplier,
      purchases: statement.purchases,
      payments: statement.payments
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

    if (!name || !company || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Name, company and phone number are required.'
      });
    }

    const supplier = await supplierRepository.createSupplier({
      name,
      company,
      phone,
      email,
      address,
      notes,
      openingBalance
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
    const existing = await supplierRepository.getSupplierById(req.params.id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found'
      });
    }

    const supplier = await supplierRepository.updateSupplier(existing.id, req.body);

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
    const existing = await supplierRepository.getSupplierById(req.params.id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found'
      });
    }

    const result = await supplierRepository.deleteSupplier(existing.id);

    res.status(200).json({
      success: true,
      message: result.message
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
