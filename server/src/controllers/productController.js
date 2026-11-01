const Product = require('../models/Product');
const Purchase = require('../models/Purchase');
const Sale = require('../models/Sale');
const StockMovement = require('../models/StockMovement');

// @desc    Get all products with filters, search, pagination, and sorting
// @route   GET /api/products
// @access  Private
const getProducts = async (req, res, next) => {
  try {
    const {
      search = '',
      category = '',
      stockStatus = '',
      supplier = '',
      page = 1,
      limit = 20,
      sortBy = 'name',
      sortOrder = 'asc'
    } = req.query;

    const query = { isDeleted: false };

    // Search by name or SKU
    if (search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [{ name: searchRegex }, { sku: searchRegex }, { description: searchRegex }];
    }

    // Category filter
    if (category && category !== 'ALL') {
      query.category = category;
    }

    // Supplier filter
    if (supplier && supplier !== 'ALL') {
      query.supplier = supplier;
    }

    // Stock Status filter
    if (stockStatus === 'OUT_OF_STOCK') {
      query.stockQuantity = { $lte: 0 };
    } else if (stockStatus === 'LOW_STOCK') {
      // Products where stockQuantity <= lowStockThreshold and > 0
      query.$expr = {
        $and: [
          { $gt: ['$stockQuantity', 0] },
          { $lte: ['$stockQuantity', '$lowStockThreshold'] }
        ]
      };
    } else if (stockStatus === 'IN_STOCK') {
      query.$expr = {
        $gt: ['$stockQuantity', '$lowStockThreshold']
      };
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    // Sort configuration
    const sortFieldMap = {
      name: 'name',
      sku: 'sku',
      purchaseCost: 'purchaseCost',
      sellingPrice: 'sellingPrice',
      stockQuantity: 'stockQuantity',
      createdAt: 'createdAt'
    };
    const sortField = sortFieldMap[sortBy] || 'name';
    const sortDirection = sortOrder === 'desc' ? -1 : 1;

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate('supplier', 'name company phone')
        .sort({ [sortField]: sortDirection })
        .skip(skip)
        .limit(limitNum),
      Product.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: products,
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

// @desc    Get single product by ID
// @route   GET /api/products/:id
// @access  Private
const getProductById = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id).populate('supplier');

    if (!product || product.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Fetch recent 10 stock movements for this product
    const recentMovements = await StockMovement.find({ product: product._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('performedBy', 'name');

    res.status(200).json({
      success: true,
      data: product,
      recentMovements
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new product
// @route   POST /api/products
// @access  Private
const createProduct = async (req, res, next) => {
  try {
    const {
      name,
      sku,
      category,
      description,
      supplier,
      purchaseCost,
      sellingPrice,
      mrp,
      stockQuantity = 0,
      lowStockThreshold = 10,
      unit = 'pcs',
      imageUrl = ''
    } = req.body;

    // Check SKU duplicate
    const cleanSku = (sku || '').toUpperCase().trim();
    const existing = await Product.findOne({ sku: cleanSku, isDeleted: false });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Product with SKU "${cleanSku}" already exists.`
      });
    }

    const product = await Product.create({
      name: name.trim(),
      sku: cleanSku,
      category: category.trim(),
      description: (description || '').trim(),
      supplier: supplier || null,
      purchaseCost: Number(purchaseCost),
      sellingPrice: Number(sellingPrice),
      mrp: mrp ? Number(mrp) : null,
      stockQuantity: Number(stockQuantity),
      lowStockThreshold: Number(lowStockThreshold),
      unit: (unit || 'pcs').trim(),
      imageUrl: (imageUrl || '').trim()
    });

    // If initial stock is greater than 0, create OPENING_STOCK movement ledger entry
    if (product.stockQuantity > 0) {
      await StockMovement.create({
        product: product._id,
        movementType: 'OPENING_STOCK',
        quantityChanged: product.stockQuantity,
        balanceAfter: product.stockQuantity,
        referenceType: 'INITIAL_IMPORT',
        referenceId: `INIT-${product.sku}`,
        notes: 'Initial opening stock registered during product creation',
        performedBy: req.user ? req.user.id : null
      });
    }

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private
const updateProduct = async (req, res, next) => {
  try {
    const {
      name,
      sku,
      category,
      description,
      supplier,
      purchaseCost,
      sellingPrice,
      mrp,
      lowStockThreshold,
      unit,
      imageUrl
    } = req.body;

    const product = await Product.findById(req.params.id);
    if (!product || product.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check duplicate SKU if changed
    if (sku) {
      const cleanSku = sku.toUpperCase().trim();
      if (cleanSku !== product.sku) {
        const existing = await Product.findOne({ sku: cleanSku, _id: { $ne: product._id }, isDeleted: false });
        if (existing) {
          return res.status(400).json({
            success: false,
            message: `Product with SKU "${cleanSku}" already exists.`
          });
        }
        product.sku = cleanSku;
      }
    }

    if (name) product.name = name.trim();
    if (category) product.category = category.trim();
    if (description !== undefined) product.description = description.trim();
    if (supplier !== undefined) product.supplier = supplier || null;
    if (purchaseCost !== undefined) product.purchaseCost = Number(purchaseCost);
    if (sellingPrice !== undefined) product.sellingPrice = Number(sellingPrice);
    if (mrp !== undefined) product.mrp = mrp ? Number(mrp) : null;
    if (lowStockThreshold !== undefined) product.lowStockThreshold = Number(lowStockThreshold);
    if (unit) product.unit = unit.trim();
    if (imageUrl !== undefined) product.imageUrl = imageUrl.trim();

    await product.save();

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: product
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete product (soft delete if transactions exist, else delete)
// @route   DELETE /api/products/:id
// @access  Private (Admin only)
const deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product || product.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if sales or purchases reference this product
    const [salesCount, purchaseCount] = await Promise.all([
      Sale.countDocuments({ 'items.product': product._id }),
      Purchase.countDocuments({ 'items.product': product._id })
    ]);

    if (salesCount > 0 || purchaseCount > 0) {
      // Historical transactions exist: soft delete to protect historical ledger
      product.isDeleted = true;
      product.sku = `${product.sku}_DELETED_${Date.now()}`;
      await product.save();
      return res.status(200).json({
        success: true,
        message: 'Product has historical transactions. Soft deleted to maintain audit integrity.',
        softDeleted: true
      });
    }

    // If completely new and unused, remove permanently
    await Product.findByIdAndDelete(product._id);
    await StockMovement.deleteMany({ product: product._id });

    res.status(200).json({
      success: true,
      message: 'Product deleted permanently',
      softDeleted: false
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all distinct product categories
// @route   GET /api/products/categories
// @access  Private
const getCategories = async (req, res, next) => {
  try {
    const categories = await Product.distinct('category', { isDeleted: false });
    res.status(200).json({
      success: true,
      data: categories.filter(Boolean).sort()
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get low stock and out of stock products
// @route   GET /api/products/low-stock
// @access  Private
const getLowStockProducts = async (req, res, next) => {
  try {
    const products = await Product.find({
      isDeleted: false,
      $expr: {
        $lte: ['$stockQuantity', '$lowStockThreshold']
      }
    })
      .populate('supplier', 'name company phone')
      .sort({ stockQuantity: 1 });

    res.status(200).json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProducts,
  getProductById,
  getLowStockProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getCategories
};
