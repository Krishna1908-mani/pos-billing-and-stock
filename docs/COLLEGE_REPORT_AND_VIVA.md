# StockWise — College Project Report Outline, PPT Deck & Viva Guide

---

## Part 1: Comprehensive College Project Report Outline

### Chapter 1: Introduction
- **1.1 Background**: Rapid digitalization of small and medium retail businesses in emerging markets.
- **1.2 Motivation**: Off-the-shelf ERP platforms (SAP, Oracle NetSuite) are prohibitively complex, cost-inefficient, and lack retail-tailored explainable inventory analytics for small retail shops.
- **1.3 Problem Statement**: Retail store managers face stockouts on high-velocity items, excess locked-up capital on slow movers, supplier payment tracking discrepancies, and manual invoicing errors.
- **1.4 Project Objectives**:
  - Build an end-to-end cloud-native retail management system.
  - Implement atomic stock movement auditing preventing negative stock.
  - Introduce an explainable, deterministic restock intelligence algorithm based on historical sales velocity.
  - Provide instantaneous POS checkout, PDF receipt rendering, and financial balance reconciliation.

### Chapter 2: Literature Review & Comparative Analysis
- **2.1 Traditional Ledger Systems**: Vulnerabilities of manual physical registers and spreadsheet-based tracking.
- **2.2 Existing SaaS Solutions**: Comparison against square, Shopify POS, Zoho Inventory.
- **2.3 Gaps Identified**: Lack of explainability in restocking recommendations, reliance on sample/fictitious numbers in lightweight solutions, and vulnerability to double stock movements under concurrent requests.

### Chapter 3: System Requirements & Specification
- **3.1 Functional Requirements**:
  - User Authentication & Role-Based Access Control (Admin / Staff).
  - Product Catalog CRUD with SKU uniqueness, margin metrics, and soft-delete safeguards.
  - Supplier Management with dynamic net payables reconciliation.
  - Inward Purchase Management with automatic single-step inventory increment.
  - POS Billing with barcode lookup, live cart calculation, cash tender/change calculation, and transactional stock deduction.
  - Reversible Returns Workflow with financial refund and inventory restitution.
  - Stock Movement Ledger for audit compliance.
  - Explainable Restock Intelligence computing ADS, LTD, and ROP.
  - Reporting & Analytics with server-side CSV streaming.
- **3.2 Non-Functional Requirements**:
  - Sub-second API response time for POS checkout.
  - Concurrency safety under simultaneous cashiers.
  - Strict input sanitization avoiding NoSQL injection and XSS.
  - Responsive UI adapting to desktop, tablet, and mobile displays.

### Chapter 4: Architecture & Design
- **4.1 Architecture Pattern**: Decoupled Client-Server REST Architecture.
- **4.2 Database Design & Data Modeling**:
  - Normalization vs. Denormalization (Snapshotting cost and selling prices on invoices).
  - Indexing Strategy on unique identifiers (`sku`, `invoiceNumber`, `purchaseNumber`) and query filters (`saleDate`, `category`, `supplier`).
- **4.3 Security Framework**:
  - Password hashing using `bcryptjs` with salting rounds ($2^{10}$).
  - Stateless JWT token signing with expiry and HTTP header bearer validation.
  - Middleware defense: Helmet, CORS origin restriction, rate limiting.

### Chapter 5: Restock Intelligence Algorithm (Project Novelty)
- **5.1 Mathematical Foundation**:
  $$\text{Average Daily Sales (ADS)} = \frac{\sum_{i=1}^{W} \text{Units Sold}_i}{W}$$
  $$\text{Lead Time Demand (LTD)} = \text{ADS} \times L_{\text{days}}$$
  $$\text{Safety Stock (SS)} = \text{ADS} \times S_{\text{buffer\_days}}$$
  $$\text{Reorder Point (ROP)} = \max\left(\lceil \text{LTD} + \text{SS} \rceil, \text{LowStockThreshold}\right)$$
  $$\text{Days Until Stockout} = \frac{\text{Current Stock}}{\text{ADS}}$$
- **5.2 Fallback Strategy**: Dynamic confidence assignment (`HIGH`, `MODERATE`, `LIMITED_DATA`, `INSUFFICIENT_DATA`) falling back gracefully to static low-stock safety thresholds.

### Chapter 6: Implementation Details
- **6.1 Backend Implementation**: Express.js REST API routes, controllers, and services.
- **6.2 Stock Ledger Implementation**: Conditional atomic operations with compensation rollback.
- **6.3 Frontend Implementation**: React 18, Vite, React Router 6, Tailwind CSS, Recharts.
- **6.4 Invoice Generation Engine**: PDFKit streaming binary buffers directly to HTTP response streams.

### Chapter 7: Testing & Verification
- **7.1 Unit & Integration Testing**: Node.js native test runner suite verifying 7 core capabilities.
- **7.2 End-to-End Verification**: Manual checkout, return, inward, and payment flow validation.
- **7.3 Edge Case Handling**: Out-of-stock rejection, concurrent cart checkouts, duplicate submissions.

### Chapter 8: Conclusion & Future Enhancements
- **8.1 Summary of Contributions**: Fully deployed operational inventory and POS platform.
- **8.2 Future Roadmap**: Multi-outlet branch networking, barcode thermal printer ESC/POS integration, and automated WhatsApp/SMS invoice delivery.

---

## Part 2: College PPT Presentation Slide Deck Outline

| Slide | Title | Key Talking Points |
| :--- | :--- | :--- |
| **Slide 1** | **Title Slide** | Project: StockWise — Inventory & Sales Intelligence System.<br>Team Members, Guide Name, Institution Name, Department. |
| **Slide 2** | **The Problem** | Retail pain points: Stockout losses, locked-up inventory capital, manual bookkeeping errors, untracked vendor dues. |
| **Slide 3** | **Project Objectives** | Full-stack MERN application, real-time inventory ledger, POS billing with PDF receipts, explainable restocking engine. |
| **Slide 4** | **System Architecture** | Decoupled 3-Tier architecture: React Frontend $\rightarrow$ Express Security Gateway $\rightarrow$ MongoDB Engine. |
| **Slide 5** | **Database Schema (ERD)** | 8 Collections: Users, Products, Suppliers, Purchases, Sales, SaleReturns, StockMovements, SupplierPayments. Cost snapshotting. |
| **Slide 6** | **Core Modules** | Product Catalog, Supplier Statements, Purchase Inward, POS Checkout & Cash Tender, Returns Restock. |
| **Slide 7** | **Novelty: Restock Intelligence** | Mathematical formulation (ADS, LTD, SS, ROP), lead-time tuning, confidence indicators, and stockout estimation. |
| **Slide 8** | **Security & Concurrency** | bcrypt hashing, JWT tokens, Helmet, atomic conditional updates ($\$gte$), compensation rollbacks. |
| **Slide 9** | **Key Performance Visuals** | Recharts live trend graphs, KPI cards, PDF invoice preview, dark/light retail dashboard UI. |
| **Slide 10** | **Testing & Validation** | Automated test suite passing 7 integration suites, zero negative stock enforcement, verified idempotent inwarding. |
| **Slide 11** | **Live Demonstration** | 1-Click Login $\rightarrow$ POS Checkout $\rightarrow$ Download PDF $\rightarrow$ Restock Intelligence $\rightarrow$ Vendor Payment. |
| **Slide 12** | **Conclusion & Roadmap** | Production-ready retail software, cloud scalability, future mobile handheld scanner support. Questions & Answers. |

---

## Part 3: 25 Viva Voce Questions & Expert Answers

#### Q1: What is the main objective of the StockWise application?
**Answer**: StockWise is a full-stack retail management and intelligence platform designed to replace manual retail registers with atomic inventory tracking, automated POS billing, PDF invoicing, supplier accounts payable reconciliation, and an explainable restocking recommendation algorithm.

#### Q2: Why did you choose MongoDB over a traditional Relational Database (RDBMS)?
**Answer**: MongoDB provides high write throughput for rapid POS checkout events, flexible document schema for nested purchase and sales line items, and native aggregation pipelines (`$group`, `$lookup`, `$unwind`) that allow real-time KPI and chart computations without complex multi-table joins.

#### Q3: Why do you snapshot purchase cost and selling price inside sale items?
**Answer**: In retail, product prices and costs fluctuate over time. Storing the exact unit cost snapshot at the moment of sale guarantees that historical financial reports, profit calculations, and invoice totals remain historically accurate even if the master product price changes later.

#### Q4: How does StockWise prevent negative stock during concurrent sales?
**Answer**: We use MongoDB's atomic conditional update `findOneAndUpdate({ _id: productId, stockQuantity: { $gte: requestedQty } }, { $inc: { stockQuantity: -requestedQty } })`. If two cashiers checkout the last remaining item simultaneously, only the first request succeeds; the second receives an `Insufficient stock` error.

#### Q5: What is the mathematical basis of your Restock Prediction algorithm?
**Answer**: It uses empirical inventory control principles: Average Daily Sales ($ADS = \text{Units Sold} / \text{Window Days}$), Lead Time Demand ($LTD = ADS \times \text{Lead Time Days}$), and Safety Stock ($SS = ADS \times \text{Safety Buffer Days}$). The Reorder Point is $ROP = \max(LTD + SS, \text{LowStockThreshold})$. When on-hand stock drops below $ROP$, restock is recommended.

#### Q6: How do you handle products with little or no historical sales data?
**Answer**: The restock algorithm calculates data sufficiency: if units sold $< 5$, the confidence indicator is tagged `LIMITED_DATA` or `INSUFFICIENT_DATA`, and the algorithm safely falls back to the product's configured low-stock safety threshold.

#### Q7: How is JWT authentication implemented?
**Answer**: Upon login, passwords are verified using `bcrypt.compare()`. If valid, a signed JSON Web Token containing the user's ID is issued with a 7-day expiration. The frontend attaches this token in the `Authorization: Bearer <token>` header, verified by backend Express middleware on protected routes.

#### Q8: Why use bcrypt over plain SHA-256 or MD5 for password storage?
**Answer**: MD5 and SHA-256 are fast hash functions vulnerable to brute-force and rainbow table attacks. `bcrypt` incorporates a salt and an adaptive work factor (cost parameter) making hash computation computationally expensive and highly resistant to offline GPU cracking.

#### Q9: What is the purpose of the Stock Movement Ledger?
**Answer**: It provides an immutable, append-only audit trail recording every inventory change (`OPENING_STOCK`, `PURCHASE_INWARD`, `SALE_OUTWARD`, `SALE_RETURN`, `ADJUSTMENT_ADD`, `ADJUSTMENT_SUB`) along with the quantity changed, balance after, reference transaction ID, and the responsible user.

#### Q10: How do you prevent double-counting of supplier balances?
**Answer**: The supplier balance is calculated dynamically on the server: $\text{Current Balance} = \text{Opening Balance} + \sum \text{Purchase Invoices} - \sum \text{Payments Recorded}$. This avoids synchronization bugs between cached balance fields and actual transactions.

#### Q11: How does the returns and cancellation workflow work?
**Answer**: When an invoice is returned, the backend validates that it hasn't already been refunded, creates a `SaleReturn` record, marks the sale as `RETURNED`, and atomically restores each item back into product inventory using `SALE_RETURN` movement logs.

#### Q12: How are invoice PDFs generated?
**Answer**: We use the native Node.js `pdfkit` library. When `/api/sales/:id/pdf` is called, the server constructs a vector PDF with store branding, GSTIN, customer details, itemized table, and tax calculations, and pipes the binary stream directly to the browser with `Content-Disposition: attachment`.

#### Q13: What is Idempotency and how is it used in StockWise?
**Answer**: Idempotency ensures that performing an operation multiple times has the same outcome as performing it once. Clients pass an `idempotencyKey` with purchase or sale requests. If network lag causes a client retry, the server detects the existing key and returns the original transaction rather than deducting stock twice.

#### Q14: How does your application protect against NoSQL Injection?
**Answer**: By enforcing strict schema types via Mongoose, validating request bodies with `express-validator`, validating MongoDB ObjectIds, and using parameterized query objects rather than passing raw `$where` scripts or user-supplied objects directly to query functions.

#### Q15: What role does Helmet play in your Express backend?
**Answer**: Helmet sets crucial HTTP security headers, including `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, and `Strict-Transport-Security`, mitigating clickjacking and MIME-type sniffing vulnerabilities.

#### Q16: How is rate limiting implemented?
**Answer**: We use `express-rate-limit`. A general limiter restricts API abuse to 1,000 requests per 15 minutes, while a stricter limiter on the `/api/auth/login` endpoint restricts attempts to 30 requests per 15 minutes to thwart brute-force password guessing.

#### Q17: What is the difference between soft delete and hard delete in StockWise?
**Answer**: Products with existing sales or purchases cannot be hard-deleted, as that would break historical invoices and inventory movement audits. Instead, they are marked `isDeleted: true` (soft deletion) so they no longer appear in the POS or active catalog while preserving audit history.

#### Q18: What is a Mongoose virtual property, and where is it used?
**Answer**: Virtuals are computed document properties that are not stored in the database. In the `Product` model, `marginPercentage`, `stockStatus`, and `stockValuation` are defined as virtuals calculated dynamically from `purchaseCost`, `sellingPrice`, and `stockQuantity`.

#### Q19: How is the React Single Page Application routed?
**Answer**: Using `react-router-dom` v6. Routes are wrapped in a `ProtectedRoute` component that checks `AuthContext`. Unauthenticated visits to dashboard routes are automatically redirected to `/login`, while authenticated users are served through the persistent `Layout` component.

#### Q20: How are CSV reports generated?
**Answer**: The report controller checks for `format=csv`. If present, it executes the aggregation pipeline, formats the data into standard CSV comma-separated strings with headers, and sets `Content-Type: text/csv` for browser file download.

#### Q21: What happens if an item fails during a multi-item POS checkout?
**Answer**: If item $k$ fails due to stock exhaustion during checkout, a compensation loop executes that reverses the stock deductions for all previous items $(1 \dots k-1)$, returning an error status and keeping inventory completely consistent.

#### Q22: What is the purpose of the health check endpoint?
**Answer**: `GET /api/health` reports the server uptime, operating system timestamp, and MongoDB connection state (`mongoose.connection.readyState`), allowing monitoring tools or the frontend Navbar to display a live connectivity badge.

#### Q23: Why is Tailwind CSS advantageous for this project?
**Answer**: Tailwind uses utility-first styling that compiles down into a minimal CSS bundle (32 KB gzip), enforces a consistent design system (colors, borders, shadows), and ensures responsive layout across desktop, tablet, and mobile displays without CSS bloat.

#### Q24: How does the system calculate today's gross profit?
**Answer**: It aggregates all sales where `status === 'COMPLETED'` and `saleDate >= today 00:00:00`. Gross profit is computed as $\text{Grand Total} - \text{Total Cost of Goods Sold}$, where the cost of each item was captured at the time of sale.

#### Q25: What are three potential future enhancements for StockWise?
**Answer**: 
1. Integrating hardware barcode laser scanners and thermal ESC/POS receipt printers.
2. Multi-store branch support with inter-store stock transfers.
3. Automated customer receipt delivery via WhatsApp Business API or SMS.

