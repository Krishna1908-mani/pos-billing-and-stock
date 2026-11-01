# StockWise — Inventory & Sales Intelligence System

> **A Production-Quality Full-Stack Web Application for Retail Operations, Billing & Predictive Restocking**

---

## 🌟 Overview & Highlights

**StockWise** is a modern, responsive web application engineered specifically for retail stores. It combines fast Point-of-Sale (POS) counter operations with a real-time audit ledger, dynamic supplier payables reconciliation, and an explainable **Restock Intelligence Algorithm** (Project Novelty) that calculates Average Daily Sales (ADS), Lead Time Demand (LTD), and Reorder Points (ROP) from persisted sales transactions.

### Key Capabilities
- 🔐 **Authentication & Roles**: JWT-based authentication, bcrypt hashing ($2^{10}$ rounds), and Admin/Staff role-based access.
- 📊 **Executive Dashboard**: Live MongoDB metrics (Stock Value, Units on Hand, Today's Sales, Today's Profit, Low Stock, Supplier Payables) and interactive Recharts graphs.
- 📦 **Product Catalog**: SKU uniqueness, live gross margin calculations, low-stock threshold triggers, and soft-deletion protection.
- 🤝 **Supplier Management**: Live statement generation, purchase records, and dynamic accounts payable tracking.
- 🚚 **Purchases & Stock Inward**: Multi-item inward shipment recording with atomic single-step inventory increments and credit/partial payment management.
- 🛒 **POS & Billing Counter**: Barcode/product search, keyboard shortcuts (`F2`), real-time cart calculations, cash tender & change due calculator, atomic stock deduction, and return/refund processing.
- 🧾 **PDF Invoicing Engine**: Maintained native `PDFKit` vector invoice generation with store branding, GSTIN, and itemized breakdowns.
- 📜 **Stock Movement Ledger**: Immutable append-only audit trail capturing opening stock, purchases, sales, returns, and manual adjustments.
- 🔮 **Restock Prediction (Project Novelty)**: Explainable, deterministic mathematical model calculating ADS, LTD, Safety Stock, and ROP with interactive lead-time tuning.
- 📈 **Financial & Operational Reports**: Aggregated reports for Sales & Profit, Inventory Valuation by Category, Procurement Spend, and Top Velocity Products with one-click CSV export.

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | React 18, Vite 6, Tailwind CSS | High-performance SPA with modern responsive UI |
| **Routing & Icons** | React Router Dom v6, Lucide React | Declarative client routing and SVG icon library |
| **Visualizations** | Recharts v2 | Area charts, Bar charts, and KPI trends |
| **Backend** | Node.js v24, Express.js v4 | Scalable REST API with modular MVC architecture |
| **Database** | MongoDB Server v7+, Mongoose v8 | High-throughput document store with aggregation pipelines |
| **Security** | bcryptjs, jsonwebtoken, Helmet, CORS, express-rate-limit | Enterprise authentication, header hardening, and rate limiting |
| **Validation** | express-validator | Request body and query sanitization |
| **PDF Generation** | PDFKit | High-resolution binary vector PDF invoice streaming |
| **Testing** | Node.js native test runner (`node:test`, `node:assert`) | Blazing fast integration and concurrency tests |

---

## 🚀 Quick Start Guide (Windows PowerShell)

### Step 1: Verify Prerequisites
Ensure Node.js (v18+) and MongoDB are installed and running on your system.
```powershell
node -v
npm -v
# Verify MongoDB service is running
Get-Service -Name *mongo*
```

---

### Step 2: Environment Configuration
Environment files are already pre-configured for local execution. You can inspect or modify them:

#### Server Configuration (`server/.env`)
```ini
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/stockwise
JWT_SECRET=stockwise_super_secret_jwt_key_2026_secure
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
NODE_ENV=development

# Demo Admin & Staff Credentials
ADMIN_NAME=Admin Owner
ADMIN_EMAIL=admin@stockwise.local
ADMIN_PASSWORD=Admin@123456
STAFF_NAME=Store Cashier
STAFF_EMAIL=staff@stockwise.local
STAFF_PASSWORD=Staff@123456
```

#### Client Configuration (`client/.env`)
```ini
VITE_API_URL=http://localhost:5000/api
VITE_APP_TITLE=StockWise - Inventory & Sales Intelligence
```

---

### Step 3: Install Dependencies (If not already installed)
Run from the root directory:
```powershell
# Install root, server, and client dependencies
npm run install:all
```

---

### Step 4: Seed Database with Realistic Demo Data
Populates the local database with 12 catalog products across 5 categories, 4 suppliers, purchase history, inward shipments, supplier payments, and 39 realistic sales distributed over the past 25 days:
```powershell
npm run seed
```

---

### Step 5: Run Automated Backend Tests
Executes the native test suite verifying authentication, product validation, atomic stock deduction, insufficient stock rejection, profit calculation, supplier partial payments, and the Restock Intelligence algorithm:
```powershell
npm --prefix server test
```
*Expected result: 7/7 suites passing with 0 failures.*

---

### Step 6: Start Application for Development
In two separate PowerShell terminals:

#### Terminal 1 (Backend API on Port 5000):
```powershell
npm --prefix server run dev
```

#### Terminal 2 (Frontend Client on Port 5173):
```powershell
npm --prefix client run dev
```

Open your browser at: **`http://localhost:5173`**

---

### Step 7: Build for Production
```powershell
npm --prefix client run build
```

---

## 🔑 Demo Login Accounts

| Role | Email Address | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **Admin / Store Owner** | `admin@stockwise.local` | `Admin@123456` | Full system access, product deletion, manual stock adjustments |
| **Store Cashier / Staff** | `staff@stockwise.local` | `Staff@123456` | POS billing, product view, purchase inward, customer returns |

> **Pro-Tip**: The login screen features **1-Click Quick Fill** buttons for both Admin and Staff accounts for effortless live evaluations.

---

## 📡 API Endpoint Reference

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | System status, database state, uptime |
| `POST` | `/api/auth/login` | Public | Authenticate user & issue JWT |
| `GET` | `/api/auth/me` | Protected | Current logged-in user profile |
| `GET` | `/api/products` | Protected | List products with pagination, search, category & stock filters |
| `POST` | `/api/products` | Protected | Create new product & register opening stock |
| `GET` | `/api/products/:id` | Protected | Product specs & recent 10 stock movements |
| `PUT` | `/api/products/:id` | Protected | Update product details and prices |
| `DELETE` | `/api/products/:id` | Admin | Delete product (soft deletes if transactions exist) |
| `GET` | `/api/suppliers` | Protected | Supplier list with dynamic payable balance |
| `POST` | `/api/suppliers` | Protected | Register new supplier vendor |
| `GET` | `/api/suppliers/:id` | Protected | Vendor statement, purchase history & payments |
| `GET` | `/api/purchases` | Protected | List inward purchase orders with filters |
| `POST` | `/api/purchases` | Protected | Inward shipment, atomically increase stock & log movement |
| `GET` | `/api/purchases/:id` | Protected | Itemized purchase order details & linked payments |
| `POST` | `/api/sales` | Protected | POS checkout, atomic stock reduction, profit snapshot |
| `GET` | `/api/sales/:id` | Protected | Invoice details |
| `GET` | `/api/sales/:id/pdf` | Protected | Stream binary PDF invoice generated via PDFKit |
| `POST` | `/api/sales/:id/return`| Protected | Refund transaction, restore stock & log movement |
| `GET` | `/api/inventory/movements`| Protected | Stock ledger audit trail with filters |
| `POST` | `/api/inventory/adjust`| Protected | Manual stock adjustment (Add / Subtract / Damaged) |
| `GET` | `/api/inventory/alerts`| Protected | Out-of-stock and low-stock items list |
| `GET` | `/api/payments/dues` | Protected | Supplier payables summary & open dues |
| `POST` | `/api/payments` | Protected | Record payment disbursement to vendor |
| `GET` | `/api/restock` | Protected | Predictive restock intelligence calculations |
| `GET` | `/api/reports/sales` | Protected | Sales & profit report (JSON or CSV) |
| `GET` | `/api/reports/inventory-valuation` | Protected | Valuation by category (JSON or CSV) |
| `GET` | `/api/reports/purchases` | Protected | Spend by supplier (JSON or CSV) |
| `GET` | `/api/reports/top-products`| Protected | Highest revenue generating items (JSON or CSV) |
| `GET` | `/api/dashboard` | Protected | Live executive metrics, KPI cards, and charts |

---

## 🧪 Testing Verification Table

| Test ID | Test Description | Execution Command | Result |
| :--- | :--- | :--- | :--- |
| **TC-01** | User authentication, bcrypt password hashing & JWT generation | `npm --prefix server test` | **PASS** |
| **TC-02** | Product SKU uniqueness enforcement & gross margin virtual calculation | `npm --prefix server test` | **PASS** |
| **TC-03** | Atomic stock deduction & prevention of negative inventory | `npm --prefix server test` | **PASS** |
| **TC-04** | Inward purchase stock increment exactly once | `npm --prefix server test` | **PASS** |
| **TC-05** | Real-time profit calculation and item unit cost snapshotting | `npm --prefix server test` | **PASS** |
| **TC-06** | Supplier partial payment allocation and dynamic balance calculation | `npm --prefix server test` | **PASS** |
| **TC-07** | Restock Intelligence: ADS, Lead Time Demand, and ROP computation | `npm --prefix server test` | **PASS** |
| **TC-08** | Client production bundle compilation with Vite and Tailwind | `npm --prefix client run build` | **PASS** |

---

## 📋 Manual End-to-End Verification Checklist

1. [x] **Login Flow**: Open `http://localhost:5173/login`, click **Fill Admin**, and click **Sign In**. Successfully navigates to Executive Dashboard.
2. [x] **Dashboard Metrics**: Confirm live MongoDB metrics for Stock Value, Units, Today's Sales, and Recharts graphs.
3. [x] **Catalog Management**: Navigate to `/products`. Add a new product; confirm live Gross Margin calculation.
4. [x] **Supplier Management**: Navigate to `/suppliers`. Check dynamic payable balances matching total purchases minus payments.
5. [x] **Inward Purchase Flow**: Navigate to `/purchases/new`. Select a supplier and add 2 products. Submit and verify on-hand stock increases in the Product catalog and Stock Ledger.
6. [x] **POS Billing**: Navigate to `/pos`. Search by barcode or name, add items to cart, select CASH, enter tender amount, and click **Complete Checkout**. Verify receipt modal opens.
7. [x] **PDF Invoicing**: Click **Download PDF** on invoice; verify PDFKit downloads a formatted A4 invoice with store details.
8. [x] **Return & Restock**: Open `/sales`, select invoice, click **Return / Cancel Sale**. Verify stock balance is restored in the Movement Ledger.
9. [x] **Restock Intelligence**: Navigate to `/restock`. Adjust the Lead Time and Safety Stock sliders; verify Reorder Points and Days Until Stockout update interactively.
10. [x] **CSV Reports Export**: Navigate to `/reports`, select a tab, and click **Export Current Report (CSV)**; verify browser triggers `.csv` download.

---

## 🔮 Known Limitations & Roadmap

- **Hardware Peripherals**: Currently outputs printable HTML bills and vector PDFs. Future enhancements will add direct ESC/POS serial printer driver integration.
- **Multi-Branch Support**: Designed for single retail shop deployments; future iterations will support inter-branch warehouse transfers.
- **Customer CRM**: Future builds will integrate automated WhatsApp/SMS invoice delivery via Twilio or Gupshup APIs.

---

## 📄 License
This project is developed for educational and retail management purposes. Open source under the MIT License.

