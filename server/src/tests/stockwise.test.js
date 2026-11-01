const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// Models & Services
const User = require('../models/User');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const Purchase = require('../models/Purchase');
const Sale = require('../models/Sale');
const SupplierPayment = require('../models/SupplierPayment');
const { adjustStockAndLog } = require('../services/stockLedgerService');
const { getRestockRecommendations } = require('../services/restockService');

const TEST_DB = 'mongodb://127.0.0.1:27017/stockwise_test';

test.before(async () => {
  await mongoose.connect(TEST_DB);
  await Promise.all([
    User.deleteMany({}),
    Product.deleteMany({}),
    Supplier.deleteMany({}),
    Purchase.deleteMany({}),
    Sale.deleteMany({}),
    SupplierPayment.deleteMany({})
  ]);
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('1. Authentication: Password hashing & verification', async () => {
  const user = await User.create({
    name: 'Test Admin',
    email: 'admin.test@stockwise.local',
    password: 'SecurePassword123',
    role: 'admin'
  });

  assert.notEqual(user.password, 'SecurePassword123', 'Password should be hashed');
  const valid = await user.comparePassword('SecurePassword123');
  assert.equal(valid, true, 'Valid password should match hash');

  const invalid = await user.comparePassword('WrongPassword');
  assert.equal(invalid, false, 'Invalid password should be rejected');

  const jsonUser = user.toJSON();
  assert.equal(jsonUser.password, undefined, 'Password must not be leaked in serialized JSON');
});

test('2. Product Management: SKU uniqueness & margin virtual calculation', async () => {
  const product = await Product.create({
    name: 'Wireless Mouse',
    sku: 'TEST-WM-01',
    category: 'Electronics',
    purchaseCost: 200,
    sellingPrice: 500,
    stockQuantity: 50,
    lowStockThreshold: 10
  });

  assert.equal(product.marginPercentage, 60, 'Margin should be ((500-200)/500)*100 = 60%');
  assert.equal(product.stockStatus, 'IN_STOCK');
  assert.equal(product.stockValuation, 10000);

  // Duplicate SKU must fail
  await assert.rejects(
    async () => {
      await Product.create({
        name: 'Another Mouse',
        sku: 'TEST-WM-01',
        category: 'Electronics',
        purchaseCost: 150,
        sellingPrice: 400,
        stockQuantity: 10
      });
    },
    /duplicate key|E11000/i,
    'Duplicate SKU should be rejected by unique index'
  );
});

test('3. Inventory Control: Atomic stock deduction and negative stock prevention', async () => {
  const product = await Product.create({
    name: 'Mechanical Keyboard',
    sku: 'TEST-KB-02',
    category: 'Electronics',
    purchaseCost: 1200,
    sellingPrice: 2400,
    stockQuantity: 5,
    lowStockThreshold: 10
  });

  // Successful reduction
  const { product: updated, movement } = await adjustStockAndLog({
    productId: product._id,
    quantityDelta: -3,
    movementType: 'SALE_OUTWARD',
    referenceType: 'SALE',
    referenceId: 'TEST-INV-001',
    notes: 'Sale test reduction'
  });

  assert.equal(updated.stockQuantity, 2, 'Stock quantity should reduce from 5 to 2');
  assert.equal(movement.balanceAfter, 2);
  assert.equal(movement.quantityChanged, -3);

  // Reject reduction exceeding available stock (prevent negative stock)
  await assert.rejects(
    async () => {
      await adjustStockAndLog({
        productId: product._id,
        quantityDelta: -5, // Only 2 in stock!
        movementType: 'SALE_OUTWARD',
        referenceType: 'SALE',
        referenceId: 'TEST-INV-002',
        notes: 'Excessive sale'
      });
    },
    /Insufficient stock/i,
    'Sale exceeding available stock must be rejected'
  );

  // Verify stock was not corrupted
  const refreshed = await Product.findById(product._id);
  assert.equal(refreshed.stockQuantity, 2, 'Stock quantity should remain 2');
});

test('4. Purchase Stock Inward: Increases inventory exactly once', async () => {
  const product = await Product.create({
    name: 'USB-C Hub 7-in-1',
    sku: 'TEST-HUB-03',
    category: 'Electronics',
    purchaseCost: 800,
    sellingPrice: 1500,
    stockQuantity: 10,
    lowStockThreshold: 5
  });

  const { product: inwarded, movement } = await adjustStockAndLog({
    productId: product._id,
    quantityDelta: 20,
    movementType: 'PURCHASE_INWARD',
    referenceType: 'PURCHASE',
    referenceId: 'PUR-TEST-100',
    notes: 'Stock inward from supplier'
  });

  assert.equal(inwarded.stockQuantity, 30, 'Stock should increase from 10 to 30');
  assert.equal(movement.balanceAfter, 30);
});

test('5. Sales Profit Calculation: Snapshot and gross profit accuracy', async () => {
  const product = await Product.create({
    name: 'Ergonomic Desk Mat',
    sku: 'TEST-MAT-04',
    category: 'Stationery',
    purchaseCost: 300,
    sellingPrice: 700,
    stockQuantity: 25,
    lowStockThreshold: 5
  });

  const qty = 3;
  const sellingPrice = product.sellingPrice;
  const unitCost = product.purchaseCost;
  const lineTotal = qty * sellingPrice; // 2100
  const totalCost = qty * unitCost; // 900
  const expectedProfit = lineTotal - totalCost; // 1200

  const sale = await Sale.create({
    invoiceNumber: 'INV-TEST-PROFIT-01',
    customerName: 'Test Buyer',
    items: [
      {
        product: product._id,
        productName: product.name,
        sku: product.sku,
        quantity: qty,
        unitCostSnapshot: unitCost,
        sellingPriceSnapshot: sellingPrice,
        lineTotal,
        profit: expectedProfit
      }
    ],
    subtotal: lineTotal,
    discount: 100,
    taxRate: 10,
    taxAmount: 200,
    grandTotal: 2200, // 2100 - 100 + 200
    totalCost,
    grossProfit: 2200 - totalCost, // 1300
    paymentMethod: 'CASH',
    amountPaid: 2500,
    changeDue: 300,
    status: 'COMPLETED'
  });

  assert.equal(sale.items[0].profit, 1200, 'Item profit snapshot should be accurate');
  assert.equal(sale.grossProfit, 1300, 'Sale gross profit should equal grand total minus total cost');
  assert.equal(sale.changeDue, 300, 'Change due should be 2500 - 2200 = 300');
});

test('6. Supplier Partial Payment: Balance calculation & allocation', async () => {
  const supplier = await Supplier.create({
    name: 'Amit Patel',
    company: 'Gujarat Paper Mills',
    phone: '+91 98980 11223',
    openingBalance: 5000
  });

  const purchase = await Purchase.create({
    purchaseNumber: 'PUR-TEST-PAY-01',
    supplier: supplier._id,
    items: [
      {
        product: new mongoose.Types.ObjectId(),
        productName: 'A4 Paper Reams',
        sku: 'TEST-A4-01',
        quantity: 50,
        unitCost: 200,
        lineTotal: 10000
      }
    ],
    subtotal: 10000,
    totalAmount: 10000,
    amountPaid: 4000,
    balanceDue: 6000,
    paymentStatus: 'PARTIAL'
  });

  // Record initial payment of 4000
  await SupplierPayment.create({
    paymentNumber: 'PAY-TEST-001',
    supplier: supplier._id,
    purchase: purchase._id,
    amount: 4000,
    paymentMethod: 'BANK_TRANSFER'
  });

  // Calculate current supplier balance: Opening (5000) + Purchase (10000) - Payments (4000) = 11000
  const [purchasesAgg, paymentsAgg] = await Promise.all([
    Purchase.aggregate([
      { $match: { supplier: supplier._id } },
      { $group: { _id: '$supplier', total: { $sum: '$totalAmount' } } }
    ]),
    SupplierPayment.aggregate([
      { $match: { supplier: supplier._id } },
      { $group: { _id: '$supplier', total: { $sum: '$amount' } } }
    ])
  ]);

  const totalPurchased = purchasesAgg[0]?.total || 0;
  const totalPaid = paymentsAgg[0]?.total || 0;
  const currentPayable = supplier.openingBalance + totalPurchased - totalPaid;

  assert.equal(currentPayable, 11000, 'Supplier payable should be 5000 + 10000 - 4000 = 11000');

  // Second partial payment of 3000
  await SupplierPayment.create({
    paymentNumber: 'PAY-TEST-002',
    supplier: supplier._id,
    purchase: purchase._id,
    amount: 3000,
    paymentMethod: 'UPI'
  });

  // Update purchase balance
  purchase.amountPaid += 3000;
  purchase.balanceDue = purchase.totalAmount - purchase.amountPaid;
  purchase.paymentStatus = purchase.balanceDue <= 0 ? 'PAID' : 'PARTIAL';
  await purchase.save();

  assert.equal(purchase.amountPaid, 7000);
  assert.equal(purchase.balanceDue, 3000);
  assert.equal(purchase.paymentStatus, 'PARTIAL');
});

test('7. Restock Prediction Intelligence: ADS, Lead Time Demand, and ROP Calculation', async () => {
  const fastProduct = await Product.create({
    name: 'Everyday Black Tea 500g',
    sku: 'RESTOCK-TEA-01',
    category: 'Groceries',
    purchaseCost: 150,
    sellingPrice: 250,
    stockQuantity: 12, // In stock
    lowStockThreshold: 10
  });

  // Create 3 sales in the past 10 days, total 30 units sold
  const windowDays = 30;
  const leadTimeDays = 7;
  const safetyStockDays = 3;

  for (let i = 1; i <= 3; i++) {
    await Sale.create({
      invoiceNumber: `INV-RESTOCK-${i}`,
      items: [
        {
          product: fastProduct._id,
          productName: fastProduct.name,
          sku: fastProduct.sku,
          quantity: 10,
          unitCostSnapshot: 150,
          sellingPriceSnapshot: 250,
          lineTotal: 2500,
          profit: 1000
        }
      ],
      subtotal: 2500,
      grandTotal: 2500,
      totalCost: 1500,
      grossProfit: 1000,
      amountPaid: 2500,
      status: 'COMPLETED',
      saleDate: new Date(Date.now() - i * 86400000)
    });
  }

  const result = await getRestockRecommendations({
    windowDays,
    leadTimeDays,
    safetyStockDays
  });

  const rec = result.recommendations.find((r) => r.product.sku === 'RESTOCK-TEA-01');
  assert.ok(rec, 'Recommendation for product should be computed');

  // ADS = 30 units / 30 days = 1.0 units/day
  assert.equal(rec.totalUnitsSoldInWindow, 30);
  assert.equal(rec.averageDailySales, 1.0);

  // LTD = ADS (1.0) * leadTimeDays (7) = 7.0
  assert.equal(rec.leadTimeDemand, 7.0);

  // Safety Stock = ADS (1.0) * safetyStockDays (3) = 3.0
  assert.equal(rec.safetyStock, 3.0);

  // ROP = Ceil(LTD + SS) = Ceil(7.0 + 3.0) = 10, compared with lowStockThreshold (10) -> ROP = 10
  assert.equal(rec.reorderPoint, 10);

  // Current stock is 12, ROP is 10 -> needsRestock = false (12 > 10)
  assert.equal(rec.needsRestock, false);
  assert.equal(rec.daysUntilStockout, 12); // 12 / 1.0 = 12 days

  // Now reduce stock to 6 (below ROP of 10)
  fastProduct.stockQuantity = 6;
  await fastProduct.save();

  const result2 = await getRestockRecommendations({
    windowDays,
    leadTimeDays,
    safetyStockDays
  });

  const rec2 = result2.recommendations.find((r) => r.product.sku === 'RESTOCK-TEA-01');
  assert.equal(rec2.needsRestock, true, 'Product should now be flagged for restocking');
  assert.ok(rec2.recommendedOrderQty > 0, 'Should suggest restock quantity');
  assert.equal(rec2.urgency, 'MEDIUM');
});
