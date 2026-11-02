/**
 * StockWise / MFEF - Supabase PostgreSQL Schema Runner & Verification Utility
 * Phase 3: Automated Table Provisioning & Verification
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool, testPostgresConnection } = require('../config/postgres');

async function applySchema() {
  console.log('====================================================');
  console.log('StockWise / MFEF - Supabase Schema Execution & Verification');
  console.log('====================================================');

  // 1. Verify Connection first
  const connTest = await testPostgresConnection();
  if (!connTest.connected) {
    console.error('❌ Connection failed:', connTest.message);
    process.exit(1);
  }
  console.log(`✅ Connected to database: ${connTest.database} (${connTest.version})`);

  const schemaPath = path.join(__dirname, '../db/supabase_schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.error(`❌ Schema file not found at: ${schemaPath}`);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(schemaPath, 'utf8');
  console.log(`📄 Loaded schema SQL (${sqlContent.length} bytes)`);

  const client = await pool.connect();
  try {
    console.log('🚀 Executing schema statements on Supabase PostgreSQL...');
    await client.query(sqlContent);
    console.log('✅ Schema executed successfully!');

    // 2. Query and verify all tables in public schema
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

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

    const foundTables = tablesRes.rows.map((r) => r.table_name);
    console.log('\n----------------------------------------------------');
    console.log('📋 VERIFICATION: Base Tables in "public" schema:');
    console.log('----------------------------------------------------');
    let allTablesPresent = true;
    for (const t of expectedTables) {
      if (foundTables.includes(t)) {
        console.log(`  [OK] Table: ${t}`);
      } else {
        console.log(`  [MISSING] Table: ${t}`);
        allTablesPresent = false;
      }
    }

    // 3. Query and verify all views in public schema
    const viewsRes = await client.query(`
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    const expectedViews = [
      'view_supplier_balances',
      'view_product_details',
      'view_inventory_reconciliation'
    ];

    const foundViews = viewsRes.rows.map((r) => r.table_name);
    console.log('\n----------------------------------------------------');
    console.log('👁️  VERIFICATION: Views in "public" schema:');
    console.log('----------------------------------------------------');
    let allViewsPresent = true;
    for (const v of expectedViews) {
      if (foundViews.includes(v)) {
        console.log(`  [OK] View: ${v}`);
      } else {
        console.log(`  [MISSING] View: ${v}`);
        allViewsPresent = false;
      }
    }

    // 4. Query and verify indexes
    const indexRes = await client.query(`
      SELECT tablename, indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname;
    `);
    console.log(`\n🔍 Found ${indexRes.rows.length} total indexes in "public" schema.`);

    console.log('====================================================');
    if (allTablesPresent && allViewsPresent) {
      console.log('🎉 STATUS: PHASE 3 SUCCESS - ALL 11 TABLES & 3 VIEWS PROVISIONED');
    } else {
      console.log('⚠️  STATUS: SOME TABLES OR VIEWS WERE NOT FOUND');
    }
    console.log('====================================================');
  } catch (err) {
    console.error('❌ Schema execution error:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

applySchema();
