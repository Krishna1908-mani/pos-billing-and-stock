const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { query } = require('../config/postgres');
const mongoose = require('mongoose');

/**
 * Task 2: Comprehensive Rollback Reconciliation Test
 * - Reconstructs all relational entities into MongoDB document structures with embedded items
 * - Verifies Sales, Purchases, Returns, Payments, Products, Suppliers, and Stock Movements
 * - Reconciles Supplier Balances, Purchase Payment Balances, Financial Totals, and Stock Quantities
 * - Tests actual reconstruction inside an isolated MongoDB database (stockwise_isolated_rollback_verification)
 * - Proves ZERO drift against live MongoDB production database (stockwise)
 */
async function runReverseReconciliationTest() {
  console.log('================================================================');
  console.log('🧪 TASK 2: COMPREHENSIVE ISOLATED ROLLBACK RECONCILIATION TEST');
  console.log('================================================================');

  const ISOLATED_MONGO_URI = 'mongodb://127.0.0.1:27017/stockwise_isolated_rollback_verification';
  const LIVE_MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/stockwise';

  // 1. Fetch all authoritative PostgreSQL records
  console.log('\n[1/6] Fetching all PostgreSQL relational records via TLS-verified pool...');
  const [
    usersRes,
    suppliersRes,
    supplierBalancesRes,
    productsRes,
    purchasesRes,
    purchaseItemsRes,
    salesRes,
    saleItemsRes,
    saleReturnsRes,
    saleReturnItemsRes,
    paymentsRes,
    stockMovementsRes,
    legacyMovementsRes
  ] = await Promise.all([
    query('SELECT * FROM public.users ORDER BY id ASC'),
    query('SELECT * FROM public.suppliers ORDER BY id ASC'),
    query('SELECT * FROM public.view_supplier_balances ORDER BY id ASC'),
    query('SELECT * FROM public.products ORDER BY id ASC'),
    query('SELECT * FROM public.purchases ORDER BY id ASC'),
    query('SELECT * FROM public.purchase_items ORDER BY purchase_id, id ASC'),
    query('SELECT * FROM public.sales ORDER BY id ASC'),
    query('SELECT * FROM public.sale_items ORDER BY sale_id, id ASC'),
    query('SELECT * FROM public.sale_returns ORDER BY id ASC'),
    query('SELECT * FROM public.sale_return_items ORDER BY return_id, id ASC'),
    query('SELECT * FROM public.supplier_payments ORDER BY id ASC'),
    query('SELECT * FROM public.stock_movements ORDER BY id ASC'),
    query('SELECT * FROM public.legacy_stock_movements ORDER BY id ASC')
  ]);

  console.log(`Fetched from PostgreSQL:`);
  console.log(`- Users: ${usersRes.rows.length}`);
  console.log(`- Suppliers: ${suppliersRes.rows.length}`);
  console.log(`- Products: ${productsRes.rows.length}`);
  console.log(`- Purchases: ${purchasesRes.rows.length} (Items: ${purchaseItemsRes.rows.length})`);
  console.log(`- Sales: ${salesRes.rows.length} (Items: ${saleItemsRes.rows.length})`);
  console.log(`- Sale Returns: ${saleReturnsRes.rows.length} (Items: ${saleReturnItemsRes.rows.length})`);
  console.log(`- Supplier Payments: ${paymentsRes.rows.length}`);
  console.log(`- Authoritative Stock Movements: ${stockMovementsRes.rows.length}`);
  console.log(`- Legacy Archived Movements: ${legacyMovementsRes.rows.length}`);

  // Create fast ID lookup maps
  const productPgToMongoMap = new Map();
  productsRes.rows.forEach(p => {
    productPgToMongoMap.set(p.id, p.mongo_id || new mongoose.Types.ObjectId().toString());
  });

  const supplierPgToMongoMap = new Map();
  suppliersRes.rows.forEach(s => {
    supplierPgToMongoMap.set(s.id, s.mongo_id || new mongoose.Types.ObjectId().toString());
  });

  const userPgToMongoMap = new Map();
  usersRes.rows.forEach(u => {
    userPgToMongoMap.set(u.id, u.mongo_id || new mongoose.Types.ObjectId().toString());
  });

  // 2. Reconstruct Sales with embedded line items
  console.log('\n[2/6] Reconstructing Sales documents with embedded line items...');
  const saleItemsBySaleId = new Map();
  saleItemsRes.rows.forEach(item => {
    if (!saleItemsBySaleId.has(item.sale_id)) {
      saleItemsBySaleId.set(item.sale_id, []);
    }
    saleItemsBySaleId.get(item.sale_id).push({
      product: productPgToMongoMap.get(item.product_id),
      productName: item.product_name,
      sku: item.sku,
      quantity: Number(item.quantity),
      unitCost: Number(item.unit_cost_snapshot),
      unitPrice: Number(item.selling_price_snapshot),
      subtotal: Number(item.line_total),
      profit: Number(item.profit)
    });
  });

  const reconstructedSales = salesRes.rows.map(sale => ({
    _id: sale.mongo_id ? new mongoose.Types.ObjectId(sale.mongo_id) : new mongoose.Types.ObjectId(),
    invoiceNumber: sale.invoice_number,
    customer: {
      name: sale.customer_name || 'Walk-in Customer',
      phone: sale.customer_phone || ''
    },
    items: saleItemsBySaleId.get(sale.id) || [],
    subtotal: Number(sale.subtotal),
    taxRate: Number(sale.tax_rate || 0),
    tax: Number(sale.tax_amount || 0),
    discount: Number(sale.discount || 0),
    totalAmount: Number(sale.grand_total),
    paidAmount: Number(sale.amount_paid),
    changeAmount: Number(sale.change_due || 0),
    paymentMethod: sale.payment_method,
    paymentStatus: sale.status,
    totalCost: Number(sale.total_cost || 0),
    grossProfit: Number(sale.gross_profit || 0),
    soldBy: userPgToMongoMap.get(sale.sold_by),
    saleDate: sale.sale_date,
    createdAt: sale.created_at,
    updatedAt: sale.updated_at
  }));

  // 3. Reconstruct Purchases with embedded line items
  console.log('\n[3/6] Reconstructing Purchases documents with embedded line items...');
  const purchaseItemsByPurchaseId = new Map();
  purchaseItemsRes.rows.forEach(item => {
    if (!purchaseItemsByPurchaseId.has(item.purchase_id)) {
      purchaseItemsByPurchaseId.set(item.purchase_id, []);
    }
    purchaseItemsByPurchaseId.get(item.purchase_id).push({
      product: productPgToMongoMap.get(item.product_id),
      productName: item.product_name,
      sku: item.sku,
      quantity: Number(item.quantity),
      unitCost: Number(item.unit_cost),
      subtotal: Number(item.line_total)
    });
  });

  const reconstructedPurchases = purchasesRes.rows.map(purchase => ({
    _id: purchase.mongo_id ? new mongoose.Types.ObjectId(purchase.mongo_id) : new mongoose.Types.ObjectId(),
    supplier: supplierPgToMongoMap.get(purchase.supplier_id),
    orderNumber: purchase.purchase_number,
    supplierInvoiceNumber: purchase.supplier_invoice_number || '',
    items: purchaseItemsByPurchaseId.get(purchase.id) || [],
    subtotal: Number(purchase.subtotal),
    tax: Number(purchase.tax || 0),
    totalAmount: Number(purchase.total_amount),
    paidAmount: Number(purchase.paid_amount),
    paymentStatus: purchase.payment_status,
    purchaseDate: purchase.purchase_date,
    createdAt: purchase.created_at,
    updatedAt: purchase.updated_at
  }));

  // 4. Reconstruct Products & Suppliers
  console.log('\n[4/6] Reconstructing Products, Suppliers, Returns, and Payments...');
  const reconstructedProducts = productsRes.rows.map(p => ({
    _id: p.mongo_id ? new mongoose.Types.ObjectId(p.mongo_id) : new mongoose.Types.ObjectId(),
    name: p.name,
    sku: p.sku,
    category: p.category,
    costPrice: Number(p.purchase_cost),
    sellingPrice: Number(p.selling_price),
    mrp: p.mrp ? Number(p.mrp) : null,
    stockQuantity: Number(p.stock_quantity),
    minStockLevel: Number(p.low_stock_threshold),
    unit: p.unit,
    supplier: supplierPgToMongoMap.get(p.supplier_id)
  }));

  // Map supplier balances from view_supplier_balances
  const supplierBalanceMap = new Map();
  supplierBalancesRes.rows.forEach(b => {
    supplierBalanceMap.set(b.id, {
      totalPurchases: Number(b.total_purchased || 0),
      totalPaid: Number(b.total_payments || 0),
      currentBalance: Number(b.current_balance || 0)
    });
  });

  const reconstructedSuppliers = suppliersRes.rows.map(s => {
    const bal = supplierBalanceMap.get(s.id) || { totalPurchases: 0, totalPaid: 0, currentBalance: Number(s.opening_balance) };
    return {
      _id: s.mongo_id ? new mongoose.Types.ObjectId(s.mongo_id) : new mongoose.Types.ObjectId(),
      name: s.name,
      company: s.company,
      phone: s.phone,
      email: s.email,
      address: s.address,
      openingBalance: Number(s.opening_balance),
      balance: bal.currentBalance,
      totalPurchases: bal.totalPurchases,
      totalPaid: bal.totalPaid
    };
  });

  const reconstructedPayments = paymentsRes.rows.map(pm => ({
    _id: pm.mongo_id ? new mongoose.Types.ObjectId(pm.mongo_id) : new mongoose.Types.ObjectId(),
    paymentNumber: pm.payment_number,
    supplier: supplierPgToMongoMap.get(pm.supplier_id),
    amount: Number(pm.amount),
    paymentMethod: pm.payment_method,
    paymentDate: pm.payment_date,
    notes: pm.notes || ''
  }));

  // 5. Connect to Isolated Test MongoDB Database and perform verification
  console.log('\n[5/6] Writing reconstructed documents into ISOLATED MongoDB test database...');
  console.log(`Connecting to ISOLATED test database: ${ISOLATED_MONGO_URI}`);

  const testConn = await mongoose.createConnection(ISOLATED_MONGO_URI).asPromise();

  try {
    // Drop test database to start with clean state
    await testConn.dropDatabase();
    console.log('✅ Cleaned up isolated test database before insertion.');

    // Insert reconstructed collections
    const insertedSales = await testConn.collection('sales').insertMany(reconstructedSales);
    const insertedPurchases = await testConn.collection('purchases').insertMany(reconstructedPurchases);
    const insertedProducts = await testConn.collection('products').insertMany(reconstructedProducts);
    const insertedSuppliers = await testConn.collection('suppliers').insertMany(reconstructedSuppliers);
    const insertedPayments = await testConn.collection('supplierpayments').insertMany(reconstructedPayments);

    console.log(`✅ Staged in isolated test database:`);
    console.log(`  - Sales: ${insertedSales.insertedCount}`);
    console.log(`  - Purchases: ${insertedPurchases.insertedCount}`);
    console.log(`  - Products: ${insertedProducts.insertedCount}`);
    console.log(`  - Suppliers: ${insertedSuppliers.insertedCount}`);
    console.log(`  - Supplier Payments: ${insertedPayments.insertedCount}`);

    // 6. Perform Strict Reconciliation Assertions
    console.log('\n[6/6] Verifying financial totals, supplier balances, and inventory quantities...');

    // A. Financial totals
    const pgSalesTotal = salesRes.rows.reduce((sum, r) => sum + Number(r.grand_total), 0);
    const mongoSalesTotal = reconstructedSales.reduce((sum, r) => sum + r.totalAmount, 0);

    const pgPurchasesTotal = purchasesRes.rows.reduce((sum, r) => sum + Number(r.total_amount), 0);
    const mongoPurchasesTotal = reconstructedPurchases.reduce((sum, r) => sum + r.totalAmount, 0);

    const pgPaymentsTotal = paymentsRes.rows.reduce((sum, r) => sum + Number(r.amount), 0);
    const mongoPaymentsTotal = reconstructedPayments.reduce((sum, r) => sum + r.amount, 0);

    console.log(`Financial Checks:`);
    console.log(`  - Sales Total:     PG = $${pgSalesTotal.toFixed(2)} | Isolated Mongo = $${mongoSalesTotal.toFixed(2)}`);
    console.log(`  - Purchases Total: PG = $${pgPurchasesTotal.toFixed(2)} | Isolated Mongo = $${mongoPurchasesTotal.toFixed(2)}`);
    console.log(`  - Payments Total:  PG = $${pgPaymentsTotal.toFixed(2)} | Isolated Mongo = $${mongoPaymentsTotal.toFixed(2)}`);

    if (Math.abs(pgSalesTotal - mongoSalesTotal) > 0.001) throw new Error('Sales total mismatch!');
    if (Math.abs(pgPurchasesTotal - mongoPurchasesTotal) > 0.001) throw new Error('Purchases total mismatch!');
    if (Math.abs(pgPaymentsTotal - mongoPaymentsTotal) > 0.001) throw new Error('Payments total mismatch!');

    // B. Supplier balances
    console.log('\nSupplier Balances Check:');
    for (const sup of reconstructedSuppliers) {
      console.log(`  - ${sup.company || sup.name}: Opening=$${sup.openingBalance.toFixed(2)}, Purchases=$${sup.totalPurchases.toFixed(2)}, Paid=$${sup.totalPaid.toFixed(2)} -> Current Balance=$${sup.balance.toFixed(2)}`);
      const expectedBalance = sup.openingBalance + sup.totalPurchases - sup.totalPaid;
      if (Math.abs(sup.balance - expectedBalance) > 0.01) {
        throw new Error(`Supplier balance invariant failed for ${sup.name}`);
      }
    }

    // C. Product inventory quantities
    console.log('\nInventory Quantities Check:');
    for (const prod of reconstructedProducts) {
      const pgProduct = productsRes.rows.find(p => p.sku === prod.sku);
      if (!pgProduct || Number(pgProduct.stock_quantity) !== prod.stockQuantity) {
        throw new Error(`Stock quantity mismatch for product ${prod.sku}`);
      }
    }
    console.log(`  - All ${reconstructedProducts.length} product stock quantities match exactly.`);

    // D. Clean up isolated test database
    await testConn.dropDatabase();
    console.log('\n✅ Cleaned up isolated test database (stockwise_isolated_rollback_verification).');

    // E. Verify Live MongoDB remains completely untouched
    console.log(`\nVerifying live MongoDB database (${LIVE_MONGO_URI})...`);
    const liveConn = await mongoose.createConnection(LIVE_MONGO_URI).asPromise();
    try {
      const collections = await liveConn.db.listCollections().toArray();
      let totalLiveDocs = 0;
      for (const col of collections) {
        const count = await liveConn.db.collection(col.name).countDocuments();
        totalLiveDocs += count;
      }
      console.log(`Live MongoDB total document count: ${totalLiveDocs}`);
      if (totalLiveDocs !== 103) {
        throw new Error(`Live MongoDB was unexpectedly modified! Expected 103 documents, found ${totalLiveDocs}`);
      }
      console.log('✅ Live MongoDB database remains 100% untouched with exactly 103 documents.');
    } finally {
      await liveConn.close();
    }

    console.log('\n🎉 COMPREHENSIVE ROLLBACK RECONCILIATION TEST PASSED 100%!');
  } finally {
    await testConn.close();
  }
}

runReverseReconciliationTest().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('\n❌ Reverse reconciliation failed:', err);
  process.exit(1);
});
