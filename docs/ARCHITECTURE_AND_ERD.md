# StockWise — Architecture & Database Design

## 1. System Architecture Overview

StockWise is designed using a decoupled, multi-tier Client-Server architecture optimized for reliability, high responsiveness, and strict data consistency in retail environments.

```mermaid
graph TD
    subgraph Client ["Client Tier (Frontend Browser)"]
        UI["React 18 Single Page Application"]
        Router["React Router v6"]
        State["Auth & Toast Contexts"]
        AxiosClient["Axios Interceptors (Bearer JWT)"]
        Recharts["Recharts Analytics & KPI Visualizations"]
    end

    subgraph Gateway ["Application Gateway & Security Layer"]
        Helmet["Helmet Security Headers"]
        CORS["CORS Policy Validation"]
        RateLimiter["Rate Limiting (express-rate-limit)"]
        JWTAuth["JWT Verification & Role Middleware"]
        InputVal["express-validator Request Sanitizer"]
    end

    subgraph Controllers ["Backend Application Logic (Node.js & Express)"]
        AuthCtrl["Auth Controller"]
        ProdCtrl["Product Controller"]
        SupCtrl["Supplier Controller"]
        PurCtrl["Purchase & Inward Controller"]
        SaleCtrl["POS & Billing Controller"]
        LedgerCtrl["Inventory Ledger Controller"]
        PayCtrl["Payables & Dues Controller"]
        RestockCtrl["Restock Intelligence Service"]
        ReportCtrl["Reporting & Aggregation Controller"]
        PDFSvc["PDFKit Invoice Engine"]
    end

    subgraph DataTier ["Data Persistence Layer (MongoDB Engine)"]
        UsersCol[("Users Collection")]
        ProductsCol[("Products Collection")]
        SuppliersCol[("Suppliers Collection")]
        PurchasesCol[("Purchases Collection")]
        SalesCol[("Sales Collection")]
        ReturnsCol[("Sale Returns Collection")]
        MovementsCol[("Stock Movement Ledger")]
        PaymentsCol[("Supplier Payments Collection")]
    end

    UI --> AxiosClient
    AxiosClient -->|HTTPS REST API Requests| Gateway
    Gateway --> Controllers
    Controllers --> DataTier
    SaleCtrl --> PDFSvc
    PDFSvc -->|Binary PDF Stream| AxiosClient
```

---

## 2. Entity-Relationship (ER) Diagram

```mermaid
erDiagram
    USER ||--o{ SALE : "sells / checks out"
    USER ||--o{ PURCHASE : "creates inward order"
    USER ||--o{ STOCK_MOVEMENT : "authorizes / adjusts"
    USER ||--o{ SUPPLIER_PAYMENT : "disburses"

    SUPPLIER ||--o{ PRODUCT : "supplies"
    SUPPLIER ||--o{ PURCHASE : "invoices to store"
    SUPPLIER ||--o{ SUPPLIER_PAYMENT : "receives payment"

    PRODUCT ||--o{ PURCHASE_ITEM : "inwarded in"
    PRODUCT ||--o{ SALE_ITEM : "purchased in"
    PRODUCT ||--o{ STOCK_MOVEMENT : "tracked balance"

    PURCHASE ||--|{ PURCHASE_ITEM : "contains"
    PURCHASE ||--o{ SUPPLIER_PAYMENT : "clears balance"

    SALE ||--|{ SALE_ITEM : "contains"
    SALE ||--o{ SALE_RETURN : "refunded via"

    SALE_RETURN ||--|{ RETURN_ITEM : "restores"

    USER {
        ObjectId _id PK
        string name
        string email UK
        string password "bcrypt hash"
        string role "admin | staff"
        boolean isActive
    }

    PRODUCT {
        ObjectId _id PK
        string name
        string sku UK "Indexed"
        string category "Indexed"
        number purchaseCost
        number sellingPrice
        number mrp
        number stockQuantity
        number lowStockThreshold
        string unit
        boolean isDeleted
    }

    SUPPLIER {
        ObjectId _id PK
        string company UK
        string name
        string phone
        string email
        number openingBalance
        boolean isActive
    }

    PURCHASE {
        ObjectId _id PK
        string purchaseNumber UK "Indexed"
        ObjectId supplier FK
        date purchaseDate "Indexed"
        date dueDate
        number subtotal
        number discount
        number tax
        number totalAmount
        number amountPaid
        number balanceDue
        string paymentStatus "PAID | PARTIAL | UNPAID"
    }

    SALE {
        ObjectId _id PK
        string invoiceNumber UK "Indexed"
        string customerName
        string customerPhone
        date saleDate "Indexed"
        number subtotal
        number discount
        number taxAmount
        number grandTotal
        number totalCost
        number grossProfit
        string paymentMethod "CASH | CARD | UPI | BANK"
        string status "COMPLETED | RETURNED | CANCELLED"
        ObjectId soldBy FK
    }

    STOCK_MOVEMENT {
        ObjectId _id PK
        ObjectId product FK "Indexed"
        string movementType "OPENING | PURCHASE_INWARD | SALE_OUTWARD | SALE_RETURN | ADJUSTMENT"
        number quantityChanged
        number balanceAfter
        string referenceType
        string referenceId "Indexed"
        string notes
        ObjectId performedBy FK
        date createdAt "Indexed"
    }

    SUPPLIER_PAYMENT {
        ObjectId _id PK
        string paymentNumber UK
        ObjectId supplier FK
        ObjectId purchase FK
        number amount
        date paymentDate "Indexed"
        string paymentMethod
        string referenceNumber
        ObjectId recordedBy FK
    }
```

---

## 3. Data Integrity & Concurrency Safeguards

1. **Atomic Stock Decrement**: POS checkouts issue conditional queries `{ _id: productId, stockQuantity: { $gte: qty } }` with `$inc: { stockQuantity: -qty }`. Transactions that exceed available inventory fail immediately without negative stock anomalies.
2. **Compensation Rollback**: If a multi-item cart encounters a stock exhaustion on item $N$, previous items $(1 \dots N-1)$ that were deducted in that request are atomically restored.
3. **Idempotency Keys**: Both purchases and sales accept unique idempotency keys to prevent duplicate checkout submissions or double inward movements upon client retry.
4. **Soft Deletion**: Products with historical sales or purchases are archived (`isDeleted = true`) rather than dropped, preserving historical invoices and audit logs.
