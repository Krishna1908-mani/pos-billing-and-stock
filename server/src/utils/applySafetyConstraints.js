/**
 * StockWise / MFEF - Phase 3 Safety Constraints & Transaction Deletion Protection
 * 1. Changes FKs to ON DELETE RESTRICT
 * 2. Implements database-level triggers to prohibit physical deletion of financial transaction headers
 */

const path = require('path');
require(path.join(__dirname, '../../node_modules/dotenv')).config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/postgres');

async function applySafetyConstraints() {
  console.log('====================================================');
  console.log('StockWise / MFEF - Applying Safety Constraints (RESTRICT)');
  console.log('====================================================');

  const client = await pool.connect();

  try {
    console.log('1. Starting PostgreSQL transaction (BEGIN)...');
    await client.query('BEGIN;');

    // 1. Update foreign key constraints to ON DELETE RESTRICT
    console.log('2. Updating FK constraints on line items to ON DELETE RESTRICT...');

    await client.query(`
      ALTER TABLE public.purchase_items
        DROP CONSTRAINT IF EXISTS purchase_items_purchase_id_fkey,
        ADD CONSTRAINT purchase_items_purchase_id_fkey
          FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE RESTRICT;
    `);

    await client.query(`
      ALTER TABLE public.sale_items
        DROP CONSTRAINT IF EXISTS sale_items_sale_id_fkey,
        ADD CONSTRAINT sale_items_sale_id_fkey
          FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE RESTRICT;
    `);

    await client.query(`
      ALTER TABLE public.sale_return_items
        DROP CONSTRAINT IF EXISTS sale_return_items_return_id_fkey,
        ADD CONSTRAINT sale_return_items_return_id_fkey
          FOREIGN KEY (return_id) REFERENCES public.sale_returns(id) ON DELETE RESTRICT;
    `);

    // 2. Add header deletion prevention trigger
    console.log('3. Creating transaction header deletion prevention trigger...');
    await client.query(`
      CREATE OR REPLACE FUNCTION public.prevent_transaction_deletion()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'Physical deletion of financial transaction records (%) is prohibited. Transaction must be cancelled or voided instead.', TG_TABLE_NAME;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_prevent_sales_delete ON public.sales;
      CREATE TRIGGER trg_prevent_sales_delete
        BEFORE DELETE ON public.sales
        FOR EACH ROW EXECUTE FUNCTION public.prevent_transaction_deletion();

      DROP TRIGGER IF EXISTS trg_prevent_purchases_delete ON public.purchases;
      CREATE TRIGGER trg_prevent_purchases_delete
        BEFORE DELETE ON public.purchases
        FOR EACH ROW EXECUTE FUNCTION public.prevent_transaction_deletion();

      DROP TRIGGER IF EXISTS trg_prevent_sale_returns_delete ON public.sale_returns;
      CREATE TRIGGER trg_prevent_sale_returns_delete
        BEFORE DELETE ON public.sale_returns
        FOR EACH ROW EXECUTE FUNCTION public.prevent_transaction_deletion();
    `);

    // 3. Verify constraints
    console.log('4. Verifying constraint delete rules in information_schema...');
    const verifyRes = await client.query(`
      SELECT
        tc.table_name as source_table,
        kcu.column_name as fk_column,
        ccu.table_name AS target_table,
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
      WHERE tc.table_name IN ('purchase_items', 'sale_items', 'sale_return_items')
        AND ccu.table_name IN ('purchases', 'sales', 'sale_returns')
      ORDER BY tc.table_name;
    `);

    console.log('\nVerified Constraint Rules:');
    let allRestrict = true;
    for (const row of verifyRes.rows) {
      console.log(`  ${row.source_table}.${row.fk_column} -> ${row.target_table} [DELETE RULE: ${row.delete_rule}]`);
      if (row.delete_rule !== 'RESTRICT') {
        allRestrict = false;
      }
    }

    if (!allRestrict || verifyRes.rows.length !== 3) {
      throw new Error('Not all 3 constraints were set to RESTRICT');
    }

    // 4. Verify trigger prevents deleting a transaction header with NO line items
    console.log('\n5. Verifying trigger blocks physical deletion of headers with 0 line items...');
    await client.query(`SAVEPOINT test_del_savepoint;`);
    
    const testSaleRes = await client.query(`
      INSERT INTO public.sales (invoice_number, customer_name, subtotal, grand_total, total_cost, gross_profit)
      VALUES ('TEST-DEL-VERIFY-001', 'Test Customer', 100, 100, 50, 50)
      RETURNING id;
    `);
    const testSaleId = testSaleRes.rows[0].id;

    let deleteBlocked = false;
    try {
      await client.query(`DELETE FROM public.sales WHERE id = $1;`, [testSaleId]);
    } catch (delErr) {
      if (delErr.message.includes('Physical deletion of financial transaction records')) {
        deleteBlocked = true;
        console.log(`  ✅ Successfully blocked physical deletion: "${delErr.message.trim()}"`);
      } else {
        throw delErr;
      }
    }

    if (!deleteBlocked) {
      throw new Error('Deletion was NOT blocked by trigger on header with 0 line items!');
    }

    // Rollback to savepoint: this cleanly discards the test insert and aborted delete without disabling any triggers!
    await client.query(`ROLLBACK TO SAVEPOINT test_del_savepoint;`);
    console.log('  ✅ Savepoint rolled back cleanly (test row discarded, schema pristine).');

    // 5. Commit transaction
    console.log('\n6. Committing transaction (COMMIT)...');
    await client.query('COMMIT;');

    console.log('====================================================');
    console.log('🎉 SUCCESS: All 3 constraints set to RESTRICT & triggers active!');
    console.log('====================================================');
  } catch (err) {
    console.error('❌ Migration failed, issuing ROLLBACK:', err);
    await client.query('ROLLBACK;');
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

applySafetyConstraints();
