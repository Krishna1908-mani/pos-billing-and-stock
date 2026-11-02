-- ==============================================================================
-- StockWise / MFEF - Enterprise Supabase PostgreSQL Schema Definition (v2.0)
-- Database Engine: PostgreSQL 17.x (Supabase)
-- Architecture: Express Backend with Custom JWT -> Direct pg Connection Pool
-- Standard: Native gen_random_uuid(), ACID Stock Isolation, Strict Referential
--           Integrity, Zero PostgREST Data Leakage, Dynamic Audit Reconciliations
-- ==============================================================================

-- ==============================================================================
-- 1. UTILITY FUNCTIONS & TIMESTAMP TRIGGERS
-- ==============================================================================

-- Reusable trigger function to automatically maintain updated_at timestamps
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 2. TABLE DEFINITIONS
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Table 1: USERS (Authentication & Role-Based Access Control)
-- Preserves existing bcrypt hashes and Express JWT compatibility
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id VARCHAR(64) UNIQUE,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- Table 2: SUPPLIERS (Vendors & Accounts Payable)
-- Balances are dynamically calculated via view_supplier_balances to eliminate drift
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id VARCHAR(64) UNIQUE,
  name VARCHAR(120) NOT NULL,
  company VARCHAR(150) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(255) DEFAULT '',
  address TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (opening_balance >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- Table 3: PRODUCTS (Catalog, Inventory Levels & Valuation)
-- stock_quantity is constrained to >= 0 at DB level to prevent negative stock
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id VARCHAR(64) UNIQUE,
  name VARCHAR(200) NOT NULL,
  sku VARCHAR(100) UNIQUE NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT DEFAULT '',
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  purchase_cost NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (purchase_cost >= 0),
  selling_price NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (selling_price >= 0),
  mrp NUMERIC(12,2) CHECK (mrp IS NULL OR mrp >= 0),
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 10 CHECK (low_stock_threshold >= 0),
  unit VARCHAR(50) NOT NULL DEFAULT 'pcs',
  image_url TEXT DEFAULT '',
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- Table 4: PURCHASES (Purchase Invoices & Inward Stock Records)
-- RESTRICT delete on suppliers to protect historical audit records
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id VARCHAR(64) UNIQUE,
  purchase_number VARCHAR(100) UNIQUE NOT NULL,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_invoice_number VARCHAR(100) DEFAULT '',
  purchase_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_date TIMESTAMPTZ,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
  discount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (discount >= 0),
  tax NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (tax >= 0),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (amount_paid >= 0),
  balance_due NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (balance_due >= 0),
  payment_status VARCHAR(20) NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('PAID', 'PARTIAL', 'UNPAID')),
  notes TEXT DEFAULT '',
  idempotency_key VARCHAR(100) UNIQUE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_purchases_updated_at ON public.purchases;
CREATE TRIGGER trg_purchases_updated_at
  BEFORE UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- Table 5: PURCHASE_ITEMS (Normalized Purchase Line Items)
-- Cascades when purchase header is deleted, RESTRICTS product deletion
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name VARCHAR(200) NOT NULL,
  sku VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 1),
  unit_cost NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0),
  line_total NUMERIC(12,2) NOT NULL CHECK (line_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- Table 6: SALES (Sales Invoices & POS Receipts)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id VARCHAR(64) UNIQUE,
  invoice_number VARCHAR(100) UNIQUE NOT NULL,
  customer_name VARCHAR(200) NOT NULL DEFAULT 'Walk-in Customer',
  customer_phone VARCHAR(50) DEFAULT '',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
  discount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (discount >= 0),
  tax_rate NUMERIC(6,2) NOT NULL DEFAULT 0.00 CHECK (tax_rate >= 0),
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
  grand_total NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (grand_total >= 0),
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (total_cost >= 0),
  gross_profit NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'CASH' CHECK (
    payment_method IN ('CASH', 'CARD', 'UPI', 'BANK_TRANSFER')
  ),
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (amount_paid >= 0),
  change_due NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (change_due >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED' CHECK (
    status IN ('COMPLETED', 'CANCELLED', 'RETURNED')
  ),
  idempotency_key VARCHAR(100) UNIQUE,
  sold_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  sale_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_sales_updated_at ON public.sales;
CREATE TRIGGER trg_sales_updated_at
  BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- Table 7: SALE_ITEMS (Normalized Sale Line Items)
-- Cascades when sale invoice header is deleted, RESTRICTS product deletion
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name VARCHAR(200) NOT NULL,
  sku VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 1),
  unit_cost_snapshot NUMERIC(12,2) NOT NULL CHECK (unit_cost_snapshot >= 0),
  selling_price_snapshot NUMERIC(12,2) NOT NULL CHECK (selling_price_snapshot >= 0),
  line_total NUMERIC(12,2) NOT NULL CHECK (line_total >= 0),
  profit NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- Table 8: SALE_RETURNS (Credit Notes & Product Returns)
-- RESTRICTS sale deletion so returns cannot become orphaned
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sale_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id VARCHAR(64) UNIQUE,
  return_number VARCHAR(100) UNIQUE NOT NULL,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
  invoice_number VARCHAR(100) NOT NULL,
  refund_total NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (refund_total >= 0),
  refund_method VARCHAR(50) NOT NULL DEFAULT 'CASH' CHECK (
    refund_method IN ('CASH', 'ORIGINAL_PAYMENT', 'STORE_CREDIT')
  ),
  reason TEXT NOT NULL,
  processed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  return_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_sale_returns_updated_at ON public.sale_returns;
CREATE TRIGGER trg_sale_returns_updated_at
  BEFORE UPDATE ON public.sale_returns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- Table 9: SALE_RETURN_ITEMS (Normalized Return Line Items)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sale_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES public.sale_returns(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name VARCHAR(200) NOT NULL,
  sku VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 1),
  refund_amount NUMERIC(12,2) NOT NULL CHECK (refund_amount >= 0),
  unit_cost_snapshot NUMERIC(12,2) NOT NULL CHECK (unit_cost_snapshot >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- Table 10: STOCK_MOVEMENTS (Immutable Inventory Audit Ledger)
-- RESTRICTS product deletion: Stock movement history MUST NEVER be deleted!
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id VARCHAR(64) UNIQUE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  movement_type VARCHAR(50) NOT NULL CHECK (
    movement_type IN (
      'OPENING_STOCK',
      'PURCHASE_INWARD',
      'SALE_OUTWARD',
      'SALE_RETURN',
      'ADJUSTMENT_ADD',
      'ADJUSTMENT_SUB'
    )
  ),
  quantity_changed INTEGER NOT NULL,
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  reference_type VARCHAR(50) NOT NULL DEFAULT 'MANUAL_ADJUSTMENT' CHECK (
    reference_type IN (
      'PURCHASE',
      'SALE',
      'RETURN',
      'MANUAL_ADJUSTMENT',
      'INITIAL_IMPORT'
    )
  ),
  reference_id VARCHAR(100) DEFAULT '',
  notes TEXT DEFAULT '',
  performed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- Table 11: SUPPLIER_PAYMENTS (Cash Outflow / Accounts Payable Ledger)
-- RESTRICTS supplier deletion: Financial ledger MUST NOT be deleted!
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id VARCHAR(64) UNIQUE,
  payment_number VARCHAR(100) UNIQUE NOT NULL,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  purchase_id UUID REFERENCES public.purchases(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0.01),
  payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payment_method VARCHAR(50) NOT NULL DEFAULT 'BANK_TRANSFER' CHECK (
    payment_method IN ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI', 'CARD')
  ),
  reference_number VARCHAR(100) DEFAULT '',
  notes TEXT DEFAULT '',
  recorded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 3. VIEWS FOR AUDIT, RECONCILIATION & BUSINESS LOGIC
-- ==============================================================================

-- 3.1 Supplier Balances View
-- Dynamically derives current payable balance from transactions to avoid drift
CREATE OR REPLACE VIEW public.view_supplier_balances AS
SELECT
  s.id,
  s.mongo_id,
  s.name,
  s.company,
  s.phone,
  s.email,
  s.address,
  s.notes,
  s.opening_balance,
  s.is_active,
  s.is_deleted,
  s.created_at,
  s.updated_at,
  COALESCE(p.total_purchased, 0.00) AS total_purchased,
  COALESCE(p.purchase_count, 0) AS purchase_count,
  COALESCE(pay.total_payments, 0.00) AS total_payments,
  COALESCE(pay.payment_count, 0) AS payment_count,
  ROUND(s.opening_balance + COALESCE(p.total_purchased, 0.00) - COALESCE(pay.total_payments, 0.00), 2) AS current_balance,
  GREATEST(ROUND(s.opening_balance + COALESCE(p.total_purchased, 0.00) - COALESCE(pay.total_payments, 0.00), 2), 0.00) AS current_outstanding
FROM public.suppliers s
LEFT JOIN (
  SELECT
    supplier_id,
    SUM(total_amount) AS total_purchased,
    COUNT(id) AS purchase_count
  FROM public.purchases
  GROUP BY supplier_id
) p ON p.supplier_id = s.id
LEFT JOIN (
  SELECT
    supplier_id,
    SUM(amount) AS total_payments,
    COUNT(id) AS payment_count
  FROM public.supplier_payments
  GROUP BY supplier_id
) pay ON pay.supplier_id = s.id;

-- 3.2 Product Details View (Emulates Mongoose Virtuals)
CREATE OR REPLACE VIEW public.view_product_details AS
SELECT
  p.*,
  CASE
    WHEN p.stock_quantity <= 0 THEN 'OUT_OF_STOCK'
    WHEN p.stock_quantity <= p.low_stock_threshold THEN 'LOW_STOCK'
    ELSE 'IN_STOCK'
  END AS stock_status,
  CASE
    WHEN p.selling_price > 0 THEN
      ROUND(((p.selling_price - p.purchase_cost) / p.selling_price) * 100.0, 2)
    ELSE 0.00
  END AS margin_percentage,
  ROUND(p.stock_quantity * p.purchase_cost, 2) AS stock_valuation
FROM public.products p;

-- 3.3 Inventory Ledger Reconciliation View
-- Cross-checks products.stock_quantity against sum of all immutable movements
CREATE OR REPLACE VIEW public.view_inventory_reconciliation AS
SELECT
  p.id AS product_id,
  p.sku,
  p.name,
  p.stock_quantity AS recorded_stock,
  COALESCE(sm.sum_delta, 0) AS ledger_stock,
  (p.stock_quantity - COALESCE(sm.sum_delta, 0)) AS stock_discrepancy,
  CASE
    WHEN (p.stock_quantity - COALESCE(sm.sum_delta, 0)) = 0 THEN 'BALANCED'
    ELSE 'DISCREPANCY_DETECTED'
  END AS audit_status
FROM public.products p
LEFT JOIN (
  SELECT
    product_id,
    SUM(quantity_changed) AS sum_delta
  FROM public.stock_movements
  GROUP BY product_id
) sm ON sm.product_id = p.id;

-- ==============================================================================
-- 4. PERFORMANCE & LOOKUP INDEXES
-- ==============================================================================

-- Users
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

-- Suppliers
CREATE INDEX IF NOT EXISTS idx_suppliers_company ON public.suppliers(company);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_phone ON public.suppliers(phone);
CREATE INDEX IF NOT EXISTS idx_suppliers_is_active ON public.suppliers(is_active);
CREATE INDEX IF NOT EXISTS idx_suppliers_is_deleted ON public.suppliers(is_deleted);

-- Products
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON public.products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_is_deleted ON public.products(is_deleted);
CREATE INDEX IF NOT EXISTS idx_products_stock_quantity ON public.products(stock_quantity);

-- Purchases
CREATE INDEX IF NOT EXISTS idx_purchases_purchase_number ON public.purchases(purchase_number);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id ON public.purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_purchase_date ON public.purchases(purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_payment_status ON public.purchases(payment_status);
CREATE INDEX IF NOT EXISTS idx_purchases_due_date ON public.purchases(due_date);

-- Purchase Items
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON public.purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product_id ON public.purchase_items(product_id);

-- Sales
CREATE INDEX IF NOT EXISTS idx_sales_invoice_number ON public.sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON public.sales(sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_payment_method ON public.sales(payment_method);
CREATE INDEX IF NOT EXISTS idx_sales_status ON public.sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_sold_by ON public.sales(sold_by);

-- Sale Items
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON public.sale_items(product_id);

-- Sale Returns
CREATE INDEX IF NOT EXISTS idx_sale_returns_return_number ON public.sale_returns(return_number);
CREATE INDEX IF NOT EXISTS idx_sale_returns_sale_id ON public.sale_returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_returns_return_date ON public.sale_returns(return_date DESC);

-- Sale Return Items
CREATE INDEX IF NOT EXISTS idx_sale_return_items_return_id ON public.sale_return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_sale_return_items_product_id ON public.sale_return_items(product_id);

-- Stock Movements (Auditing)
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_movement_type ON public.stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON public.stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON public.stock_movements(reference_type, reference_id);

-- Supplier Payments
CREATE INDEX IF NOT EXISTS idx_supplier_payments_payment_number ON public.supplier_payments(payment_number);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier_id ON public.supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_payment_date ON public.supplier_payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_purchase_id ON public.supplier_payments(purchase_id);

-- ==============================================================================
-- 5. ACCESS CONTROL & POSTGREST LOCKDOWN
-- Because MFEF uses custom Express JWT auth via backend connection pool (pg),
-- direct public web access to PostgREST is locked down completely.
-- ==============================================================================

-- Revoke all public API access from Supabase anonymous and authenticated client roles
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
