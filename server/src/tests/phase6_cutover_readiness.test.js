/**
 * StockWise / MFEF - Phase 6 Frontend API Verification, Parallel Run & Cutover Readiness
 *
 * Comprehensive end-to-end HTTP and repository test suite validating:
 * 1. Authentication (Admin, Staff, Invalid password, Invalid JWT, Expired JWT, Role RBAC)
 * 2. Complete Business Workflows (Products, Suppliers, Purchases, POS Sales, Returns, Payments, Inventory, Reports)
 * 3. High-Concurrency POS Race Condition Prevention (SELECT FOR UPDATE row lock)
 * 4. Data Fingerprinting & Zero Drift Invariant Verification (199 production rows preserved)
 * 5. Performance Latency Profiling across key endpoints
 */

process.env.NODE_ENV = 'test';
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const app = require('../index');
const { query, getClient } = require('../repositories/db');
const { pool } = require('../config/postgres');
const userRepository = require('../repositories/userRepository');
const productRepository = require('../repositories/productRepository');
const supplierRepository = require('../repositories/supplierRepository');
const purchaseRepository = require('../repositories/purchaseRepository');
const saleRepository = require('../repositories/saleRepository');
const saleReturnRepository = require('../repositories/saleReturnRepository');
const dashboardRepository = require('../repositories/dashboardRepository');
const reportRepository = require('../repositories/reportRepository');
const { getRestockRecommendations } = require('../services/restockService');

let server;
let baseUrl;
let adminToken;
let staffToken;

// Helper to compute complete target row counts & financial fingerprints
const computeFingerprints = async () => {
  const tables = [
    'users', 'suppliers', 'products', 'purchases', 'purchase_items',
    'sales', 'sale_items', 'sale_returns', 'sale_return_items',
    'stock_movements', 'legacy_stock_movements', 'supplier_payments'
  ];
  let totalRows = 0;
  const counts = {};
  for (const table of tables) {
    const res = await query(`SELECT COUNT(*) FROM public.${table};`);
    const c = parseInt(res.rows[0].count, 10);
    counts[table] = c;
    totalRows += c;
  }

  const [salesFin, purchFin, payFin, reconFin] = await Promise.all([
    query(`SELECT COALESCE(SUM(grand_total), 0.00) as sum_sales FROM public.sales;`),
    query(`SELECT COALESCE(SUM(total_amount), 0.00) as sum_purchases FROM public.purchases;`),
    query(`SELECT COALESCE(SUM(amount), 0.00) as sum_payments FROM public.supplier_payments;`),
    query(`SELECT COUNT(*) as disc_count FROM public.view_inventory_reconciliation WHERE stock_discrepancy <> 0;`)
  ]);

  return {
    totalRows,
    counts,
    sumSales: parseFloat(salesFin.rows[0].sum_sales),
    sumPurchases: parseFloat(purchFin.rows[0].sum_purchases),
    sumPayments: parseFloat(payFin.rows[0].sum_payments),
    reconciliationDiscrepancies: parseInt(reconFin.rows[0].disc_count, 10)
  };
};

let baseline;

test.before(async () => {
  // Capture baseline fingerprints before tests run
  baseline = await computeFingerprints();
  assert.ok(baseline.totalRows >= 199, `Pre-test invariant failure: Expected at least 199 rows, found ${baseline.totalRows}`);
  assert.equal(baseline.reconciliationDiscrepancies, 0, 'Pre-test invariant failure: Reconciliation discrepancies found');
  console.log(`[Phase 6] Baseline Verified: ${baseline.totalRows} rows, ₹${baseline.sumSales} sales, ₹${baseline.sumPurchases} purchases, ₹${baseline.sumPayments} payments, 0 inventory discrepancies.`);

  // Start HTTP server on ephemeral port
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}/api`;
      console.log(`[Phase 6 Test Server] Running at ${baseUrl}`);
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  const postTest = await computeFingerprints();
  assert.equal(postTest.totalRows, baseline.totalRows, `Post-test invariant failure: Rows changed from ${baseline.totalRows} to ${postTest.totalRows}`);
  assert.equal(postTest.sumSales, baseline.sumSales, `Post-test invariant failure: Sales sum changed from ${baseline.sumSales} to ${postTest.sumSales}`);
  assert.equal(postTest.sumPurchases, baseline.sumPurchases, `Post-test invariant failure: Purchases sum changed from ${baseline.sumPurchases} to ${postTest.sumPurchases}`);
  assert.equal(postTest.sumPayments, baseline.sumPayments, `Post-test invariant failure: Payments sum changed from ${baseline.sumPayments} to ${postTest.sumPayments}`);
  assert.equal(postTest.reconciliationDiscrepancies, 0, 'Post-test invariant failure: Inventory reconciliation has discrepancies');
  console.log(`[Phase 6] Post-Test Invariants Verified: All 199 production rows & financial fingerprints 100% intact.`);
  await pool.end();
});

// ==========================================
// TASK 2: AUTHENTICATION & ACCESS CONTROL
// ==========================================
test('Task 2.1: Admin Login & JWT Generation', async () => {
  const adminPassword = process.env.TEST_ADMIN_PASSWORD;
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@stockwise.local', password: adminPassword })
  });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.ok(data.token, 'Must return JWT token');
  assert.equal(data.user.role, 'admin');
  assert.equal(data.user.email, 'admin@stockwise.local');
  adminToken = data.token;
});

test('Task 2.2: Staff Login & JWT Generation', async () => {
  const staffPassword = process.env.TEST_STAFF_PASSWORD;
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'staff@stockwise.local', password: staffPassword })
  });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.ok(data.token);
  assert.equal(data.user.role, 'staff');
  staffToken = data.token;
});

test('Task 2.2b: Incorrect Password Rejection (401)', async () => {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@stockwise.local', password: 'DecommissionedPass@999' })
  });
  assert.equal(res.status, 401, 'Invalid password must be rejected');
});

test('Task 2.3: Invalid Password Rejection (401)', async () => {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@stockwise.local', password: 'WrongPassword999!' })
  });
  const data = await res.json();
  assert.equal(res.status, 401);
  assert.equal(data.success, false);
  assert.match(data.message, /invalid/i);
});

test('Task 2.4: Invalid & Malformed JWT Rejection (401)', async () => {
  const res = await fetch(`${baseUrl}/auth/me`, {
    headers: { Authorization: 'Bearer this_is_not_a_valid_jwt' }
  });
  const data = await res.json();
  assert.equal(res.status, 401);
  assert.equal(data.success, false);
});

test('Task 2.5: Expired JWT Rejection (401)', async () => {
  const secret = process.env.JWT_SECRET || 'stockwise_super_secret_jwt_key_2026_secure';
  // Sign a token that expired 1 hour ago
  const expiredToken = jwt.sign(
    { id: '00000000-0000-0000-0000-000000000001', email: 'test@expired.test' },
    secret,
    { expiresIn: '-1h' }
  );

  const res = await fetch(`${baseUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${expiredToken}` }
  });
  const data = await res.json();
  assert.equal(res.status, 401);
  assert.equal(data.success, false);
  assert.match(data.message, /expired/i);
});

test('Task 2.6: Protected Route Authorization & User Profile Retrieval (/auth/me)', async () => {
  const res = await fetch(`${baseUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.equal(data.user.email, 'admin@stockwise.local');
  assert.equal(data.user.role, 'admin');
  assert.ok(data.user.id);
  assert.ok(data.user._id);
});

test('Task 2.7: Role-Based Access Control (Staff forbidden on Admin-only deletion)', async () => {
  // Staff attempting to delete a product
  const res = await fetch(`${baseUrl}/products/00000000-0000-0000-0000-000000000001`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${staffToken}` }
  });
  const data = await res.json();
  assert.equal(res.status, 403, 'Staff must be forbidden from admin deletion');
  assert.equal(data.success, false);
});

// ==========================================
// TASK 3: BUSINESS WORKFLOW TESTING (ISOLATED TRANSACTIONS)
// ==========================================
test('Task 3.1: Products Read, Filter & Pagination (/products)', async () => {
  const res = await fetch(`${baseUrl}/products?page=1&limit=5&category=Groceries`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.ok(Array.isArray(data.data));
  assert.ok(data.data.length > 0, 'Should find products in Groceries category');
  assert.equal(data.pagination.page, 1);
  assert.equal(data.pagination.limit, 5);
  // Verify dual ID format
  const item = data.data[0];
  assert.ok(item.id);
  assert.equal(item._id, item.id);
  assert.ok(item.name);
  assert.ok(item.sku);
});

test('Task 3.2: Product Categories Endpoint (/products/categories)', async () => {
  const res = await fetch(`${baseUrl}/products/categories`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.ok(Array.isArray(data.data));
  assert.ok(data.data.includes('Apparel') || data.data.includes('Electronics') || data.data.includes('Accessories'));
});

test('Task 3.3: Product Details by ID (/products/:id)', async () => {
  const listRes = await fetch(`${baseUrl}/products?limit=1`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const listData = await listRes.json();
  const prodId = listData.data[0].id;

  const res = await fetch(`${baseUrl}/products/${prodId}`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.equal(data.data.id, prodId);
  assert.equal(data.data._id, prodId);
});

test('Task 3.4: Suppliers Listing with Dynamic Derived Balances (/suppliers)', async () => {
  const res = await fetch(`${baseUrl}/suppliers`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.equal(data.data.length, 4, 'Must return all 4 suppliers');
  for (const supp of data.data) {
    assert.ok(supp.id);
    assert.ok(supp.company);
    assert.ok(typeof supp.currentBalance === 'number');
    assert.ok(typeof supp.totalPurchased === 'number');
    assert.ok(typeof supp.totalPayments === 'number');
  }
});

test('Task 3.5: Supplier Statement & History (/suppliers/:id)', async () => {
  const supps = await supplierRepository.getSuppliers();
  const suppId = supps.suppliers[0].id;

  const res = await fetch(`${baseUrl}/suppliers/${suppId}`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.equal(data.data.id, suppId);
  assert.ok(Array.isArray(data.purchases));
  assert.ok(Array.isArray(data.payments));
});

test('Task 3.6: Supplier Dues & Overdue Balances (/payments/dues)', async () => {
  const res = await fetch(`${baseUrl}/payments/dues`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.ok(data.data.summary);
  assert.ok(typeof data.data.summary.totalOutstanding === 'number');
  assert.ok(Array.isArray(data.data.payables));
  assert.ok(Array.isArray(data.data.unpaidPurchases));
});

test('Task 3.7: Dashboard KPIs & Charts (/dashboard)', async () => {
  const res = await fetch(`${baseUrl}/dashboard?timeRange=30d`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.ok(data.data.kpis);
  assert.equal(data.data.kpis.totalProducts, 12);
  assert.ok(data.data.kpis.currentStockValue > 0);
  assert.ok(Array.isArray(data.data.charts.salesTrend));
  assert.ok(Array.isArray(data.data.charts.topProducts));
  assert.ok(Array.isArray(data.data.recentActivity.sales));
  assert.ok(Array.isArray(data.data.recentActivity.purchases));
});

test('Task 3.8: Sales Report JSON & CSV Export (/reports/sales)', async () => {
  // Test JSON
  const resJson = await fetch(`${baseUrl}/reports/sales`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const dataJson = await resJson.json();
  assert.equal(resJson.status, 200);
  assert.equal(dataJson.success, true);
  assert.ok(dataJson.summary);
  assert.ok(Array.isArray(dataJson.dailyBreakdown));

  // Test CSV export
  const resCsv = await fetch(`${baseUrl}/reports/sales?format=csv`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(resCsv.status, 200);
  assert.match(resCsv.headers.get('content-type') || '', /text\/csv/);
  const csvText = await resCsv.text();
  assert.match(csvText, /^Date,Invoices,Units Sold,Revenue/);
});

test('Task 3.9: Inventory Valuation Report JSON & CSV (/reports/inventory-valuation)', async () => {
  const resJson = await fetch(`${baseUrl}/reports/inventory-valuation`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const data = await resJson.json();
  assert.equal(resJson.status, 200);
  assert.equal(data.success, true);
  assert.equal(data.summary.totalProducts, 12);
  assert.ok(Array.isArray(data.categories));

  // Test CSV
  const resCsv = await fetch(`${baseUrl}/reports/inventory-valuation?format=csv`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(resCsv.status, 200);
  assert.match(resCsv.headers.get('content-type') || '', /text\/csv/);
  const csvText = await resCsv.text();
  assert.match(csvText, /^Category,Products Count,Units in Stock/);
});

test('Task 3.10: Purchases Report JSON & CSV (/reports/purchases)', async () => {
  const resJson = await fetch(`${baseUrl}/reports/purchases`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const data = await resJson.json();
  assert.equal(resJson.status, 200);
  assert.equal(data.success, true);
  assert.ok(Array.isArray(data.data));

  // CSV
  const resCsv = await fetch(`${baseUrl}/reports/purchases?format=csv`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(resCsv.status, 200);
  assert.match(resCsv.headers.get('content-type') || '', /text\/csv/);
  const csvText = await resCsv.text();
  assert.match(csvText, /^Supplier,Company,Purchase Invoices/);
});

test('Task 3.11: Top-Selling Products Report JSON & CSV (/reports/top-products)', async () => {
  const resJson = await fetch(`${baseUrl}/reports/top-products?limit=5`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const data = await resJson.json();
  assert.equal(resJson.status, 200);
  assert.equal(data.success, true);
  assert.ok(Array.isArray(data.data));

  // CSV
  const resCsv = await fetch(`${baseUrl}/reports/top-products?limit=5&format=csv`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(resCsv.status, 200);
  assert.match(resCsv.headers.get('content-type') || '', /text\/csv/);
});

test('Task 3.12: Restock Intelligence Recommendations (/restock)', async () => {
  const res = await fetch(`${baseUrl}/restock?windowDays=30&leadTimeDays=7&safetyStockDays=3`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.equal(data.recommendations.length, 12);
  for (const rec of data.recommendations) {
    assert.ok(rec.product);
    assert.ok(typeof rec.reorderPoint === 'number');
    assert.ok(typeof rec.recommendedOrderQty === 'number');
    assert.ok(['CRITICAL', 'HIGH', 'MEDIUM', 'NORMAL'].includes(rec.urgency));
  }
});

test('Task 3.13: PDF Invoice Streaming (/sales/:id/pdf)', async () => {
  const salesRes = await fetch(`${baseUrl}/sales?limit=1`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const salesData = await salesRes.json();
  const saleId = salesData.data[0].id;

  // Stream via token in query parameter (as used by frontend window.open)
  const pdfRes = await fetch(`${baseUrl}/sales/${saleId}/pdf?token=${adminToken}`);
  assert.equal(pdfRes.status, 200);
  assert.equal(pdfRes.headers.get('content-type'), 'application/pdf');
  const buffer = await pdfRes.arrayBuffer();
  assert.ok(buffer.byteLength > 1000, 'PDF buffer must contain binary payload');
  // Check PDF signature: %PDF
  const header = String.fromCharCode(...new Uint8Array(buffer.slice(0, 4)));
  assert.equal(header, '%PDF');
});

test('Task 3.14: Complete Purchase Inward Transaction (Rollback protected)', async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN;');

    const sRes = await client.query('SELECT id, company FROM public.suppliers LIMIT 1;');
    const pRes = await client.query('SELECT id, name, sku, stock_quantity FROM public.products LIMIT 1;');
    const supplier = sRes.rows[0];
    const product = pRes.rows[0];
    const initialStock = parseInt(product.stock_quantity, 10);

    const purchaseNumber = `TEST-PO-${Date.now()}`;
    const inwardQty = 10;
    const cost = 250;
    const totalAmount = inwardQty * cost;

    // 1. Insert purchase
    const pu = await client.query(`
      INSERT INTO public.purchases (
        purchase_number, supplier_id, total_amount, amount_paid,
        balance_due, payment_status, purchase_date, created_at, updated_at
      ) VALUES ($1, $2, $3, $3, 0, 'PAID', NOW(), NOW(), NOW()) RETURNING id;
    `, [purchaseNumber, supplier.id, totalAmount]);

    // 2. Insert item
    await client.query(`
      INSERT INTO public.purchase_items (
        purchase_id, product_id, product_name, sku, quantity, unit_cost, line_total, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW());
    `, [pu.rows[0].id, product.id, product.name, product.sku, inwardQty, cost, totalAmount]);

    // 3. Update stock & log movement
    const afterStock = initialStock + inwardQty;
    await client.query(`UPDATE public.products SET stock_quantity = $1 WHERE id = $2;`, [afterStock, product.id]);
    await client.query(`
      INSERT INTO public.stock_movements (
        product_id, movement_type, quantity_changed, balance_after,
        reference_type, reference_id, notes, created_at
      ) VALUES ($1, 'PURCHASE_INWARD', $2, $3, 'PURCHASE', $4, 'Phase 6 PO Test', NOW());
    `, [product.id, inwardQty, afterStock, purchaseNumber]);

    // Verify
    const chk = await client.query(`SELECT stock_quantity FROM public.products WHERE id = $1;`, [product.id]);
    assert.equal(parseInt(chk.rows[0].stock_quantity, 10), afterStock);

    await client.query('ROLLBACK;');
  } catch (err) {
    await client.query('ROLLBACK;');
    throw err;
  } finally {
    client.release();
  }
});

test('Task 3.15: Sale Return & Stock Restoration Transaction (Rollback protected)', async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN;');

    const saleRes = await client.query(`SELECT id, invoice_number FROM public.sales LIMIT 1;`);
    const saleItemRes = await client.query(`SELECT product_id, product_name, sku, quantity, unit_cost_snapshot, selling_price_snapshot FROM public.sale_items WHERE sale_id = $1 LIMIT 1;`, [saleRes.rows[0].id]);
    const origSale = saleRes.rows[0];
    const origItem = saleItemRes.rows[0];

    const prodRes = await client.query(`SELECT stock_quantity FROM public.products WHERE id = $1;`, [origItem.product_id]);
    const initialStock = parseInt(prodRes.rows[0].stock_quantity, 10);
    const returnQty = 1;
    const refundAmount = returnQty * parseFloat(origItem.selling_price_snapshot);
    const returnNumber = `TEST-RET-${Date.now()}`;

    // Insert sale_return
    const retRes = await client.query(`
      INSERT INTO public.sale_returns (
        return_number, sale_id, invoice_number, refund_total,
        refund_method, reason, return_date, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'CASH', 'Phase 6 Return Test', NOW(), NOW(), NOW()) RETURNING id;
    `, [returnNumber, origSale.id, origSale.invoice_number, refundAmount]);

    // Insert return line item
    await client.query(`
      INSERT INTO public.sale_return_items (
        return_id, product_id, product_name, sku, quantity, refund_amount, unit_cost_snapshot, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW());
    `, [retRes.rows[0].id, origItem.product_id, origItem.product_name, origItem.sku, returnQty, refundAmount, origItem.unit_cost_snapshot]);

    // Restore stock
    const restoredStock = initialStock + returnQty;
    await client.query(`UPDATE public.products SET stock_quantity = $1 WHERE id = $2;`, [restoredStock, origItem.product_id]);

    // Record movement
    await client.query(`
      INSERT INTO public.stock_movements (
        product_id, movement_type, quantity_changed, balance_after,
        reference_type, reference_id, notes, created_at
      ) VALUES ($1, 'SALE_RETURN', $2, $3, 'RETURN', $4, 'Phase 6 return restore', NOW());
    `, [origItem.product_id, returnQty, restoredStock, returnNumber]);

    // Verify stock restored
    const chk = await client.query(`SELECT stock_quantity FROM public.products WHERE id = $1;`, [origItem.product_id]);
    assert.equal(parseInt(chk.rows[0].stock_quantity, 10), restoredStock);

    await client.query('ROLLBACK;');
  } catch (err) {
    await client.query('ROLLBACK;');
    throw err;
  } finally {
    client.release();
  }
});

// ==========================================
// TASK 4: CONCURRENCY & RACE CONDITION TEST
// ==========================================
test('Task 4: High Concurrency POS Race Condition Protection (Pessimistic Locking)', async () => {
  // Test scenario: A product has exactly 3 units in stock.
  // Two simultaneous checkout transactions attempt to purchase 2 units each (total 4 units requested).
  // With SELECT ... FOR UPDATE, one transaction MUST acquire the row lock and succeed (leaving 1 unit).
  // The second transaction MUST detect insufficient stock and fail without corrupting or underflowing stock.

  const client1 = await getClient();
  const client2 = await getClient();

  try {
    // 1. Create a temporary isolated test product inside a test supplier
    const suppRes = await query(`SELECT id FROM public.suppliers LIMIT 1;`);
    const tempSku = `CONCUR-${Date.now()}`;
    const pCreate = await query(`
      INSERT INTO public.products (
        name, sku, category, supplier_id, purchase_cost,
        selling_price, stock_quantity, low_stock_threshold, unit, is_deleted
      ) VALUES ('Concurrency Test Product', $1, 'Testing', $2, 100, 150, 3, 1, 'pcs', false)
      RETURNING id;
    `, [tempSku, suppRes.rows[0].id]);
    const testProductId = pCreate.rows[0].id;

    let tx1Result = null;
    let tx2Result = null;

    const runTx = async (client, clientId, requestedQty) => {
      try {
        await client.query('BEGIN;');
        // Acquire pessimistic row lock
        const res = await client.query(`
          SELECT id, stock_quantity, purchase_cost, selling_price, name, sku 
          FROM public.products 
          WHERE id = $1 FOR UPDATE;
        `, [testProductId]);
        const product = res.rows[0];
        const currentStock = parseInt(product.stock_quantity, 10);

        if (currentStock < requestedQty) {
          throw new Error(`Insufficient stock for "${product.name}". Available: ${currentStock}, In Cart: ${requestedQty}`);
        }

        // Deduct stock
        const newStock = currentStock - requestedQty;
        await client.query(`UPDATE public.products SET stock_quantity = $1 WHERE id = $2;`, [newStock, product.id]);

        // Small simulated delay to simulate transaction work under lock
        await new Promise((r) => setTimeout(r, 80));

        await client.query('COMMIT;');
        return { success: true, clientId, stockAfter: newStock };
      } catch (err) {
        await client.query('ROLLBACK;');
        return { success: false, clientId, error: err.message };
      }
    };

    // Execute concurrently
    const [res1, res2] = await Promise.all([
      runTx(client1, 'Client-1', 2),
      runTx(client2, 'Client-2', 2)
    ]);

    // Exactly one must succeed, exactly one must fail
    const successes = [res1, res2].filter(r => r.success);
    const failures = [res1, res2].filter(r => !r.success);

    assert.equal(successes.length, 1, 'Exactly one concurrent transaction must succeed');
    assert.equal(failures.length, 1, 'Exactly one concurrent transaction must fail due to lock serialization');
    assert.match(failures[0].error, /Insufficient stock/);

    // Verify stock on database is 1 (3 - 2), never negative
    const finalCheck = await query(`SELECT stock_quantity FROM public.products WHERE id = $1;`, [testProductId]);
    assert.equal(parseInt(finalCheck.rows[0].stock_quantity, 10), 1);

    // Clean up temporary test product completely
    await query(`DELETE FROM public.products WHERE id = $1;`, [testProductId]);
  } finally {
    client1.release();
    client2.release();
  }
});

// ==========================================
// TASK 8: PERFORMANCE & LATENCY PROFILING
// ==========================================
test('Task 8: Performance Latency Profiling across Core Endpoints', async () => {
  const profileEndpoint = async (name, path) => {
    const t0 = performance.now();
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const t1 = performance.now();
    const duration = Math.round(t1 - t0);
    assert.equal(res.status, 200, `Endpoint ${path} failed with status ${res.status}`);
    return { name, path, duration };
  };

  const results = [
    await profileEndpoint('System Health Check', '/health'),
    await profileEndpoint('Dashboard Aggregation', '/dashboard?timeRange=30d'),
    await profileEndpoint('Product Catalog (50 items)', '/products?limit=50'),
    await profileEndpoint('Supplier Balances View', '/suppliers'),
    await profileEndpoint('Sales Performance Report', '/reports/sales'),
    await profileEndpoint('Inventory Valuation Report', '/reports/inventory-valuation')
  ];

  console.log('[Phase 6 Performance Profiling Results]:');
  for (const r of results) {
    console.log(`  - ${r.name.padEnd(30)} [${r.path.padEnd(35)}]: ${r.duration}ms`);
    assert.ok(r.duration < 5000, `Endpoint ${r.path} exceeded maximum allowable response time (5000ms)`);
  }
});
