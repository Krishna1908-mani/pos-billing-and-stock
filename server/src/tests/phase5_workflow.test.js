const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { Writable } = require('node:stream');

// Models
const User = require('../models/User');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const Purchase = require('../models/Purchase');
const Sale = require('../models/Sale');
const SupplierPayment = require('../models/SupplierPayment');
const StockMovement = require('../models/StockMovement');
const SaleReturn = require('../models/SaleReturn');

// Services
const { adjustStockAndLog } = require('../services/stockLedgerService');
const { getRestockRecommendations } = require('../services/restockService');
const { generateInvoicePDF } = require('../services/pdfService');

const TEST_DB = 'mongodb://127.0.0.1:27017/stockwise_phase5_test';

let testSupplier;
let testProduct;
let testPurchase;
let testSale;

test.before(async () => {
  await mongoose.connect(TEST_DB);
  await Promise.all([
    User.deleteMany({}),
    Product.deleteMany({}),
    Supplier.deleteMany({}),
    Purchase.deleteMany({}),
    Sale.deleteMany({}),
    SupplierPayment.deleteMany({}),
    StockMovement.deleteMany({}),
    SaleReturn.deleteMany({})
  ]);

  testSupplier = await Supplier.create({
    name: 'Apollo Garments Ltd',
    company: 'Apollo Garments',
    phone: '9876543210',
    email: 'apollo@garments.test',
    address: '42 Textile Road, Surat'
  });
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('Scenario 1: Product CRUD & Initial Stock Ledger', async () => {
  testProduct = await Product.create({
    name: 'Test Shirt',
    sku: 'TS001',
    category: 'Apparel',
    purchaseCost: 200,
    sellingPrice: 350,
    stockQuantity: 10,
    lowStockThreshold: 3,
    unit: 'pcs',
    supplier: testSupplier._id
  });

  // Log initial opening stock in ledger
  await StockMovement.create({
    product: testProduct._id,
    movementType: 'OPENING_STOCK',
    quantityChanged: 10,
    balanceAfter: 10,
    referenceType: 'INITIAL_IMPORT',
    referenceId: `INIT-${testProduct.sku}`,
    notes: 'Opening stock on product setup'
  });

  assert.equal(testProduct.sku, 'TS001');
  assert.equal(testProduct.stockQuantity, 10);
  assert.equal(testProduct.purchaseCost, 200);
  assert.equal(testProduct.sellingPrice, 350);

  const initialMovement = await StockMovement.findOne({ product: testProduct._id, movementType: 'OPENING_STOCK' });
  assert.ok(initialMovement, 'Initial opening stock ledger entry must exist');
  assert.equal(initialMovement.quantityChanged, 10);
  assert.equal(initialMovement.balanceAfter, 10);
});

test('Scenario 2: Purchase Inward (Stock Inward + Ledger)', async () => {
  const inwardQty = 5;
  const unitCost = 200;

  // Inward stock atomically
  await adjustStockAndLog({
    productId: testProduct._id,
    quantityDelta: inwardQty,
    movementType: 'PURCHASE_INWARD',
    referenceType: 'PURCHASE',
    referenceId: 'PO-20261101-0001',
    notes: `Inward from ${testSupplier.company}`
  });

  const updatedProduct = await Product.findById(testProduct._id);
  assert.equal(updatedProduct.stockQuantity, 15, 'Stock should increase from 10 to 15');

  testPurchase = await Purchase.create({
    purchaseNumber: 'PO-20261101-0001',
    supplier: testSupplier._id,
    supplierInvoiceNumber: 'INV-APOLLO-901',
    purchaseDate: new Date(),
    items: [
      {
        product: testProduct._id,
        productName: testProduct.name,
        sku: testProduct.sku,
        quantity: inwardQty,
        unitCost,
        lineTotal: inwardQty * unitCost
      }
    ],
    subtotal: 1000,
    totalAmount: 1000,
    amountPaid: 0,
    balanceDue: 1000,
    paymentStatus: 'UNPAID'
  });

  const movement = await StockMovement.findOne({
    product: testProduct._id,
    movementType: 'PURCHASE_INWARD'
  });
  assert.ok(movement, 'PURCHASE_INWARD ledger entry must exist');
  assert.equal(movement.quantityChanged, 5);
  assert.equal(movement.balanceAfter, 15);
});

test('Scenario 3: POS Checkout & Margin/Gross Profit Calculation', async () => {
  const sellQty = 2;
  const unitSellingPrice = 350;
  const unitPurchaseCost = testProduct.purchaseCost; // 200

  // Deduct stock atomically
  await adjustStockAndLog({
    productId: testProduct._id,
    quantityDelta: -sellQty,
    movementType: 'SALE_OUTWARD',
    referenceType: 'SALE',
    referenceId: 'INV-20261101-0001',
    notes: 'POS Checkout Sale'
  });

  const lineTotal = sellQty * unitSellingPrice; // 700
  const lineCost = sellQty * unitPurchaseCost;   // 400
  const lineProfit = lineTotal - lineCost;       // 300

  testSale = await Sale.create({
    invoiceNumber: 'INV-20261101-0001',
    customerName: 'Priya Sharma',
    customerPhone: '9876500000',
    items: [
      {
        product: testProduct._id,
        productName: testProduct.name,
        sku: testProduct.sku,
        quantity: sellQty,
        unitCostSnapshot: unitPurchaseCost,
        sellingPriceSnapshot: unitSellingPrice,
        lineTotal,
        profit: lineProfit
      }
    ],
    subtotal: lineTotal,
    discount: 0,
    taxRate: 0,
    taxAmount: 0,
    grandTotal: lineTotal,
    totalCost: lineCost,
    grossProfit: lineProfit,
    paymentMethod: 'CASH',
    amountPaid: lineTotal,
    changeDue: 0,
    status: 'COMPLETED',
    saleDate: new Date()
  });

  const afterSaleProduct = await Product.findById(testProduct._id);
  assert.equal(afterSaleProduct.stockQuantity, 13, 'Stock should decrease from 15 to 13');
  assert.equal(testSale.grossProfit, 300, 'Gross profit must be (2 * 350) - (2 * 200) = 300');

  const saleMovement = await StockMovement.findOne({
    product: testProduct._id,
    movementType: 'SALE_OUTWARD'
  });
  assert.ok(saleMovement, 'SALE_OUTWARD ledger entry must exist');
  assert.equal(saleMovement.quantityChanged, -2);
  assert.equal(saleMovement.balanceAfter, 13);
});

test('Scenario 4: Insufficient Stock Prevention & Atomicity', async () => {
  // Attempt to sell 100 units when only 13 are in stock
  await assert.rejects(
    async () => {
      await adjustStockAndLog({
        productId: testProduct._id,
        quantityDelta: -100,
        movementType: 'SALE_OUTWARD',
        referenceType: 'SALE',
        referenceId: 'INV-FAILED-001',
        notes: 'Excessive sale quantity'
      });
    },
    /Insufficient stock/,
    'Should throw Insufficient stock error'
  );

  const checkProduct = await Product.findById(testProduct._id);
  assert.equal(checkProduct.stockQuantity, 13, 'Stock must remain unaltered at 13 after failed transaction');
});

test('Scenario 5: Supplier Payment & Recalculated Balance', async () => {
  const payAmount = 600;

  // Record payment against testPurchase (Total 1000, Unpaid)
  const payment = await SupplierPayment.create({
    paymentNumber: 'PAY-20261101-0001',
    supplier: testSupplier._id,
    purchase: testPurchase._id,
    amount: payAmount,
    paymentDate: new Date(),
    paymentMethod: 'UPI',
    referenceNumber: 'UPI-TXN-998822'
  });

  // Update purchase balance
  const updatedPurchase = await Purchase.findById(testPurchase._id);
  const newPaid = Number(Math.min(updatedPurchase.amountPaid + payAmount, updatedPurchase.totalAmount).toFixed(2));
  const newBalance = Number(Math.max(updatedPurchase.totalAmount - newPaid, 0).toFixed(2));

  updatedPurchase.amountPaid = newPaid;
  updatedPurchase.balanceDue = newBalance;
  updatedPurchase.paymentStatus = newBalance <= 0 ? 'PAID' : 'PARTIAL';
  await updatedPurchase.save();

  assert.equal(updatedPurchase.amountPaid, 600);
  assert.equal(updatedPurchase.balanceDue, 400);
  assert.equal(updatedPurchase.paymentStatus, 'PARTIAL');
  assert.equal(payment.amount, 600);
});

test('Scenario 6: Low Stock Alert Detection', async () => {
  // Deduct 10 units to bring stock from 13 down to 3 (which equals lowStockThreshold 3)
  await adjustStockAndLog({
    productId: testProduct._id,
    quantityDelta: -10,
    movementType: 'SALE_OUTWARD',
    referenceType: 'SALE',
    referenceId: 'INV-20261101-0002',
    notes: 'Bulk sale reducing to threshold'
  });

  const lowStockProducts = await Product.find({
    isDeleted: false,
    $expr: {
      $and: [
        { $gt: ['$stockQuantity', 0] },
        { $lte: ['$stockQuantity', '$lowStockThreshold'] }
      ]
    }
  });

  assert.ok(lowStockProducts.length >= 1, 'Should find at least 1 low-stock product');
  const found = lowStockProducts.find((p) => p.sku === 'TS001');
  assert.ok(found, 'Test Shirt (TS001) must appear in low stock query');
  assert.equal(found.stockQuantity, 3);
  assert.equal(found.stockStatus, 'LOW_STOCK');
});

test('Scenario 7: Restock Prediction Engine Metrics', async () => {
  // Generate recommendations for TS001
  const result = await getRestockRecommendations({
    windowDays: 30,
    leadTimeDays: 7,
    safetyStockDays: 3
  });

  assert.ok(result && Array.isArray(result.recommendations), 'Should return recommendations array');
  const rec = result.recommendations.find((r) => r.product.sku === 'TS001');
  assert.ok(rec, 'Test Shirt must have a calculated restock recommendation');

  // Verify metric formulas exist and are numeric
  assert.ok(typeof rec.averageDailySales === 'number');
  assert.ok(typeof rec.leadTimeDemand === 'number');
  assert.ok(typeof rec.safetyStock === 'number');
  assert.ok(typeof rec.reorderPoint === 'number');
  assert.ok(typeof rec.needsRestock === 'boolean');
});

test('Scenario 8: Dashboard Aggregations from Live Database', async () => {
  // Query live aggregation metrics directly from DB
  const [productCount, inventoryAgg, todaySalesAgg] = await Promise.all([
    Product.countDocuments({ isDeleted: false }),
    Product.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: null,
          totalUnits: { $sum: '$stockQuantity' },
          stockValuation: { $sum: { $multiply: ['$stockQuantity', '$purchaseCost'] } }
        }
      }
    ]),
    Sale.aggregate([
      {
        $match: {
          status: 'COMPLETED'
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$grandTotal' },
          totalProfit: { $sum: '$grossProfit' }
        }
      }
    ])
  ]);

  assert.equal(productCount, 1, 'Active product count must be 1');
  assert.equal(inventoryAgg[0].totalUnits, 3, 'Total stock units should be 3');
  assert.equal(inventoryAgg[0].stockValuation, 3 * 200, 'Valuation at cost should be 600');
  assert.equal(todaySalesAgg[0].totalRevenue, 700, 'Sale revenue should be 700');
  assert.equal(todaySalesAgg[0].totalProfit, 300, 'Gross profit should be 300');
});

test('Scenario 9: PDF Invoice Generation Stream', async () => {
  // Mock Express response as a writable stream
  const chunks = [];
  const headers = {};

  const mockRes = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk);
      callback();
    }
  });

  mockRes.setHeader = (key, value) => {
    headers[key] = value;
  };

  const saleDoc = await Sale.findById(testSale._id);
  generateInvoicePDF(saleDoc, mockRes);

  await new Promise((resolve) => {
    mockRes.on('finish', resolve);
  });

  const pdfBuffer = Buffer.concat(chunks);
  assert.equal(headers['Content-Type'], 'application/pdf');
  assert.ok(headers['Content-Disposition'].includes('Invoice-INV-20261101-0001.pdf'));
  assert.ok(pdfBuffer.length > 500, 'PDF buffer must contain substantial bytes');
  // Check PDF magic header %PDF-
  const magic = pdfBuffer.slice(0, 5).toString('utf-8');
  assert.equal(magic, '%PDF-', 'Buffer should start with standard PDF magic bytes');
});

test('Scenario 10: Idempotency Protection & Soft-delete SKU Reuse', async () => {
  // 1. Test Idempotency key uniqueness on Sale
  const idempotencyKey = 'IDEMP-TEST-KEY-12345';
  const sale1 = await Sale.create({
    invoiceNumber: 'INV-IDEMP-001',
    customerName: 'Repeat Buyer',
    items: [],
    subtotal: 100,
    grandTotal: 100,
    totalCost: 50,
    grossProfit: 50,
    amountPaid: 100,
    paymentMethod: 'CASH',
    idempotencyKey
  });

  const duplicateCheck = await Sale.findOne({ idempotencyKey });
  assert.equal(duplicateCheck.invoiceNumber, sale1.invoiceNumber, 'Idempotent key must locate original sale');

  // 2. Test Soft-delete SKU reuse:
  // When TS001 is soft deleted, suffixing its SKU allows another TS001 to be created
  testProduct.isDeleted = true;
  testProduct.sku = `${testProduct.sku}_DELETED_${Date.now()}`;
  await testProduct.save();

  // Create a new product with the original SKU 'TS001'
  const reusedProduct = await Product.create({
    name: 'New Generation Shirt',
    sku: 'TS001',
    category: 'Apparel',
    purchaseCost: 220,
    sellingPrice: 400,
    stockQuantity: 20,
    lowStockThreshold: 5
  });

  assert.equal(reusedProduct.sku, 'TS001');
  assert.equal(reusedProduct.stockQuantity, 20);

  const activeTS001 = await Product.findOne({ sku: 'TS001', isDeleted: false });
  assert.equal(activeTS001.name, 'New Generation Shirt');
});

test('Scenario F: Stock Return & Financial Reversal (Audit Integrity)', async () => {
  const returnTestProd = await Product.create({
    name: 'Returnable Cotton Polo',
    sku: 'POLO-RET-01',
    category: 'Apparel',
    purchaseCost: 200,
    sellingPrice: 350,
    stockQuantity: 10,
    lowStockThreshold: 3
  });

  // Create a separate completed sale of 2 units @ 350
  const returnTestSale = await Sale.create({
    invoiceNumber: 'INV-RETURN-TEST-001',
    customerName: 'Return Tester',
    items: [
      {
        product: returnTestProd._id,
        productName: returnTestProd.name,
        sku: returnTestProd.sku,
        quantity: 2,
        unitCostSnapshot: 200,
        sellingPriceSnapshot: 350,
        lineTotal: 700,
        profit: 300
      }
    ],
    subtotal: 700,
    grandTotal: 700,
    totalCost: 400,
    grossProfit: 300,
    paymentMethod: 'CASH',
    amountPaid: 700,
    status: 'COMPLETED',
    saleDate: new Date()
  });

  // Simulate initial outward stock reduction
  await adjustStockAndLog({
    productId: returnTestProd._id,
    quantityDelta: -2,
    movementType: 'SALE_OUTWARD',
    referenceType: 'SALE',
    referenceId: returnTestSale.invoiceNumber,
    notes: 'Sold 2 units'
  });

  const stockBeforeReturn = (await Product.findById(returnTestProd._id)).stockQuantity;
  assert.equal(stockBeforeReturn, 8, 'Stock should be 8 after selling 2 from 10');

  // Process return: restore 1 unit
  await adjustStockAndLog({
    productId: returnTestProd._id,
    quantityDelta: 1,
    movementType: 'SALE_RETURN',
    referenceType: 'RETURN',
    referenceId: 'RET-20261102-0001',
    notes: 'Return 1 unit'
  });

  const saleReturn = await SaleReturn.create({
    returnNumber: 'RET-20261102-0001',
    sale: returnTestSale._id,
    invoiceNumber: returnTestSale.invoiceNumber,
    items: [
      {
        product: returnTestProd._id,
        productName: returnTestProd.name,
        sku: returnTestProd.sku,
        quantity: 1,
        refundAmount: 350,
        unitCostSnapshot: 200
      }
    ],
    refundTotal: 350,
    refundMethod: 'CASH',
    reason: 'Customer exchange request',
    returnDate: new Date()
  });

  returnTestSale.status = 'RETURNED';
  await returnTestSale.save();

  const stockAfterReturn = (await Product.findById(returnTestProd._id)).stockQuantity;
  assert.equal(stockAfterReturn, 9, 'Stock must increment by returned quantity (8 + 1 = 9)');
  assert.equal(returnTestSale.status, 'RETURNED');
  assert.equal(saleReturn.refundTotal, 350);

  const returnMovement = await StockMovement.findOne({ referenceId: 'RET-20261102-0001' });
  assert.ok(returnMovement, 'SALE_RETURN ledger movement must exist');
  assert.equal(returnMovement.movementType, 'SALE_RETURN');
  assert.equal(returnMovement.quantityChanged, 1);
});


