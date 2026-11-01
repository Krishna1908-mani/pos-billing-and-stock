const express = require('express');
const router = express.Router();
const {
  getSalesReport,
  getInventoryValuationReport,
  getPurchasesReport,
  getTopProductsReport
} = require('../controllers/reportController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/sales', getSalesReport);
router.get('/inventory-valuation', getInventoryValuationReport);
router.get('/purchases', getPurchasesReport);
router.get('/top-products', getTopProductsReport);

module.exports = router;

