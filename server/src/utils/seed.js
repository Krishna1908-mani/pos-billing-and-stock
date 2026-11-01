require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const Purchase = require('../models/Purchase');
const Sale = require('../models/Sale');
const StockMovement = require('../models/StockMovement');
const SupplierPayment = require('../models/SupplierPayment');
const SaleReturn = require('../models/SaleReturn');

const seedDatabase = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/stockwise';
    console.log(`[Seed] Connecting to MongoDB: ${mongoUri}`);
    await mongoose.connect(mongoUri);

    console.log('[Seed] Clearing existing collections for fresh demo environment...');
    await Promise.all([
      User.deleteMany({}),
      Product.deleteMany({}),
      Supplier.deleteMany({}),
      Purchase.deleteMany({}),
      Sale.deleteMany({}),
      SaleReturn.deleteMany({}),
      StockMovement.deleteMany({}),
      SupplierPayment.deleteMany({})
    ]);

    // 1. Create Admin and Staff Users
    console.log('[Seed] Creating demo users...');
    const adminUser = await User.create({
      name: process.env.ADMIN_NAME || 'Admin Owner',
      email: process.env.ADMIN_EMAIL || 'admin@stockwise.local',
      password: process.env.ADMIN_PASSWORD || 'Admin@123456',
      role: 'admin',
      isActive: true
    });

    const staffUser = await User.create({
      name: process.env.STAFF_NAME || 'Store Cashier',
      email: process.env.STAFF_EMAIL || 'staff@stockwise.local',
      password: process.env.STAFF_PASSWORD || 'Staff@123456',
      role: 'staff',
      isActive: true
    });

    console.log(`[Seed] Created Admin: ${adminUser.email} / Staff: ${staffUser.email}`);

    // 2. Create Suppliers
    console.log('[Seed] Creating suppliers...');
    const suppliers = await Supplier.insertMany([
      {
        name: 'Rajesh Sharma',
        company: 'Apex Electronics Distribution Ltd',
        phone: '+91 98200 11223',
        email: 'rajesh@apexelectronics.in',
        address: 'Plot 45, Okhla Industrial Area Phase III, New Delhi',
        notes: 'Leading distributor for audio, accessories, and peripheral electronics. 15-day credit terms.',
        openingBalance: 12500,
        isActive: true
      },
      {
        name: 'Sunita Rao',
        company: 'FreshMart Wholesale FMCG',
        phone: '+91 98450 33445',
        email: 'orders@freshmartwholesale.com',
        address: 'B-12 APMC Market Yard, Yeshwanthpur, Bengaluru',
        notes: 'Primary supplier for packaged groceries, beverages, and daily essentials. 7-day payment cycle.',
        openingBalance: 4500,
        isActive: true
      },
      {
        name: 'Vikram Mehta',
        company: 'Prime Office Supplies & Stationery',
        phone: '+91 98112 55667',
        email: 'sales@primeofficesupplies.co',
        address: '204 Nariman Point, Commercial Hub, Mumbai',
        notes: 'High-margin school and stationery goods. Offers 5% discount on prompt settlement.',
        openingBalance: 0,
        isActive: true
      },
      {
        name: 'Ananya Deshmukh',
        company: 'Zenith Home & Personal Care Ltd',
        phone: '+91 97654 77889',
        email: 'ananya@zenithcare.in',
        address: 'Unit 9, Bhosari MIDC, Pune',
        notes: 'Detergents, soaps, hygiene, and kitchen essentials.',
        openingBalance: 8200,
        isActive: true
      }
    ]);

    const [apexSupplier, freshmartSupplier, primeSupplier, zenithSupplier] = suppliers;

    // 3. Create Products across categories
    console.log('[Seed] Creating products...');
    const productsData = [
      // Electronics
      {
        name: 'Wireless Bluetooth Earbuds Pro',
        sku: 'ELEC-EP-001',
        category: 'Electronics',
        description: 'True wireless stereo earbuds with active noise cancellation and 28h battery case.',
        supplier: apexSupplier._id,
        purchaseCost: 850,
        sellingPrice: 1499,
        mrp: 1999,
        stockQuantity: 42,
        lowStockThreshold: 15,
        unit: 'pcs'
      },
      {
        name: 'Fast Charging Power Bank 20000mAh',
        sku: 'ELEC-PB-002',
        category: 'Electronics',
        description: '22.5W dual USB fast-charge power bank with digital battery indicator.',
        supplier: apexSupplier._id,
        purchaseCost: 920,
        sellingPrice: 1650,
        mrp: 2199,
        stockQuantity: 8, // Low Stock for alerts testing
        lowStockThreshold: 12,
        unit: 'pcs'
      },
      {
        name: 'Braided Type-C Fast Cable 1.5m',
        sku: 'ELEC-CB-003',
        category: 'Electronics',
        description: '60W durable nylon braided fast charging and data transfer cable.',
        supplier: apexSupplier._id,
        purchaseCost: 80,
        sellingPrice: 249,
        mrp: 399,
        stockQuantity: 0, // Out of Stock for alerts and restock testing
        lowStockThreshold: 20,
        unit: 'pcs'
      },
      {
        name: 'Smart Fitness Tracker Band 5',
        sku: 'ELEC-FT-004',
        category: 'Electronics',
        description: 'AMOLED color touch screen, heart rate, SpO2 sensor, 5ATM waterproof.',
        supplier: apexSupplier._id,
        purchaseCost: 1150,
        sellingPrice: 1999,
        mrp: 2499,
        stockQuantity: 18,
        lowStockThreshold: 10,
        unit: 'pcs'
      },
      // FMCG & Groceries
      {
        name: 'Organic Basmati Rice 5kg',
        sku: 'FMCG-RC-101',
        category: 'Groceries',
        description: 'Aged long-grain royal organic aromatic basmati rice.',
        supplier: freshmartSupplier._id,
        purchaseCost: 380,
        sellingPrice: 520,
        mrp: 590,
        stockQuantity: 65,
        lowStockThreshold: 25,
        unit: 'bag'
      },
      {
        name: 'Cold Pressed Virgin Coconut Oil 1L',
        sku: 'FMCG-OL-102',
        category: 'Groceries',
        description: '100% pure cold-pressed extra virgin culinary coconut oil.',
        supplier: freshmartSupplier._id,
        purchaseCost: 260,
        sellingPrice: 380,
        mrp: 420,
        stockQuantity: 32,
        lowStockThreshold: 15,
        unit: 'bottle'
      },
      {
        name: 'Roasted California Almonds 500g',
        sku: 'FMCG-NT-103',
        category: 'Groceries',
        description: 'Premium lightly salted and oven-roasted crunchy whole almonds.',
        supplier: freshmartSupplier._id,
        purchaseCost: 320,
        sellingPrice: 480,
        mrp: 550,
        stockQuantity: 7, // Low Stock
        lowStockThreshold: 15,
        unit: 'pack'
      },
      {
        name: 'Artisan Dark Roast Coffee Beans 250g',
        sku: 'FMCG-CF-104',
        category: 'Groceries',
        description: 'Single-origin Coorg arabica dark roasted whole coffee beans.',
        supplier: freshmartSupplier._id,
        purchaseCost: 190,
        sellingPrice: 310,
        mrp: 350,
        stockQuantity: 28,
        lowStockThreshold: 10,
        unit: 'pack'
      },
      // Stationery
      {
        name: 'Hardbound Executive Journal A5',
        sku: 'STAT-JN-201',
        category: 'Stationery',
        description: '100gsm acid-free dotted paper notebook with ribbon bookmark and pen loop.',
        supplier: primeSupplier._id,
        purchaseCost: 140,
        sellingPrice: 299,
        mrp: 399,
        stockQuantity: 50,
        lowStockThreshold: 15,
        unit: 'pcs'
      },
      {
        name: 'Precision Metal Rollerball Pen (Pack of 3)',
        sku: 'STAT-PN-202',
        category: 'Stationery',
        description: '0.5mm smooth black quick-dry liquid gel rollerball pens.',
        supplier: primeSupplier._id,
        purchaseCost: 95,
        sellingPrice: 199,
        mrp: 249,
        stockQuantity: 44,
        lowStockThreshold: 20,
        unit: 'pack'
      },
      // Personal Care & Household
      {
        name: 'Natural Tea Tree Face Wash 150ml',
        sku: 'CARE-FW-301',
        category: 'Personal Care',
        description: 'Gentle exfoliating anti-acne herbal daily facial cleanser.',
        supplier: zenithSupplier._id,
        purchaseCost: 120,
        sellingPrice: 249,
        mrp: 299,
        stockQuantity: 38,
        lowStockThreshold: 12,
        unit: 'bottle'
      },
      {
        name: 'Biodegradable Laundry Detergent 2L',
        sku: 'CARE-DT-302',
        category: 'Household',
        description: 'Eco-friendly phosphate-free concentrated liquid fabric wash.',
        supplier: zenithSupplier._id,
        purchaseCost: 280,
        sellingPrice: 450,
        mrp: 499,
        stockQuantity: 22,
        lowStockThreshold: 10,
        unit: 'bottle'
      }
    ];

    const products = await Product.insertMany(productsData);
    console.log(`[Seed] Created ${products.length} products.`);

    // 4. Initial Stock Movements (Opening Stock)
    console.log('[Seed] Registering opening stock movements...');
    for (const p of products) {
      if (p.stockQuantity > 0) {
        await StockMovement.create({
          product: p._id,
          movementType: 'OPENING_STOCK',
          quantityChanged: p.stockQuantity,
          balanceAfter: p.stockQuantity,
          referenceType: 'INITIAL_IMPORT',
          referenceId: `INIT-${p.sku}`,
          notes: 'Initial inventory audit baseline',
          performedBy: adminUser._id
        });
      }
    }

    // 5. Create Realistic Purchases
    console.log('[Seed] Generating purchase orders and inward shipments...');
    const now = new Date();
    const purchaseRecords = [
      {
        purchaseNumber: 'PUR-20261001-0001',
        supplier: apexSupplier._id,
        supplierInvoiceNumber: 'APX-INV-8891',
        purchaseDate: new Date(now.getTime() - 25 * 86400000),
        dueDate: new Date(now.getTime() - 10 * 86400000), // Overdue
        items: [
          {
            product: products[0]._id,
            productName: products[0].name,
            sku: products[0].sku,
            quantity: 30,
            unitCost: 850,
            lineTotal: 25500
          },
          {
            product: products[1]._id,
            productName: products[1].name,
            sku: products[1].sku,
            quantity: 15,
            unitCost: 920,
            lineTotal: 13800
          }
        ],
        subtotal: 39300,
        discount: 1000,
        tax: 3830,
        totalAmount: 42130,
        amountPaid: 30000,
        balanceDue: 12130,
        paymentStatus: 'PARTIAL',
        notes: 'Monthly batch inward of fast moving audio electronics',
        createdBy: adminUser._id
      },
      {
        purchaseNumber: 'PUR-20261010-0002',
        supplier: freshmartSupplier._id,
        supplierInvoiceNumber: 'FM-7741',
        purchaseDate: new Date(now.getTime() - 18 * 86400000),
        dueDate: new Date(now.getTime() + 5 * 86400000), // Upcoming due
        items: [
          {
            product: products[4]._id,
            productName: products[4].name,
            sku: products[4].sku,
            quantity: 40,
            unitCost: 380,
            lineTotal: 15200
          },
          {
            product: products[5]._id,
            productName: products[5].name,
            sku: products[5].sku,
            quantity: 25,
            unitCost: 260,
            lineTotal: 6500
          }
        ],
        subtotal: 21700,
        discount: 500,
        tax: 1060,
        totalAmount: 22260,
        amountPaid: 22260,
        balanceDue: 0,
        paymentStatus: 'PAID',
        notes: 'Groceries restock batch for festive demand',
        createdBy: adminUser._id
      },
      {
        purchaseNumber: 'PUR-20261020-0003',
        supplier: primeSupplier._id,
        supplierInvoiceNumber: 'PRIME-BILL-409',
        purchaseDate: new Date(now.getTime() - 8 * 86400000),
        dueDate: new Date(now.getTime() + 14 * 86400000),
        items: [
          {
            product: products[8]._id,
            productName: products[8].name,
            sku: products[8].sku,
            quantity: 35,
            unitCost: 140,
            lineTotal: 4900
          },
          {
            product: products[9]._id,
            productName: products[9].name,
            sku: products[9].sku,
            quantity: 30,
            unitCost: 95,
            lineTotal: 2850
          }
        ],
        subtotal: 7750,
        discount: 250,
        tax: 375,
        totalAmount: 7875,
        amountPaid: 0,
        balanceDue: 7875,
        paymentStatus: 'UNPAID',
        notes: 'Corporate stationery batch',
        createdBy: adminUser._id
      }
    ];

    const purchases = await Purchase.insertMany(purchaseRecords);
    console.log(`[Seed] Created ${purchases.length} purchase invoices.`);

    // 6. Record Supplier Payments
    console.log('[Seed] Recording supplier payments...');
    await SupplierPayment.insertMany([
      {
        paymentNumber: 'PAY-20261005-0001',
        supplier: apexSupplier._id,
        purchase: purchases[0]._id,
        amount: 30000,
        paymentDate: new Date(now.getTime() - 22 * 86400000),
        paymentMethod: 'BANK_TRANSFER',
        referenceNumber: 'NEFT-AXIS-998822',
        notes: 'Advance part payment for electronic earbuds invoice',
        recordedBy: adminUser._id
      },
      {
        paymentNumber: 'PAY-20261012-0002',
        supplier: freshmartSupplier._id,
        purchase: purchases[1]._id,
        amount: 22260,
        paymentDate: new Date(now.getTime() - 16 * 86400000),
        paymentMethod: 'UPI',
        referenceNumber: 'UPI-HDFC-554433',
        notes: 'Full clearance payment via UPI',
        recordedBy: adminUser._id
      }
    ]);

    // 7. Realistic Historical Sales over past 25 days (for Restock Intelligence algorithms)
    console.log('[Seed] Generating realistic sales history for restock prediction algorithms...');
    const salesData = [];
    const customers = [
      { name: 'Kavita Nair', phone: '+91 99881 22334' },
      { name: 'Rahul Sen', phone: '+91 98300 44556' },
      { name: 'Pooja Iyer', phone: '+91 98401 77889' },
      { name: 'Amitabh Verma', phone: '+91 97110 33442' },
      { name: 'Walk-in Customer', phone: '' },
      { name: 'Siddharth Roy', phone: '+91 98200 66778' }
    ];

    const paymentMethods = ['UPI', 'CASH', 'CARD', 'UPI'];

    // Distribute sales over past 24 days
    for (let dayOffset = 24; dayOffset >= 0; dayOffset--) {
      const saleDate = new Date(now.getTime() - dayOffset * 86400000);
      // Generate 1 to 3 sales per day
      const dailyTransactions = dayOffset === 0 ? 3 : (dayOffset % 2 === 0 ? 2 : 1);

      for (let t = 0; t < dailyTransactions; t++) {
        const customer = customers[(dayOffset + t) % customers.length];
        const pMethod = paymentMethods[(dayOffset + t) % paymentMethods.length];

        // Pick 1 to 3 random products
        const itemP1 = products[(dayOffset * 3 + t) % products.length];
        const itemP2 = products[(dayOffset * 2 + t + 1) % products.length];

        const qty1 = (t % 2 === 0) ? 2 : 1;
        const qty2 = 1;

        const line1Total = Number((qty1 * itemP1.sellingPrice).toFixed(2));
        const line1Cost = Number((qty1 * itemP1.purchaseCost).toFixed(2));
        const line1Profit = Number((line1Total - line1Cost).toFixed(2));

        const line2Total = Number((qty2 * itemP2.sellingPrice).toFixed(2));
        const line2Cost = Number((qty2 * itemP2.purchaseCost).toFixed(2));
        const line2Profit = Number((line2Total - line2Cost).toFixed(2));

        const subtotal = Number((line1Total + line2Total).toFixed(2));
        const totalCost = Number((line1Cost + line2Cost).toFixed(2));
        const taxRate = 5;
        const taxAmount = Number(((subtotal * taxRate) / 100).toFixed(2));
        const grandTotal = Number((subtotal + taxAmount).toFixed(2));
        const grossProfit = Number((grandTotal - totalCost).toFixed(2));

        const invoiceDateStr = saleDate.toISOString().slice(0, 10).replace(/-/g, '');
        const invNum = `INV-${invoiceDateStr}-${String(salesData.length + 1).padStart(4, '0')}`;

        salesData.push({
          invoiceNumber: invNum,
          customerName: customer.name,
          customerPhone: customer.phone,
          items: [
            {
              product: itemP1._id,
              productName: itemP1.name,
              sku: itemP1.sku,
              quantity: qty1,
              unitCostSnapshot: itemP1.purchaseCost,
              sellingPriceSnapshot: itemP1.sellingPrice,
              lineTotal: line1Total,
              profit: line1Profit
            },
            {
              product: itemP2._id,
              productName: itemP2.name,
              sku: itemP2.sku,
              quantity: qty2,
              unitCostSnapshot: itemP2.purchaseCost,
              sellingPriceSnapshot: itemP2.sellingPrice,
              lineTotal: line2Total,
              profit: line2Profit
            }
          ],
          subtotal,
          discount: 0,
          taxRate,
          taxAmount,
          grandTotal,
          totalCost,
          grossProfit,
          paymentMethod: pMethod,
          amountPaid: grandTotal,
          changeDue: 0,
          status: 'COMPLETED',
          soldBy: staffUser._id,
          saleDate
        });
      }
    }

    const createdSales = await Sale.insertMany(salesData);
    console.log(`[Seed] Created ${createdSales.length} realistic historical sales.`);

    // 8. Log corresponding outward stock movements for sales
    for (const s of createdSales.slice(-15)) {
      for (const item of s.items) {
        await StockMovement.create({
          product: item.product,
          movementType: 'SALE_OUTWARD',
          quantityChanged: -item.quantity,
          balanceAfter: 20, // Audit snapshot
          referenceType: 'SALE',
          referenceId: s.invoiceNumber,
          notes: `POS Checkout for ${s.customerName}`,
          performedBy: staffUser._id,
          createdAt: s.saleDate
        });
      }
    }

    console.log('\n======================================================');
    console.log('✅ StockWise database successfully seeded with demo data!');
    console.log('======================================================');
    console.log(`Admin User:  ${adminUser.email} / ${process.env.ADMIN_PASSWORD || 'Admin@123456'}`);
    console.log(`Staff User:  ${staffUser.email} / ${process.env.STAFF_PASSWORD || 'Staff@123456'}`);
    console.log(`Products:    ${products.length} catalog items across 5 categories`);
    console.log(`Suppliers:   ${suppliers.length} active suppliers with balances`);
    console.log(`Purchases:   ${purchases.length} invoices`);
    console.log(`Sales:       ${createdSales.length} historical invoices for restock intelligence`);
    console.log('======================================================\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('[Seed Error] Failed to seed database:', error);
    process.exit(1);
  }
};

seedDatabase();
