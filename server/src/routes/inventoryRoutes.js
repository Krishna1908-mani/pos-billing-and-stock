const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const {
  getMovements,
  adjustStock,
  getStockAlerts
} = require('../controllers/inventoryController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

router.use(protect);

router.get('/movements', getMovements);
router.get('/alerts', getStockAlerts);

router.post(
  '/adjust',
  validate([
    check('productId', 'Product ID is required').notEmpty(),
    check('type', 'Adjustment type must be ADD or SUB').isIn(['ADD', 'SUB']),
    check('quantity', 'Quantity must be greater than zero').isFloat({ min: 0.01 }),
    check('reason', 'Adjustment reason is required').trim().notEmpty()
  ]),
  adjustStock
);

module.exports = router;

