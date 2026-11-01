const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const {
  getSales,
  getSaleById,
  createSale,
  downloadInvoice,
  returnSale
} = require('../controllers/saleController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

router.use(protect);

router.get('/', getSales);
router.get('/:id', getSaleById);
router.get('/:id/pdf', downloadInvoice);

router.post(
  '/',
  validate([
    check('items', 'Cart items are required and must be an array').isArray({ min: 1 }),
    check('paymentMethod', 'Valid payment method required').isIn(['CASH', 'CARD', 'UPI', 'BANK_TRANSFER'])
  ]),
  createSale
);

router.post('/:id/return', returnSale);

module.exports = router;

