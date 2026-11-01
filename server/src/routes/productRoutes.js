const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getCategories
} = require('../controllers/productController');
const { protect, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');

router.use(protect);

router.get('/categories', getCategories);
router.get('/', getProducts);
router.get('/:id', getProductById);

router.post(
  '/',
  validate([
    check('name', 'Product name is required').trim().notEmpty(),
    check('sku', 'Product SKU is required').trim().notEmpty(),
    check('category', 'Category is required').trim().notEmpty(),
    check('purchaseCost', 'Purchase cost must be a positive number').isFloat({ min: 0 }),
    check('sellingPrice', 'Selling price must be a positive number').isFloat({ min: 0 })
  ]),
  createProduct
);

router.put(
  '/:id',
  validate([
    check('name', 'Product name cannot be empty').optional().trim().notEmpty(),
    check('purchaseCost', 'Purchase cost must be non-negative').optional().isFloat({ min: 0 }),
    check('sellingPrice', 'Selling price must be non-negative').optional().isFloat({ min: 0 })
  ]),
  updateProduct
);

router.delete('/:id', requireRole('admin'), deleteProduct);

module.exports = router;

