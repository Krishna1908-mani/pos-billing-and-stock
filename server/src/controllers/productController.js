const productRepository = require('../repositories/productRepository');
const stockMovementRepository = require('../repositories/stockMovementRepository');

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

    const result = await productRepository.getProducts({
      search,
      category,
      stockStatus,
      supplier,
      page,
      limit,
      sortBy,
      sortOrder
    });

    res.status(200).json({
      success: true,
      data: result.products,
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

// @desc    Get single product by ID
// @route   GET /api/products/:id
// @access  Private
const getProductById = async (req, res, next) => {
  try {
    const product = await productRepository.getProductById(req.params.id);

    if (!product || product.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Fetch recent 10 stock movements for this product
    const movementsResult = await stockMovementRepository.getMovements({
      product: product.id,
      page: 1,
      limit: 10
    });

    res.status(200).json({
      success: true,
      data: product,
      recentMovements: movementsResult.movements
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

    const cleanSku = (sku || '').toUpperCase().trim();
    const existing = await productRepository.findProductBySku(cleanSku);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Product with SKU "${cleanSku}" already exists.`
      });
    }

    const product = await productRepository.createProduct({
      name,
      sku: cleanSku,
      category,
      description,
      supplier,
      purchaseCost,
      sellingPrice,
      mrp,
      stockQuantity,
      lowStockThreshold,
      unit,
      imageUrl
    });

    // If initial stock > 0, log opening stock movement
    if (product.stockQuantity > 0) {
      await stockMovementRepository.createMovement({
        productId: product.id,
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
    const product = await productRepository.getProductById(req.params.id);
    if (!product || product.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    if (req.body.sku) {
      const cleanSku = req.body.sku.toUpperCase().trim();
      if (cleanSku !== product.sku) {
        const existing = await productRepository.findProductBySku(cleanSku);
        if (existing && existing.id !== product.id) {
          return res.status(400).json({
            success: false,
            message: `Product with SKU "${cleanSku}" already exists.`
          });
        }
      }
    }

    const updated = await productRepository.updateProduct(req.params.id, req.body);

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: updated
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
    const result = await productRepository.deleteProduct(req.params.id);
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.status(200).json({
      success: true,
      message: result.message,
      softDeleted: result.softDeleted
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
    const categories = await productRepository.getCategories();
    res.status(200).json({
      success: true,
      data: categories
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
    const products = await productRepository.getLowStockProducts();
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
