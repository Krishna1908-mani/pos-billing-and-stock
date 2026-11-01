const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const {
  getPurchases,
  getPurchaseById,
  createPurchase
} = require('../controllers/purchaseController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

router.use(protect);

router.get('/', getPurchases);
router.get('/:id', getPurchaseById);

router.post(
  '/',
  validate([
    check('supplier', 'Supplier is required').notEmpty(),
    check('items', 'Purchase items are required and must be an array').isArray({ min: 1 })
  ]),
  createPurchase
);

module.exports = router;

