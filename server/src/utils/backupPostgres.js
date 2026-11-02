/**
 * StockWise / MFEF - Dedicated Supabase PostgreSQL Backup & Verification Utility
 * Creates a complete snapshot of all tables with checksums, JSON dumps, and SQL restore script
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { query } = require('../repositories/db');
const { pool } = require('../config/postgres');

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

async function createPostgresBackup() {
  console.log('========================================================');
  console.log('StockWise / MFEF - Supabase PostgreSQL Backup Runner');
  console.log('========================================================');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, `../../backup/postgres/stockwise_pg_${timestamp}`);
  fs.mkdirSync(backupDir, { recursive: true });

  const manifest = {
    database: 'postgres (Supabase PostgreSQL 17.11)',
    timestamp: new Date().toISOString(),
    backupDirectory: backupDir,
    tables: {},
    totalRows: 0,
    financialFingerprints: {}
  };

  let sqlRestoreContent = `-- StockWise / MFEF PostgreSQL Restore Script\n-- Generated: ${new Date().toISOString()}\n\nBEGIN;\n\n`;

  for (const table of TABLES) {
    const res = await query(`SELECT * FROM public.${table} ORDER BY created_at ASC NULLS LAST;`);
    const rows = res.rows;
    const jsonPath = path.join(backupDir, `${table}.json`);
    const jsonString = JSON.stringify(rows, null, 2);
    fs.writeFileSync(jsonPath, jsonString, 'utf8');

    // Compute checksum
    const hash = crypto.createHash('sha256').update(jsonString).digest('hex');

    manifest.tables[table] = {
      rowCount: rows.length,
      fileSize: fs.statSync(jsonPath).size,
      sha256: hash,
      filePath: path.relative(path.join(__dirname, '../..'), jsonPath)
    };
    manifest.totalRows += rows.length;

    console.log(`  📦 Table: ${table.padEnd(25)} -> ${String(rows.length).padStart(4, ' ')} rows (${manifest.tables[table].fileSize} bytes) | sha256:${hash.slice(0, 10)}...`);

    // Generate SQL Insert script
    if (rows.length > 0) {
      const columns = Object.keys(rows[0]);
      sqlRestoreContent += `-- Table: ${table} (${rows.length} rows)\n`;
      for (const row of rows) {
        const colList = columns.map(c => `"${c}"`).join(', ');
        const valList = columns.map(c => {
          const val = row[c];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'number') return val;
          if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
          if (val instanceof Date) return `'${val.toISOString()}'`;
          return `'${String(val).replace(/'/g, "''")}'`;
        }).join(', ');
        sqlRestoreContent += `INSERT INTO public.${table} (${colList}) VALUES (${valList}) ON CONFLICT DO NOTHING;\n`;
      }
      sqlRestoreContent += `\n`;
    }
  }

  sqlRestoreContent += `COMMIT;\n`;
  const sqlPath = path.join(backupDir, `restore_data.sql`);
  fs.writeFileSync(sqlPath, sqlRestoreContent, 'utf8');

  // Compute financial fingerprints
  const [salesFin, purchFin, payFin] = await Promise.all([
    query(`SELECT COALESCE(SUM(grand_total), 0.00) as sum_sales FROM public.sales;`),
    query(`SELECT COALESCE(SUM(total_amount), 0.00) as sum_purchases FROM public.purchases;`),
    query(`SELECT COALESCE(SUM(amount), 0.00) as sum_payments FROM public.supplier_payments;`)
  ]);

  manifest.financialFingerprints = {
    sumSales: parseFloat(salesFin.rows[0].sum_sales),
    sumPurchases: parseFloat(purchFin.rows[0].sum_purchases),
    sumPayments: parseFloat(payFin.rows[0].sum_payments)
  };

  const manifestPath = path.join(backupDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log('--------------------------------------------------------');
  console.log(`✅ Backup Completed Successfully!`);
  console.log(`  Total Rows Backed Up: ${manifest.totalRows}`);
  console.log(`  Sales Total:          ₹${manifest.financialFingerprints.sumSales}`);
  console.log(`  Purchases Total:      ₹${manifest.financialFingerprints.sumPurchases}`);
  console.log(`  Payments Total:       ₹${manifest.financialFingerprints.sumPayments}`);
  console.log(`  Manifest File:        ${path.relative(process.cwd(), manifestPath)}`);
  console.log(`  SQL Restore Script:   ${path.relative(process.cwd(), sqlPath)}`);
  console.log('========================================================');

  await pool.end();
}

if (require.main === module) {
  createPostgresBackup().catch((err) => {
    console.error('❌ Backup Failed:', err);
    process.exit(1);
  });
}

module.exports = { createPostgresBackup };
