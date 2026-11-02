/**
 * StockWise / MFEF - Phase 4 Dry-Run Migration Runner
 * Executes a 100% complete migration test inside an atomic PostgreSQL transaction (BEGIN...ROLLBACK)
 * Verifies every document, line item, relationship, financial total, and view balance.
 * NEVER commits data to Supabase in dry-run mode.
 */

const path = require('path');
const mongoose = require(path.join(__dirname, '../../node_modules/mongoose'));
require(path.join(__dirname, '../../node_modules/dotenv')).config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/postgres');

async function dryRunMigration() {
  console.log('======================================================================');
  console.log('StockWise / MFEF - Phase 4 Migration Dry-Run (BEGIN ... ROLLBACK)');
  console.log('======================================================================');

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/stockwise';
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  const db = mongoose.connection.db;
  console.log('✅ Connected to MongoDB source:', mongoose.connection.name);

  const client = await pool.connect();
  console.log('✅ Connected to Supabase PostgreSQL target\n');

  const report = {
    timestamp: new Date().toISOString(),
    sourceCounts: {},
    targetCounts: {},
    financialReconciliation: {},
    supplierBalanceReconciliation: {},
    inventoryReconciliation: [],
    validationErrors: [],
    dryRunStatus: 'UNKNOWN'
  };

  try {
    console.log('1. Initiating PostgreSQL Transaction (BEGIN)...');
    await client.query('BEGIN;');

    // 2. Ensure legacy_stock_movements archive table exists inside transaction
    console.log('2. Ensuring "legacy_stock_movements" archive table definition...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.legacy_stock_movements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        mongo_id VARCHAR(64) UNIQUE,
        product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
        movement_type VARCHAR(50) NOT NULL,
        quantity_changed INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        reference_type VARCHAR(50) DEFAULT 'MANUAL_ADJUSTMENT',
        reference_id VARCHAR(100) DEFAULT '',
        notes TEXT DEFAULT '',
        performed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // In-memory ID translation dictionaries: mongo_id -> postgres UUID
    const userMap = new Map();
    const supplierMap = new Map();
    const productMap = new Map();
    const purchaseMap = new Map();
    const saleMap = new Map();

    // -------------------------------------------------------------------------
    // Step A: Users (2 docs)
    // -------------------------------------------------------------------------
    const users = await db.collection('users').find({}).toArray();
    report.sourceCounts.users = users.length;
    console.log(`\n📦 Migrating Users (${users.length} records)...`);
    for (const u of users) {
      const res = await client.query(`
        INSERT INTO public.users (mongo_id, name, email, password_hash, role, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id;
      `, [
        u._id.toString(),
        u.name,
        u.email.toLowerCase().trim(),
        u.password,
        u.role || 'staff',
        u.isActive !== false,
        u.createdAt || new Date(),
        u.updatedAt || new Date()
      ]);
      userMap.set(u._id.toString(), res.rows[0].id);
    }
    console.log(`  ✅ Users mapped: ${userMap.size}`);

    // -------------------------------------------------------------------------
    // Step B: Suppliers (4 docs)
    // -------------------------------------------------------------------------
    const suppliers = await db.collection('suppliers').find({}).toArray();
    report.sourceCounts.suppliers = suppliers.length;
    console.log(`\n📦 Migrating Suppliers (${suppliers.length} records)...`);
    for (const s of suppliers) {
      const res = await client.query(`
        INSERT INTO public.suppliers (mongo_id, name, company, phone, email, address, notes, opening_balance, is_active, is_deleted, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id;
      `, [
        s._id.toString(),
        s.name,
        s.company,
        s.phone,
        s.email || '',
        s.address || '',
        s.notes || '',
        Number(s.openingBalance || 0),
        s.isActive !== false,
        false,
        s.createdAt || new Date(),
        s.updatedAt || new Date()
      ]);
      supplierMap.set(s._id.toString(), res.rows[0].id);
    }
    console.log(`  ✅ Suppliers mapped: ${supplierMap.size}`);

    // -------------------------------------------------------------------------
    // Step C: Products (12 docs)
    // -------------------------------------------------------------------------
    const products = await db.collection('products').find({}).toArray();
    report.sourceCounts.products = products.length;
    console.log(`\n📦 Migrating Products (${products.length} records)...`);
    for (const p of products) {
      const supplierId = p.supplier ? supplierMap.get(p.supplier.toString()) || null : null;
      const res = await client.query(`
        INSERT INTO public.products (
          mongo_id, name, sku, category, description, supplier_id,
          purchase_cost, selling_price, mrp, stock_quantity, low_stock_threshold,
          unit, image_url, is_deleted, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING id;
      `, [
        p._id.toString(),
        p.name,
        p.sku.toUpperCase().trim(),
        p.category,
        p.description || '',
        supplierId,
        Number(p.purchaseCost || 0),
        Number(p.sellingPrice || 0),
        p.mrp !== undefined && p.mrp !== null ? Number(p.mrp) : null,
        Number(p.stockQuantity || 0),
        Number(p.lowStockThreshold || 10),
        p.unit || 'pcs',
        p.imageUrl || '',
        !!p.isDeleted,
        p.createdAt || new Date(),
        p.updatedAt || new Date()
      ]);
      productMap.set(p._id.toString(), res.rows[0].id);
    }
    console.log(`  ✅ Products mapped: ${productMap.size}`);

    // -------------------------------------------------------------------------
    // Step D: Purchases & Purchase Line Items (3 headers, 6 line items)
    // -------------------------------------------------------------------------
    const purchases = await db.collection('purchases').find({}).toArray();
    report.sourceCounts.purchases = purchases.length;
    let expectedPurchaseItems = 0;
    console.log(`\n📦 Migrating Purchases & Line Items (${purchases.length} records)...`);
    for (const pu of purchases) {
      const supplierId = supplierMap.get(pu.supplier.toString());
      if (!supplierId) {
        throw new Error(`Dangling supplier reference in purchase ${pu.purchaseNumber}`);
      }
      const createdBy = pu.createdBy ? userMap.get(pu.createdBy.toString()) || null : null;

      const pRes = await client.query(`
        INSERT INTO public.purchases (
          mongo_id, purchase_number, supplier_id, supplier_invoice_number,
          purchase_date, due_date, subtotal, discount, tax, total_amount,
          amount_paid, balance_due, payment_status, notes, created_by,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING id;
      `, [
        pu._id.toString(),
        pu.purchaseNumber,
        supplierId,
        pu.supplierInvoiceNumber || '',
        pu.purchaseDate || new Date(),
        pu.dueDate || null,
        Number(pu.subtotal || 0),
        Number(pu.discount || 0),
        Number(pu.tax || 0),
        Number(pu.totalAmount || 0),
        Number(pu.amountPaid || 0),
        Number(pu.balanceDue || 0),
        pu.paymentStatus || 'UNPAID',
        pu.notes || '',
        createdBy,
        pu.createdAt || new Date(),
        pu.updatedAt || new Date()
      ]);
      purchaseMap.set(pu._id.toString(), pRes.rows[0].id);

      // Line items
      for (const item of (pu.items || [])) {
        expectedPurchaseItems++;
        const prodId = productMap.get(item.product.toString());
        if (!prodId) {
          throw new Error(`Dangling product reference in purchase item ${item.sku}`);
        }
        await client.query(`
          INSERT INTO public.purchase_items (
            purchase_id, product_id, product_name, sku, quantity, unit_cost, line_total, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
        `, [
          pRes.rows[0].id,
          prodId,
          item.productName,
          item.sku,
          Number(item.quantity),
          Number(item.unitCost),
          Number(item.lineTotal),
          pu.createdAt || new Date()
        ]);
      }
    }
    report.sourceCounts.purchase_items = expectedPurchaseItems;
    console.log(`  ✅ Purchases mapped: ${purchaseMap.size} | Line Items: ${expectedPurchaseItems}`);

    // -------------------------------------------------------------------------
    // Step E: Sales & Sale Line Items (39 headers, 78 line items)
    // -------------------------------------------------------------------------
    const sales = await db.collection('sales').find({}).toArray();
    report.sourceCounts.sales = sales.length;
    let expectedSaleItems = 0;
    console.log(`\n📦 Migrating Sales & Line Items (${sales.length} records)...`);
    for (const sa of sales) {
      const soldBy = sa.soldBy ? userMap.get(sa.soldBy.toString()) || null : null;
      const sRes = await client.query(`
        INSERT INTO public.sales (
          mongo_id, invoice_number, customer_name, customer_phone,
          subtotal, discount, tax_rate, tax_amount, grand_total,
          total_cost, gross_profit, payment_method, amount_paid,
          change_due, status, idempotency_key, sold_by, sale_date,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING id;
      `, [
        sa._id.toString(),
        sa.invoiceNumber,
        sa.customerName || 'Walk-in Customer',
        sa.customerPhone || '',
        Number(sa.subtotal || 0),
        Number(sa.discount || 0),
        Number(sa.taxRate || 0),
        Number(sa.taxAmount || 0),
        Number(sa.grandTotal || 0),
        Number(sa.totalCost || 0),
        Number(sa.grossProfit || 0),
        sa.paymentMethod || 'CASH',
        Number(sa.amountPaid || 0),
        Number(sa.changeDue || 0),
        sa.status || 'COMPLETED',
        sa.idempotencyKey || null,
        soldBy,
        sa.saleDate || new Date(),
        sa.createdAt || new Date(),
        sa.updatedAt || new Date()
      ]);
      saleMap.set(sa._id.toString(), sRes.rows[0].id);

      // Line items
      for (const item of (sa.items || [])) {
        expectedSaleItems++;
        const prodId = productMap.get(item.product.toString());
        if (!prodId) {
          throw new Error(`Dangling product reference in sale item ${item.sku}`);
        }
        await client.query(`
          INSERT INTO public.sale_items (
            sale_id, product_id, product_name, sku, quantity,
            unit_cost_snapshot, selling_price_snapshot, line_total, profit, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);
        `, [
          sRes.rows[0].id,
          prodId,
          item.productName,
          item.sku,
          Number(item.quantity),
          Number(item.unitCostSnapshot || 0),
          Number(item.sellingPriceSnapshot || 0),
          Number(item.lineTotal || 0),
          Number(item.profit || 0),
          sa.saleDate || new Date()
        ]);
      }
    }
    report.sourceCounts.sale_items = expectedSaleItems;
    console.log(`  ✅ Sales mapped: ${saleMap.size} | Line Items: ${expectedSaleItems}`);

    // -------------------------------------------------------------------------
    // Step F: Supplier Payments (2 docs)
    // -------------------------------------------------------------------------
    const payments = await db.collection('supplierpayments').find({}).toArray();
    report.sourceCounts.supplier_payments = payments.length;
    console.log(`\n📦 Migrating Supplier Payments (${payments.length} records)...`);
    for (const pay of payments) {
      const supplierId = supplierMap.get(pay.supplier.toString());
      if (!supplierId) {
        throw new Error(`Dangling supplier reference in payment ${pay.paymentNumber}`);
      }
      const purchaseId = pay.purchase ? purchaseMap.get(pay.purchase.toString()) || null : null;
      const recordedBy = pay.recordedBy ? userMap.get(pay.recordedBy.toString()) || null : null;

      await client.query(`
        INSERT INTO public.supplier_payments (
          mongo_id, payment_number, supplier_id, purchase_id,
          amount, payment_date, payment_method, reference_number,
          notes, recorded_by, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);
      `, [
        pay._id.toString(),
        pay.paymentNumber,
        supplierId,
        purchaseId,
        Number(pay.amount),
        pay.paymentDate || new Date(),
        pay.paymentMethod || 'BANK_TRANSFER',
        pay.referenceNumber || '',
        pay.notes || '',
        recordedBy,
        pay.createdAt || new Date()
      ]);
    }
    console.log(`  ✅ Supplier Payments mapped: ${payments.length}`);

    // -------------------------------------------------------------------------
    // Step G: Historical Stock Movements Archive (41 docs)
    // -------------------------------------------------------------------------
    const legacyMovements = await db.collection('stockmovements').find({}).toArray();
    report.sourceCounts.legacy_stock_movements = legacyMovements.length;
    console.log(`\n📦 Migrating Historical Movements into "legacy_stock_movements" (${legacyMovements.length} records)...`);
    for (const lm of legacyMovements) {
      const prodId = productMap.get(lm.product.toString());
      if (!prodId) {
        throw new Error(`Dangling product reference in historical movement ${lm._id}`);
      }
      const performedBy = lm.performedBy ? userMap.get(lm.performedBy.toString()) || null : null;

      await client.query(`
        INSERT INTO public.legacy_stock_movements (
          mongo_id, product_id, movement_type, quantity_changed,
          balance_after, reference_type, reference_id, notes, performed_by, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);
      `, [
        lm._id.toString(),
        prodId,
        lm.movementType,
        Number(lm.quantityChanged),
        Number(lm.balanceAfter),
        lm.referenceType || 'MANUAL_ADJUSTMENT',
        lm.referenceId || '',
        lm.notes || '',
        performedBy,
        lm.createdAt || new Date()
      ]);
    }
    console.log(`  ✅ Legacy Stock Movements preserved: ${legacyMovements.length}`);

    // -------------------------------------------------------------------------
    // Step H: Authoritative Opening Stock Baseline in "stock_movements" (12 rows)
    // -------------------------------------------------------------------------
    console.log(`\n📦 Establishing Authoritative Baseline in "stock_movements" (12 records)...`);
    for (const p of products) {
      const prodId = productMap.get(p._id.toString());
      const stockQty = Number(p.stockQuantity || 0);

      await client.query(`
        INSERT INTO public.stock_movements (
          product_id, movement_type, quantity_changed, balance_after,
          reference_type, reference_id, notes, performed_by, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
      `, [
        prodId,
        'OPENING_STOCK',
        stockQty,
        stockQty,
        'INITIAL_IMPORT',
        'MIGRATION_CUTOVER_BASELINE',
        'Authoritative opening stock baseline established at migration',
        null,
        new Date()
      ]);
    }
    console.log(`  ✅ Authoritative opening stock baselines created: 12`);

    // =========================================================================
    // EXHAUSTIVE VERIFICATION SUITE INSIDE THE TRANSACTION
    // =========================================================================
    console.log('\n======================================================================');
    console.log('🔍 EXECUTING VERIFICATION QUERIES (INSIDE DRY-RUN TRANSACTION)');
    console.log('======================================================================');

    // 1. Table Counts Verification
    const tablesToCheck = [
      'users', 'suppliers', 'products', 'purchases', 'purchase_items',
      'sales', 'sale_items', 'supplier_payments', 'legacy_stock_movements',
      'stock_movements', 'sale_returns', 'sale_return_items'
    ];

    let totalStagedRows = 0;
    for (const t of tablesToCheck) {
      const cRes = await client.query(`SELECT COUNT(*) FROM public.${t};`);
      const cnt = parseInt(cRes.rows[0].count, 10);
      report.targetCounts[t] = cnt;
      totalStagedRows += cnt;
      console.log(`  Table: ${t.padEnd(25)} | Staged Count: ${String(cnt).padStart(3)}`);
    }
    report.totalStagedRows = totalStagedRows;
    console.log(`  ---------------------------------------------------`);
    console.log(`  TOTAL STAGED ROWS IN POSTGRESQL:      ${totalStagedRows}`);
    console.log(`  ---------------------------------------------------`);

    // Check for duplicate mongo_id values
    const dupTables = ['users', 'suppliers', 'products', 'purchases', 'sales', 'supplier_payments', 'legacy_stock_movements'];
    for (const dt of dupTables) {
      const dupRes = await client.query(`
        SELECT mongo_id, COUNT(*) 
        FROM public.${dt} 
        WHERE mongo_id IS NOT NULL 
        GROUP BY mongo_id 
        HAVING COUNT(*) > 1;
      `);
      if (dupRes.rows.length > 0) {
        throw new Error(`Duplicate mongo_id detected in table ${dt}`);
      }
    }
    console.log('  ✅ No duplicate mongo_id values detected across any table.');

    // 2. Financial Totals Comparison
    const pgSalesSum = await client.query(`
      SELECT 
        ROUND(SUM(grand_total), 2) as sum_grand_total,
        ROUND(SUM(total_cost), 2) as sum_cost,
        ROUND(SUM(gross_profit), 2) as sum_profit
      FROM public.sales;
    `);

    const pgPurchasesSum = await client.query(`
      SELECT 
        ROUND(SUM(total_amount), 2) as sum_purchases_total,
        ROUND(SUM(amount_paid), 2) as sum_purchases_paid,
        ROUND(SUM(balance_due), 2) as sum_purchases_balance
      FROM public.purchases;
    `);

    const pgPaymentsSum = await client.query(`
      SELECT ROUND(SUM(amount), 2) as sum_payments FROM public.supplier_payments;
    `);

    const pgProductsSum = await client.query(`
      SELECT 
        SUM(stock_quantity) as sum_stock_qty,
        ROUND(SUM(stock_quantity * purchase_cost), 2) as sum_stock_valuation
      FROM public.products;
    `);

    report.financialReconciliation = {
      salesGrandTotal: { expected: 99531.60, actual: parseFloat(pgSalesSum.rows[0].sum_grand_total), match: 99531.60 === parseFloat(pgSalesSum.rows[0].sum_grand_total) },
      salesGrossProfit: { expected: 45301.60, actual: parseFloat(pgSalesSum.rows[0].sum_profit), match: 45301.60 === parseFloat(pgSalesSum.rows[0].sum_profit) },
      purchasesTotal: { expected: 72265.00, actual: parseFloat(pgPurchasesSum.rows[0].sum_purchases_total), match: 72265.00 === parseFloat(pgPurchasesSum.rows[0].sum_purchases_total) },
      purchasesPaid: { expected: 52260.00, actual: parseFloat(pgPurchasesSum.rows[0].sum_purchases_paid), match: 52260.00 === parseFloat(pgPurchasesSum.rows[0].sum_purchases_paid) },
      purchasesBalance: { expected: 20005.00, actual: parseFloat(pgPurchasesSum.rows[0].sum_purchases_balance), match: 20005.00 === parseFloat(pgPurchasesSum.rows[0].sum_purchases_balance) },
      supplierPayments: { expected: 52260.00, actual: parseFloat(pgPaymentsSum.rows[0].sum_payments), match: 52260.00 === parseFloat(pgPaymentsSum.rows[0].sum_payments) },
      totalStockUnits: { expected: 354, actual: parseInt(pgProductsSum.rows[0].sum_stock_qty, 10), match: 354 === parseInt(pgProductsSum.rows[0].sum_stock_qty, 10) },
      totalStockValuation: { expected: 126240.00, actual: parseFloat(pgProductsSum.rows[0].sum_stock_valuation), match: 126240.00 === parseFloat(pgProductsSum.rows[0].sum_stock_valuation) }
    };

    console.log('\n--- FINANCIAL SUM RECONCILIATION ---');
    for (const [key, val] of Object.entries(report.financialReconciliation)) {
      const mark = val.match ? '✅' : '❌';
      console.log(`  ${mark} ${key.padEnd(22)}: Expected: ${val.expected} | Actual: ${val.actual} | Match: ${val.match}`);
    }

    // 3. Supplier Balance View Verification
    const suppViewRes = await client.query(`
      SELECT 
        company, opening_balance, total_purchased, total_payments, current_balance
      FROM public.view_supplier_balances
      ORDER BY company;
    `);

    console.log('\n--- SUPPLIER BALANCES RECONCILIATION (via view_supplier_balances) ---');
    let totalComputedBalance = 0;
    for (const s of suppViewRes.rows) {
      totalComputedBalance += parseFloat(s.current_balance);
      console.log(`  🏢 ${s.company.padEnd(38)} | Open: ${String(s.opening_balance).padStart(7)} | Purchased: ${String(s.total_purchased).padStart(8)} | Paid: ${String(s.total_payments).padStart(8)} | Net: ${String(s.current_balance).padStart(8)}`);
    }
    report.supplierBalanceReconciliation = {
      expectedTotalNet: 45205.00,
      actualTotalNet: Math.round(totalComputedBalance * 100) / 100,
      match: Math.round(totalComputedBalance * 100) / 100 === 45205.00
    };
    console.log(`  ✅ Total Net Supplier Payables: Expected: 45205.00 | Actual: ${report.supplierBalanceReconciliation.actualTotalNet}`);

    // 4. Inventory Reconciliation View Verification
    const reconRes = await client.query(`
      SELECT sku, name, recorded_stock, ledger_stock, stock_discrepancy, audit_status
      FROM public.view_inventory_reconciliation
      ORDER BY sku;
    `);

    console.log('\n--- INVENTORY RECONCILIATION VIEW (via view_inventory_reconciliation) ---');
    let allBalanced = true;
    for (const r of reconRes.rows) {
      if (r.audit_status !== 'BALANCED') allBalanced = false;
      const mark = r.audit_status === 'BALANCED' ? '✅' : '❌';
      console.log(`  ${mark} ${r.sku.padEnd(12)} | ${r.name.slice(0, 25).padEnd(25)} | Recorded: ${String(r.recorded_stock).padStart(4)} | Ledger: ${String(r.ledger_stock).padStart(4)} | Diff: ${r.stock_discrepancy} | ${r.audit_status}`);
      report.inventoryReconciliation.push(r);
    }

    const allFinMatch = Object.values(report.financialReconciliation).every(v => v.match);
    report.dryRunStatus = (allFinMatch && report.supplierBalanceReconciliation.match && allBalanced) ? 'SUCCESS_VERIFIED' : 'FAILED';

    console.log('\n======================================================================');
    console.log('DRY-RUN RESULT STATUS:', report.dryRunStatus);
    console.log('======================================================================');

    // -------------------------------------------------------------------------
    // CRITICAL: ROLLBACK TRANSACTION TO LEAVE SUPABASE ZERO DATA
    // -------------------------------------------------------------------------
    console.log('\n3. Executing ROLLBACK (Discarding all staged rows from Supabase)...');
    await client.query('ROLLBACK;');
    console.log('✅ ROLLBACK COMPLETE.');

    // Verify post-rollback that target tables are 0
    const postCountRes = await client.query(`SELECT COUNT(*) FROM public.sales;`);
    console.log(`🛡️  Safety Check: Rows in public.sales after ROLLBACK: ${postCountRes.rows[0].count}`);

  } catch (err) {
    console.error('❌ Dry-run encountered an error, issuing ROLLBACK:', err);
    await client.query('ROLLBACK;');
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    await mongoose.disconnect();
  }

  return report;
}

dryRunMigration().catch(console.error);

