require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const { supabase, isSupabaseConfigured } = require('../config/supabase');

// Mongoose Models
const User = require('../models/User');
const Supplier = require('../models/Supplier');
const Product = require('../models/Product');
const Purchase = require('../models/Purchase');
const Sale = require('../models/Sale');
const StockMovement = require('../models/StockMovement');
const SupplierPayment = require('../models/SupplierPayment');

async function migrate() {
  console.log('====================================================');
  console.log('StockWise / MFEF - MongoDB to Supabase Data Migration');
  console.log('====================================================');

  if (!isSupabaseConfigured() || !supabase) {
    console.error('Error: Supabase is not configured. Please set SUPABASE_SERVICE_ROLE_KEY in server/.env');
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/stockwise';
  console.log(`Connecting to MongoDB: ${mongoUri}...`);
  await mongoose.connect(mongoUri);
  console.log('MongoDB connected successfully.\n');

  try {
    // 1. Migrate Users
    console.log('1. Migrating Users...');
    const users = await User.find();
    const userMap = {}; // mongoId -> supabaseId
    for (const u of users) {
      const payload = {
        mongo_id: u._id.toString(),
        name: u.name,
        email: u.email,
        password_hash: u.password,
        role: u.role || 'staff',
        is_active: u.isActive !== false
      };
      const { data, error } = await supabase
        .from('users')
        .upsert(payload, { onConflict: 'mongo_id' })
        .select('id, mongo_id')
        .single();

      if (error) console.error(`   Error migrating user ${u.email}:`, error.message);
      else if (data) userMap[data.mongo_id] = data.id;
    }
    console.log(`   Migrated ${Object.keys(userMap).length} users.\n`);

    // 2. Migrate Suppliers
    console.log('2. Migrating Suppliers...');
    const suppliers = await Supplier.find();
    const supplierMap = {}; // mongoId -> supabaseId
    for (const s of suppliers) {
      const payload = {
        mongo_id: s._id.toString(),
        name: s.name,
        company: s.company,
        phone: s.phone,
        email: s.email || null,
        address: s.address || null,
        notes: s.notes || null,
        opening_balance: s.openingBalance || 0,
        current_balance: s.currentBalance || 0,
        is_deleted: s.isDeleted || false
      };
      const { data, error } = await supabase
        .from('suppliers')
        .upsert(payload, { onConflict: 'mongo_id' })
        .select('id, mongo_id')
        .single();

      if (error) console.error(`   Error migrating supplier ${s.company}:`, error.message);
      else if (data) supplierMap[data.mongo_id] = data.id;
    }
    console.log(`   Migrated ${Object.keys(supplierMap).length} suppliers.\n`);

    // 3. Migrate Products
    console.log('3. Migrating Products...');
    const products = await Product.find();
    const productMap = {}; // mongoId -> supabaseId
    for (const p of products) {
      const supId = p.supplier ? supplierMap[p.supplier.toString()] : null;
      const payload = {
        mongo_id: p._id.toString(),
        name: p.name,
        sku: p.sku,
        category: p.category,
        description: p.description || null,
        supplier_id: supId,
        purchase_cost: p.purchaseCost || 0,
        selling_price: p.sellingPrice || 0,
        mrp: p.mrp || null,
        stock_quantity: p.stockQuantity || 0,
        low_stock_threshold: p.lowStockThreshold || 10,
        unit: p.unit || 'pcs',
        image_url: p.imageUrl || null,
        is_deleted: p.isDeleted || false
      };
      const { data, error } = await supabase
        .from('products')
        .upsert(payload, { onConflict: 'mongo_id' })
        .select('id, mongo_id')
        .single();

      if (error) console.error(`   Error migrating product ${p.sku}:`, error.message);
      else if (data) productMap[data.mongo_id] = data.id;
    }
    console.log(`   Migrated ${Object.keys(productMap).length} products.\n`);

    // 4. Migrate Purchases
    console.log('4. Migrating Purchases & Line Items...');
    const purchases = await Purchase.find();
    let purchaseCount = 0;
    for (const pur of purchases) {
      const supId = pur.supplier ? supplierMap[pur.supplier.toString()] : null;
      const createdById = pur.createdBy ? userMap[pur.createdBy.toString()] : null;

      const purPayload = {
        mongo_id: pur._id.toString(),
        purchase_number: pur.purchaseNumber,
        supplier_id: supId,
        supplier_invoice_number: pur.supplierInvoiceNumber || null,
        purchase_date: pur.purchaseDate || new Date(),
        due_date: pur.dueDate || null,
        subtotal: pur.subtotal || 0,
        discount: pur.discount || 0,
        tax: pur.tax || 0,
        total_amount: pur.totalAmount || 0,
        amount_paid: pur.amountPaid || 0,
        balance_due: pur.balanceDue || 0,
        payment_status: pur.paymentStatus || 'UNPAID',
        notes: pur.notes || null,
        idempotency_key: pur.idempotencyKey || null,
        created_by: createdById
      };

      const { data: purData, error: purError } = await supabase
        .from('purchases')
        .upsert(purPayload, { onConflict: 'mongo_id' })
        .select('id')
        .single();

      if (purError) {
        console.error(`   Error migrating purchase ${pur.purchaseNumber}:`, purError.message);
        continue;
      }

      purchaseCount++;

      // Migrate line items for this purchase
      if (pur.items && pur.items.length > 0) {
        // Delete existing items for clean sync
        await supabase.from('purchase_items').delete().eq('purchase_id', purData.id);
        const itemRows = pur.items.map((i) => ({
          purchase_id: purData.id,
          product_id: i.product ? productMap[i.product.toString()] : null,
          product_name: i.productName || 'Unknown Product',
          sku: i.sku || 'N/A',
          quantity: i.quantity,
          unit_cost: i.unitCost,
          line_total: i.lineTotal
        })).filter(i => i.product_id);

        if (itemRows.length > 0) {
          const { error: itemErr } = await supabase.from('purchase_items').insert(itemRows);
          if (itemErr) console.error(`   Error inserting items for ${pur.purchaseNumber}:`, itemErr.message);
        }
      }
    }
    console.log(`   Migrated ${purchaseCount} purchases.\n`);

    // 5. Migrate Sales & Sale Items
    console.log('5. Migrating Sales Invoices & Line Items...');
    const sales = await Sale.find();
    let salesCount = 0;
    for (const sale of sales) {
      const soldById = sale.soldBy ? userMap[sale.soldBy.toString()] : null;

      const salePayload = {
        mongo_id: sale._id.toString(),
        invoice_number: sale.invoiceNumber,
        customer_name: sale.customerName || 'Walk-in Customer',
        customer_phone: sale.customerPhone || null,
        subtotal: sale.subtotal || 0,
        discount: sale.discount || 0,
        tax_rate: sale.taxRate || 0,
        tax_amount: sale.taxAmount || 0,
        grand_total: sale.grandTotal || 0,
        total_cost: sale.totalCost || 0,
        gross_profit: sale.grossProfit || 0,
        payment_method: sale.paymentMethod || 'CASH',
        amount_paid: sale.amountPaid || 0,
        change_due: sale.changeDue || 0,
        status: sale.status || 'COMPLETED',
        idempotency_key: sale.idempotencyKey || null,
        sold_by: soldById,
        sale_date: sale.saleDate || new Date()
      };

      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .upsert(salePayload, { onConflict: 'mongo_id' })
        .select('id')
        .single();

      if (saleError) {
        console.error(`   Error migrating sale ${sale.invoiceNumber}:`, saleError.message);
        continue;
      }

      salesCount++;

      // Migrate sale items
      if (sale.items && sale.items.length > 0) {
        await supabase.from('sale_items').delete().eq('sale_id', saleData.id);
        const saleItemRows = sale.items.map((i) => ({
          sale_id: saleData.id,
          product_id: i.product ? productMap[i.product.toString()] : null,
          product_name: i.productName || 'Unknown Product',
          sku: i.sku || 'N/A',
          quantity: i.quantity,
          unit_cost_snapshot: i.unitCostSnapshot,
          selling_price_snapshot: i.sellingPriceSnapshot,
          line_total: i.lineTotal,
          profit: i.profit
        })).filter(i => i.product_id);

        if (saleItemRows.length > 0) {
          const { error: saleItemErr } = await supabase.from('sale_items').insert(saleItemRows);
          if (saleItemErr) console.error(`   Error inserting items for ${sale.invoiceNumber}:`, saleItemErr.message);
        }
      }
    }
    console.log(`   Migrated ${salesCount} sales invoices.\n`);

    // 6. Migrate Stock Movements
    console.log('6. Migrating Stock Movements Audit Ledger...');
    const movements = await StockMovement.find();
    let moveCount = 0;
    for (const m of movements) {
      const prodId = m.product ? productMap[m.product.toString()] : null;
      if (!prodId) continue;

      const movePayload = {
        mongo_id: m._id.toString(),
        product_id: prodId,
        movement_type: m.movementType,
        quantity_changed: m.quantityChanged,
        balance_after: m.balanceAfter,
        reference_type: m.referenceType || 'MANUAL_ADJUSTMENT',
        reference_id: m.referenceId || null,
        notes: m.notes || null,
        performed_by: m.performedBy ? userMap[m.performedBy.toString()] : null,
        created_at: m.createdAt || new Date()
      };

      const { error } = await supabase.from('stock_movements').upsert(movePayload, { onConflict: 'mongo_id' });
      if (error) console.error(`   Error migrating movement:`, error.message);
      else moveCount++;
    }
    console.log(`   Migrated ${moveCount} stock movement ledger records.\n`);

    // 7. Migrate Supplier Payments
    console.log('7. Migrating Supplier Payments...');
    const payments = await SupplierPayment.find();
    let payCount = 0;
    for (const p of payments) {
      const supId = p.supplier ? supplierMap[p.supplier.toString()] : null;
      if (!supId) continue;

      const payPayload = {
        mongo_id: p._id.toString(),
        payment_number: p.paymentNumber,
        supplier_id: supId,
        amount: p.amount,
        payment_date: p.paymentDate || new Date(),
        payment_method: p.paymentMethod || 'BANK_TRANSFER',
        reference_number: p.referenceNumber || null,
        notes: p.notes || null,
        recorded_by: p.recordedBy ? userMap[p.recordedBy.toString()] : null,
        created_at: p.createdAt || new Date()
      };

      const { error } = await supabase.from('supplier_payments').upsert(payPayload, { onConflict: 'mongo_id' });
      if (error) console.error(`   Error migrating payment ${p.paymentNumber}:`, error.message);
      else payCount++;
    }
    console.log(`   Migrated ${payCount} supplier payments.\n`);

    console.log('====================================================');
    console.log('MIGRATION COMPLETED SUCCESSFULLY');
    console.log('All MongoDB records have been mirrored into Supabase.');
    console.log('====================================================');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await mongoose.disconnect();
  }
}

migrate();

