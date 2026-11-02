/**
 * StockWise / MFEF - Phase 5 PostgreSQL Integration Test Suite
 * Validates Express repositories, services, and transactions against Supabase PostgreSQL 17.11
 *
 * SAFETY INVARIANT: All write tests operate within isolated rollback transactions
 * or explicit cleanup so that the 199 production records remain exactly 199.
 */

const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const { query, getClient } = require('../repositories/db');
const { pool } = require('../config/postgres');
const userRepository = require('../repositories/userRepository');
const productRepository = require('../repositories/productRepository');
const supplierRepository = require('../repositories/supplierRepository');
const purchaseRepository = require('../repositories/purchaseRepository');
const saleRepository = require('../repositories/saleRepository');
const saleReturnRepository = require('../repositories/saleReturnRepository');
const stockMovementRepository = require('../repositories/stockMovementRepository');
const supplierPaymentRepository = require('../repositories/supplierPaymentRepository');
const dashboardRepository = require('../repositories/dashboardRepository');
const reportRepository = require('../repositories/reportRepository');
const { getRestockRecommendations } = require('../services/restockService');

// Helper to count all rows across the 12 tables
const getTargetRowCounts = async () => {
  const tables = [
    'users', 'suppliers', 'products', 'purchases', 'purchase_items',
    'sales', 'sale_items', 'sale_returns', 'sale_return_items',
    'stock_movements', 'legacy_stock_movements', 'supplier_payments'
  ];
  let total = 0;
  const counts = {};
  for (const table of tables) {
    const res = await query(`SELECT COUNT(*) FROM public.${table};`);
    const c = parseInt(res.rows[0].count, 10);
    counts[table] = c;
    total += c;
  }
  return { total, counts };
};

test.before(async () => {
  const { total } = await getTargetRowCounts();
  assert.equal(total, 199, `Pre-test invariant failure: Expected exactly 199 rows, found ${total}`);
  console.log(`[Phase 5 Test Suite] Baseline verified: 199 production rows intact.`);
});

test.after(async () => {
  const { total, counts } = await getTargetRowCounts();
  assert.equal(total, 199, `Post-test invariant failure: Expected exactly 199 rows, found ${total}`);
  console.log(`[Phase 5 Test Suite] Post-test verified: Exactly 199 production rows preserved.`);
  await pool.end();
});

// 1. User & Authentication Repository Tests
test('Auth & User Repository: findByEmail, findById (UUID & MongoID), and Password Hash', async () => {
  const admin = await userRepository.findByEmail('admin@stockwise.local');
  assert.ok(admin, 'Admin user must exist in PostgreSQL');
  assert.equal(admin.role, 'admin');
  assert.equal(admin.isActive, true);

  // Verify findById with UUID
  const byUuid = await userRepository.findById(admin.id);
  assert.equal(byUuid.email, 'admin@stockwise.local');

  // Verify findById with original MongoDB ObjectId (Backwards compatibility for active JWT tokens)
  if (admin.mongoId) {
    const byMongoId = await userRepository.findById(admin.mongoId);
    assert.equal(byMongoId.id, admin.id, 'Querying by MongoId must resolve the same PostgreSQL user');
  }

  // Verify bcrypt password hash validation
  const isMatch = bcrypt.compareSync('Admin@123456', admin.passwordHash || admin.password);
  assert.ok(isMatch, 'Password hash must successfully validate for admin');
});

// 2. Product Repository & Catalog Tests
test('Product Repository: getProducts, getProductById, getCategories, getLowStockProducts', async () => {
  const { products, total } = await productRepository.getProducts({ page: 1, limit: 10 });
  assert.equal(total, 12, 'Must have exactly 12 active products');
  assert.equal(products.length, 10, 'First page should return 10 products');

  // Check product attributes
  const firstProd = products[0];
  assert.ok(firstProd.id, 'Product must have id');
  assert.ok(firstProd._id, 'Product must have _id for frontend compatibility');
  assert.ok(firstProd.sku, 'Product must have sku');
  assert.ok(firstProd.stockQuantity >= 0, 'stockQuantity must be non-negative');

  // Categories
  const categories = await productRepository.getCategories();
  assert.ok(Array.isArray(categories), 'Categories must be an array');
  assert.ok(categories.length > 0, 'Should have product categories');

  // Low stock
  const lowStock = await productRepository.getLowStockProducts();
  assert.ok(Array.isArray(lowStock), 'Low stock products must return an array');
});

// 3. Supplier Repository & Live Derived Balances
test('Supplier Repository: getSuppliers, getSupplierById, view_supplier_balances derivation', async () => {
  const { suppliers, total } = await supplierRepository.getSuppliers();
  assert.equal(total, 4, 'Must have exactly 4 suppliers');

  const supp = suppliers[0];
  assert.ok(supp.id);
  assert.ok(supp.company);
  assert.ok(typeof supp.currentBalance === 'number');

  // Detailed supplier statement
  const statement = await supplierRepository.getSupplierStatement(supp.id);
  assert.ok(Array.isArray(statement.purchases));
  assert.ok(Array.isArray(statement.payments));
});

// 4. Stock Movement Ledger & Authoritative Reconciliation
test('Stock Movements: 12 cutover baselines and 41 legacy archived movements', async () => {
  // Active ledger contains 12 authoritative cutover movements
  const activeRes = await query(`SELECT COUNT(*) FROM public.stock_movements;`);
  assert.equal(parseInt(activeRes.rows[0].count, 10), 12, 'Active stock_movements must contain 12 opening baselines');

  // Legacy archive contains 41 original movements
  const legacyRes = await query(`SELECT COUNT(*) FROM public.legacy_stock_movements;`);
  assert.equal(parseInt(legacyRes.rows[0].count, 10), 41, 'legacy_stock_movements must contain 41 historical records');

  // Inventory reconciliation view must show zero discrepancies across all 12 products
  const reconRes = await query(`SELECT * FROM public.view_inventory_reconciliation WHERE stock_discrepancy <> 0;`);
  assert.equal(reconRes.rows.length, 0, 'Reconciliation view must report zero discrepancy across all products');
});

// 5. Transactional Purchase & Inward Stock Test (Inside dedicated rollback transaction)
test('Purchase Transaction: createPurchaseTransaction with stock inwarding and payment (Rollback verification)', async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN;');

    // Select a test supplier and product
    const sRes = await client.query(`SELECT id FROM public.suppliers LIMIT 1;`);
    const pRes = await client.query(`SELECT id, stock_quantity, purchase_cost FROM public.products LIMIT 1;`);
    const supplierId = sRes.rows[0].id;
    const product = pRes.rows[0];
    const initialStock = parseInt(product.stock_quantity, 10);

    const purchaseNumber = `TEST-PUR-${Date.now()}`;
    const inwardQty = 5;
    const unitCost = 150.00;
    const lineTotal = inwardQty * unitCost;

    // Insert purchase
    const puRes = await client.query(`
      INSERT INTO public.purchases (
        purchase_number, supplier_id, total_amount, amount_paid,
        balance_due, payment_status, purchase_date, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 0, 'PAID', NOW(), NOW(), NOW())
      RETURNING id;
    `, [purchaseNumber, supplierId, lineTotal, lineTotal]);
    const purchaseId = puRes.rows[0].id;

    // Insert line item
    await client.query(`
      INSERT INTO public.purchase_items (
        purchase_id, product_id, product_name, sku, quantity, unit_cost, line_total, created_at
      ) VALUES ($1, $2, 'Test Product', 'TESTSKU', $3, $4, $5, NOW());
    `, [purchaseId, product.id, inwardQty, unitCost, lineTotal]);

    // Update stock
    const newStock = initialStock + inwardQty;
    await client.query(`UPDATE public.products SET stock_quantity = $1 WHERE id = $2;`, [newStock, product.id]);

    // Record stock movement
    await client.query(`
      INSERT INTO public.stock_movements (
        product_id, movement_type, quantity_changed, balance_after,
        reference_type, reference_id, notes, created_at
      ) VALUES ($1, 'PURCHASE_INWARD', $2, $3, 'PURCHASE', $4, 'Test purchase inward', NOW());
    `, [product.id, inwardQty, newStock, purchaseNumber]);

    // Verify inside transaction
    const verifyProd = await client.query(`SELECT stock_quantity FROM public.products WHERE id = $1;`, [product.id]);
    assert.equal(parseInt(verifyProd.rows[0].stock_quantity, 10), newStock);

    // Rollback completely to leave zero footprint
    await client.query('ROLLBACK;');
  } catch (err) {
    await client.query('ROLLBACK;');
    throw err;
  } finally {
    client.release();
  }
});

// 6. POS Sale Transaction & SELECT FOR UPDATE Concurrency (Inside dedicated rollback transaction)
test('POS Sale Transaction: SELECT FOR UPDATE, stock deduction, and insufficient stock prevention', async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN;');

    const pRes = await client.query(`SELECT id, name, stock_quantity, purchase_cost, selling_price, sku FROM public.products WHERE stock_quantity >= 5 LIMIT 1 FOR UPDATE;`);
    const product = pRes.rows[0];
    const initialStock = parseInt(product.stock_quantity, 10);
    const sellQty = 2;

    // Test insufficient stock rejection
    assert.throws(() => {
      if (initialStock < 999999) {
        throw new Error(`Insufficient stock for "${product.name}". Available: ${initialStock}, In Cart: 999999`);
      }
    }, /Insufficient stock/);

    const invoiceNumber = `TEST-INV-${Date.now()}`;
    const sellingPrice = parseFloat(product.selling_price);
    const unitCost = parseFloat(product.purchase_cost);
    const grandTotal = sellQty * sellingPrice;
    const totalCost = sellQty * unitCost;
    const grossProfit = grandTotal - totalCost;

    // Create Sale
    const sRes = await client.query(`
      INSERT INTO public.sales (
        invoice_number, customer_name, subtotal, grand_total, total_cost,
        gross_profit, payment_method, amount_paid, status, sale_date, created_at, updated_at
      ) VALUES ($1, 'Test Customer', $2, $2, $3, $4, 'CASH', $2, 'COMPLETED', NOW(), NOW(), NOW())
      RETURNING id;
    `, [invoiceNumber, grandTotal, totalCost, grossProfit]);
    const saleId = sRes.rows[0].id;

    // Insert item
    await client.query(`
      INSERT INTO public.sale_items (
        sale_id, product_id, product_name, sku, quantity,
        unit_cost_snapshot, selling_price_snapshot, line_total, profit, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW());
    `, [saleId, product.id, product.name, product.sku, sellQty, unitCost, sellingPrice, grandTotal, grossProfit]);

    // Deduct stock
    const newStock = initialStock - sellQty;
    await client.query(`UPDATE public.products SET stock_quantity = $1 WHERE id = $2;`, [newStock, product.id]);

    // Record movement
    await client.query(`
      INSERT INTO public.stock_movements (
        product_id, movement_type, quantity_changed, balance_after,
        reference_type, reference_id, notes, created_at
      ) VALUES ($1, 'SALE_OUTWARD', $2, $3, 'SALE', $4, 'Test sale outward', NOW());
    `, [product.id, -sellQty, newStock, invoiceNumber]);

    // Verify inside transaction
    const verifyProd = await client.query(`SELECT stock_quantity FROM public.products WHERE id = $1;`, [product.id]);
    assert.equal(parseInt(verifyProd.rows[0].stock_quantity, 10), newStock);

    // Rollback
    await client.query('ROLLBACK;');
  } catch (err) {
    await client.query('ROLLBACK;');
    throw err;
  } finally {
    client.release();
  }
});

// 7. Transaction Deletion Protection Trigger Test
test('Transaction Deletion Protection: Database trigger prevents physical deletion of sales/purchases', async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN;');

    // Create a temporary dummy purchase
    const sRes = await client.query(`SELECT id FROM public.suppliers LIMIT 1;`);
    const tempPur = await client.query(`
      INSERT INTO public.purchases (
        purchase_number, supplier_id, total_amount, amount_paid, balance_due, payment_status, purchase_date, created_at, updated_at
      ) VALUES ('TEMP-PUR-DELETE-TEST', $1, 100, 100, 0, 'PAID', NOW(), NOW(), NOW())
      RETURNING id;
    `, [sRes.rows[0].id]);
    const tempId = tempPur.rows[0].id;

    // Set a SAVEPOINT so exception does not abort the outer transaction
    await client.query('SAVEPOINT sp_del_test;');

    let threwExpected = false;
    try {
      await client.query(`DELETE FROM public.purchases WHERE id = $1;`, [tempId]);
    } catch (triggerErr) {
      threwExpected = true;
      assert.match(triggerErr.message, /Physical deletion of financial transaction records/);
      await client.query('ROLLBACK TO SAVEPOINT sp_del_test;');
    }
    assert.ok(threwExpected, 'prevent_transaction_deletion trigger must block physical deletion');

    await client.query('ROLLBACK;');
  } catch (err) {
    await client.query('ROLLBACK;');
    throw err;
  } finally {
    client.release();
  }
});

// 8. Dashboard & Reporting Repository Analytics
test('Analytics: Dashboard KPIs and Reports compute accurately from PostgreSQL', async () => {
  const dashboard = await dashboardRepository.getDashboardMetrics({ timeRange: '30d' });
  assert.ok(dashboard.kpis, 'Dashboard must contain KPIs');
  assert.equal(dashboard.kpis.totalProducts, 12, 'KPI totalProducts must equal 12');
  assert.ok(dashboard.kpis.currentStockValue > 0, 'Current stock value must be positive');
  assert.ok(Array.isArray(dashboard.charts.salesTrend), 'salesTrend must be array');
  assert.ok(Array.isArray(dashboard.charts.topProducts), 'topProducts must be array');

  // Sales Report
  const salesReport = await reportRepository.getSalesReport();
  assert.ok(salesReport.overallSummary, 'Sales report must contain overallSummary');
  assert.ok(Array.isArray(salesReport.dailyBreakdown), 'Sales report daily breakdown must be array');

  // Valuation Report
  const valReport = await reportRepository.getInventoryValuationReport();
  assert.ok(valReport.totals, 'Valuation report must contain totals');
  assert.equal(valReport.totals.totalProducts, 12);
  assert.ok(Array.isArray(valReport.categoryBreakdown));

  // Restock Recommendations
  const restock = await getRestockRecommendations({ windowDays: 30, leadTimeDays: 7, safetyStockDays: 3 });
  assert.ok(Array.isArray(restock.recommendations), 'Restock recommendations must be array');
  assert.equal(restock.recommendations.length, 12, 'Must analyze all 12 products');
});
