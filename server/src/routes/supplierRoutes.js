const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier
} = require('../controllers/supplierController');
const { protect, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');

router.use(protect);

router.get('/', getSuppliers);
router.get('/:id', getSupplierById);

router.post(
  '/',
  validate([
    check('name', 'Contact name is required').trim().notEmpty(),
    check('company', 'Company name is required').trim().notEmpty(),
    check('phone', 'Phone number is required').trim().notEmpty()
  ]),
  createSupplier
);

router.put(
  '/:id',
  validate([
    check('name', 'Contact name cannot be empty').optional().trim().notEmpty(),
    check('company', 'Company name cannot be empty').optional().trim().notEmpty()
  ]),
  updateSupplier
);

router.delete('/:id', requireRole('admin'), deleteSupplier);

module.exports = router;

