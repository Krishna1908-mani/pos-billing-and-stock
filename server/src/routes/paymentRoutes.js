const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const {
  getSupplierDues,
  recordSupplierPayment,
  getPaymentHistory
} = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

router.use(protect);

router.get('/', getPaymentHistory);
router.get('/dues', getSupplierDues);
router.get('/history', getPaymentHistory);

router.post(
  '/',
  validate([
    check('supplier', 'Supplier is required').notEmpty(),
    check('amount', 'Payment amount must be greater than zero').isFloat({ min: 0.01 }),
    check('paymentMethod', 'Valid payment method is required').isIn([
      'CASH',
      'BANK_TRANSFER',
      'CHEQUE',
      'UPI',
      'CARD'
    ])
  ]),
  recordSupplierPayment
);

module.exports = router;

