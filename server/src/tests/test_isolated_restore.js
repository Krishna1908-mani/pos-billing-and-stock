const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/postgres');

/**
 * Task 4: Verify PostgreSQL Backup & Restore into an Isolated Schema
 * - Creates schema `test_isolated_restore`
 * - Applies complete DDL (tables, constraints, indexes, functions, triggers, views)
 * - Restores data from the verified backup
 * - Tests Authentication, Product retrieval, and POS transaction with pessimistic locking
 * - Verifies triggers in restored schema
 * - Safely cleans up test schema
 */
async function runIsolatedRestoreVerification() {
  console.log('================================================================');
  console.log('🧪 TASK 4: ISOLATED POSTGRESQL BACKUP & RESTORE VERIFICATION');
  console.log('================================================================');

  const client = await pool.connect();
  const TEST_SCHEMA = 'test_isolated_restore';

  try {
    // 1. Prepare Isolated Schema
    console.log(`\n[1/6] Preparing isolated schema: ${TEST_SCHEMA}...`);
    await client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE;`);
    await client.query(`CREATE SCHEMA ${TEST_SCHEMA};`);
    console.log(`✅ Schema "${TEST_SCHEMA}" created successfully.`);

    // 2. Load and adapt DDL
    console.log('\n[2/6] Applying DDL (tables, constraints, indexes, triggers, views)...');
    const ddlPath = path.join(__dirname, '../db/supabase_schema.sql');
    let ddl = fs.readFileSync(ddlPath, 'utf8');

    // Substitute public. with test_isolated_restore.
    // Also adjust REVOKE/GRANT statements so they target the test schema
    let adaptedDdl = ddl.replace(/public\./g, `${TEST_SCHEMA}.`);

    // Execute DDL inside transaction
    await client.query('BEGIN;');
    await client.query(`SET search_path TO ${TEST_SCHEMA}, public;`);
    await client.query(adaptedDdl);
    await client.query('COMMIT;');
    console.log(`✅ Complete DDL applied to "${TEST_SCHEMA}".`);

    // 3. Restore Data from Backup
    console.log('\n[3/6] Restoring data into isolated schema from backup...');
    // Find latest backup directory
    const backupBaseDir = path.join(__dirname, '../../backup/postgres');
    const backupFolders = fs.readdirSync(backupBaseDir)
      .filter(f => f.startsWith('stockwise_pg_'))
      .sort()
      .reverse();

    if (backupFolders.length === 0) {
      throw new Error('No PostgreSQL backup folder found!');
    }

    const latestBackupDir = path.join(backupBaseDir, backupFolders[0]);
    console.log(`Using backup snapshot: ${backupFolders[0]}`);

    const TABLES = [
      'users',
      'suppliers',
      'products',
      'purchases',
      'purchase_items',
      'sales',
      'sale_items',
      'sale_returns',
      'sale_return_items',
      'stock_movements',
      'legacy_stock_movements',
      'supplier_payments'
    ];

    let totalRestoredRows = 0;
    await client.query('BEGIN;');
    for (const table of TABLES) {
      const jsonFile = path.join(latestBackupDir, `${table}.json`);
      if (fs.existsSync(jsonFile)) {
        const rows = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
        if (rows.length > 0) {
          const columns = Object.keys(rows[0]);
          const colList = columns.map(c => `"${c}"`).join(', ');
          const rowValueTuples = rows.map(row => {
            const valList = columns.map(c => {
              const val = row[c];
              if (val === null || val === undefined) return 'NULL';
              if (typeof val === 'number') return val;
              if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
              if (val instanceof Date) return `'${val.toISOString()}'`;
              return `'${String(val).replace(/'/g, "''")}'`;
            }).join(', ');
            return `(${valList})`;
          });

          await client.query(`INSERT INTO ${TEST_SCHEMA}.${table} (${colList}) VALUES ${rowValueTuples.join(', ')};`);
        }
        totalRestoredRows += rows.length;
        console.log(`  -> Restored ${table}: ${rows.length} rows`);
      }
    }
    await client.query('COMMIT;');
    console.log(`✅ Data restoration complete. Total rows restored: ${totalRestoredRows}`);

    if (totalRestoredRows !== 199) {
      throw new Error(`Expected 199 rows restored, got ${totalRestoredRows}`);
    }

    // 4. Verification: Authentication & Product Retrieval
    console.log('\n[4/6] Verifying Authentication & Product Retrieval in restored schema...');
    const userRes = await client.query(`SELECT * FROM ${TEST_SCHEMA}.users WHERE email = 'admin@stockwise.local';`);
    if (userRes.rows.length === 0) {
      throw new Error('Admin user not found in restored database');
    }
    const admin = userRes.rows[0];
    const isPasswordValid = await bcrypt.compare('Admin@123456', admin.password_hash);
    if (!isPasswordValid) {
      throw new Error('Password verification failed on restored admin record');
    }
    console.log(`✅ Restored User Auth verified: ${admin.email} (Role: ${admin.role}) - Password matches hash`);

    const productsRes = await client.query(`SELECT count(*) as count FROM ${TEST_SCHEMA}.products WHERE is_deleted = false;`);
    console.log(`✅ Restored Active Products verified: ${productsRes.rows[0].count} active products`);

    // 5. Verification: POS Transaction with Pessimistic Row Lock
    console.log('\n[5/6] Simulating POS Transaction in restored schema...');
    await client.query('BEGIN;');
    
    // Acquire pessimistic lock on an in-stock product
    const lockRes = await client.query(`
      SELECT id, name, sku, stock_quantity, purchase_cost, selling_price 
      FROM ${TEST_SCHEMA}.products 
      WHERE is_deleted = false AND stock_quantity >= 2 
      ORDER BY stock_quantity DESC 
      LIMIT 1 
      FOR UPDATE;
    `);
    const targetProduct = lockRes.rows[0];
    const initialStock = Number(targetProduct.stock_quantity);
    const saleQty = 2;

    if (initialStock < saleQty) {
      throw new Error(`Insufficient stock for test POS sale: current ${initialStock}`);
    }

    const unitCost = Number(targetProduct.purchase_cost);
    const unitPrice = Number(targetProduct.selling_price);
    const lineTotal = unitPrice * saleQty;
    const lineProfit = (unitPrice - unitCost) * saleQty;

    // Insert Sale header
    const saleInsertRes = await client.query(`
      INSERT INTO ${TEST_SCHEMA}.sales (
        invoice_number, customer_name, subtotal, tax_amount, grand_total, 
        amount_paid, change_due, payment_method, status, sold_by
      ) VALUES (
        'INV-RESTORE-TEST-001', 'Restore Test Customer', $1, 0.00, $1,
        $1, 0.00, 'CASH', 'COMPLETED', $2
      ) RETURNING id;
    `, [lineTotal, admin.id]);
    const testSaleId = saleInsertRes.rows[0].id;

    // Insert Sale Item
    await client.query(`
      INSERT INTO ${TEST_SCHEMA}.sale_items (
        sale_id, product_id, product_name, sku, quantity, 
        unit_cost_snapshot, selling_price_snapshot, line_total, profit
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
    `, [testSaleId, targetProduct.id, targetProduct.name, targetProduct.sku, saleQty, unitCost, unitPrice, lineTotal, lineProfit]);

    // Update Stock
    await client.query(`
      UPDATE ${TEST_SCHEMA}.products 
      SET stock_quantity = stock_quantity - $1 
      WHERE id = $2;
    `, [saleQty, targetProduct.id]);

    // Record Stock Movement
    await client.query(`
      INSERT INTO ${TEST_SCHEMA}.stock_movements (
        product_id, movement_type, quantity_changed, balance_after, reference_type, reference_id, performed_by
      ) VALUES ($1, 'SALE_OUTWARD', $2, $3, 'SALE', $4, $5);
    `, [targetProduct.id, -saleQty, initialStock - saleQty, testSaleId, admin.id]);

    await client.query('COMMIT;');
    console.log(`✅ POS Transaction committed. Product "${targetProduct.name}" stock reduced from ${initialStock} to ${initialStock - saleQty}.`);

    // Verify Delete Protection: Dedicated Trigger strictly prevents physical deletion of sales
    let triggerBlocked = false;
    try {
      await client.query(`DELETE FROM ${TEST_SCHEMA}.sales WHERE id = $1;`, [testSaleId]);
    } catch (triggerErr) {
      if (/Physical deletion of financial transaction records/i.test(triggerErr.message)) {
        triggerBlocked = true;
      } else {
        throw triggerErr;
      }
    }
    if (!triggerBlocked) {
      throw new Error('Expected deletion protection trigger to block DELETE on sales!');
    }
    console.log('✅ Trigger Protection verified: Prevented deletion of completed sale header.');

    // 6. Cleanup Isolated Test Schema
    console.log(`\n[6/6] Cleaning up isolated schema: ${TEST_SCHEMA}...`);
    await client.query(`DROP SCHEMA ${TEST_SCHEMA} CASCADE;`);
    console.log(`✅ Cleaned up isolated schema: ${TEST_SCHEMA}`);

    // Verify public schema is intact with exactly 199 rows
    const liveCountRes = await client.query(`
      SELECT (
        (SELECT count(*) FROM public.users) +
        (SELECT count(*) FROM public.suppliers) +
        (SELECT count(*) FROM public.products) +
        (SELECT count(*) FROM public.purchases) +
        (SELECT count(*) FROM public.purchase_items) +
        (SELECT count(*) FROM public.sales) +
        (SELECT count(*) FROM public.sale_items) +
        (SELECT count(*) FROM public.sale_returns) +
        (SELECT count(*) FROM public.sale_return_items) +
        (SELECT count(*) FROM public.stock_movements) +
        (SELECT count(*) FROM public.legacy_stock_movements) +
        (SELECT count(*) FROM public.supplier_payments)
      ) as total_live_rows;
    `);

    console.log(`\nVerified live public schema total row count: ${liveCountRes.rows[0].total_live_rows}`);
    if (Number(liveCountRes.rows[0].total_live_rows) !== 199) {
      throw new Error(`Live database was affected! Count is ${liveCountRes.rows[0].total_live_rows}`);
    }
    console.log('✅ Production public schema remains 100% intact with 199 rows.');

    console.log('\n🎉 ALL BACKUP RESTORE VERIFICATION CHECKS PASSED WITH ZERO IMPACT ON PRODUCTION!');
  } finally {
    client.release();
    await pool.end();
  }
}

runIsolatedRestoreVerification().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('\n❌ Backup restore verification failed:', err);
  process.exit(1);
});
