/**
 * StockWise / MFEF - Phase 3 Detailed Schema & Permission Verifier
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/postgres');

async function verify() {
  const log = {
    timestamp: new Date().toISOString(),
    connection: {},
    rolePermissions: {},
    tables: {},
    views: {},
    foreignKeys: [],
    checkConstraints: [],
    indexesCount: 0,
    overallStatus: 'UNKNOWN'
  };

  const client = await pool.connect();
  try {
    // 1. Connection & User Info
    const userRes = await client.query(`
      SELECT 
        CURRENT_USER as current_user, 
        CURRENT_DATABASE() as current_database,
        session_user,
        version() as pg_version;
    `);
    log.connection = userRes.rows[0];

    // 2. Table Verification & Role Permissions
    const expectedTables = [
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
      'supplier_payments'
    ];

    for (const table of expectedTables) {
      // Check privileges for CURRENT_USER
      const privRes = await client.query(`
        SELECT 
          has_table_privilege(CURRENT_USER, 'public.${table}', 'SELECT') as can_select,
          has_table_privilege(CURRENT_USER, 'public.${table}', 'INSERT') as can_insert,
          has_table_privilege(CURRENT_USER, 'public.${table}', 'UPDATE') as can_update,
          has_table_privilege(CURRENT_USER, 'public.${table}', 'DELETE') as can_delete;
      `);

      // Check column count
      const colRes = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `, [table]);

      log.tables[table] = {
        exists: colRes.rows.length > 0,
        columnCount: colRes.rows.length,
        columns: colRes.rows.map(c => c.column_name),
        permissions: privRes.rows[0]
      };
    }

    // 3. Views Verification
    const expectedViews = [
      'view_supplier_balances',
      'view_product_details',
      'view_inventory_reconciliation'
    ];

    for (const view of expectedViews) {
      const vRes = await client.query(`
        SELECT COUNT(*) as cnt 
        FROM information_schema.views 
        WHERE table_schema = 'public' AND table_name = $1;
      `, [view]);

      // Test query the view with LIMIT 0 to ensure SQL syntax inside view is 100% valid
      let queryable = false;
      try {
        await client.query(`SELECT * FROM public.${view} LIMIT 0;`);
        queryable = true;
      } catch (err) {
        queryable = false;
      }

      log.views[view] = {
        exists: parseInt(vRes.rows[0].cnt, 10) > 0,
        queryable
      };
    }

    // 4. Foreign Keys Verification
    const fkRes = await client.query(`
      SELECT
        tc.table_name as source_table,
        kcu.column_name as fk_column,
        ccu.table_name AS target_table,
        ccu.column_name AS pk_column,
        rc.delete_rule
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
      ORDER BY tc.table_name, kcu.column_name;
    `);
    log.foreignKeys = fkRes.rows;

    // 5. Check Constraints Verification
    const chkRes = await client.query(`
      SELECT 
        conrelid::regclass::text AS table_name,
        conname AS constraint_name,
        pg_get_constraintdef(c.oid) AS constraint_definition
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE contype = 'c' AND n.nspname = 'public'
      ORDER BY conrelid::regclass::text, conname;
    `);
    log.checkConstraints = chkRes.rows;

    // 6. Indexes count
    const idxRes = await client.query(`
      SELECT COUNT(*) as cnt 
      FROM pg_indexes 
      WHERE schemaname = 'public';
    `);
    log.indexesCount = parseInt(idxRes.rows[0].cnt, 10);

    const allTablesOk = Object.values(log.tables).every(t => t.exists && t.permissions.can_select && t.permissions.can_insert);
    const allViewsOk = Object.values(log.views).every(v => v.exists && v.queryable);

    log.overallStatus = (allTablesOk && allViewsOk) ? 'SUCCESS_VERIFIED' : 'FAILED';

    const logPath = path.join(__dirname, '../db/phase3_execution_log.json');
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2), 'utf8');
    console.log(`Log saved to: ${logPath}`);
    console.log('Overall Status:', log.overallStatus);
    console.log(`Tables Verified: ${Object.keys(log.tables).length}`);
    console.log(`Views Verified: ${Object.keys(log.views).length}`);
    console.log(`Foreign Keys Verified: ${log.foreignKeys.length}`);
    console.log(`Check Constraints Verified: ${log.checkConstraints.length}`);
    console.log(`Indexes Verified: ${log.indexesCount}`);
  } catch (err) {
    console.error('Error during verification:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

verify();

