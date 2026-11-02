-- ==============================================================================
-- StockWise / MFEF - Supabase PostgreSQL Schema Definition
-- Run this script in your Supabase Project Dashboard > SQL Editor
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mongo_id VARCHAR(64) UNIQUE,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Suppliers Table
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mongo_id VARCHAR(64) UNIQUE,
  name VARCHAR(200) NOT NULL,
  company VARCHAR(200) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(255),
  address TEXT,
  notes TEXT,
  opening_balance NUMERIC(12,2) DEFAULT 0,
  current_balance NUMERIC(12,2) DEFAULT 0,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Products Table
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mongo_id VARCHAR(64) UNIQUE,
  name VARCHAR(255) NOT NULL,
  sku VARCHAR(100) UNIQUE NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  purchase_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  mrp NUMERIC(12,2),
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 10,
  unit VARCHAR(50) DEFAULT 'pcs',
  image_url TEXT,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Purchases Table
CREATE TABLE IF NOT EXISTS public.purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mongo_id VARCHAR(64) UNIQUE,
  purchase_number VARCHAR(100) UNIQUE NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_invoice_number VARCHAR(100),
  purchase_date TIMESTAMPTZ DEFAULT NOW(),
  due_date TIMESTAMPTZ,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) DEFAULT 0,
  tax NUMERIC(12,2) DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(12,2) DEFAULT 0,
  balance_due NUMERIC(12,2) DEFAULT 0,
  payment_status VARCHAR(20) DEFAULT 'UNPAID' CHECK (payment_status IN ('PAID', 'PARTIAL', 'UNPAID')),
  notes TEXT,
  idempotency_key VARCHAR(100) UNIQUE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Purchase Line Items
CREATE TABLE IF NOT EXISTS public.purchase_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name VARCHAR(255) NOT NULL,
  sku VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_cost NUMERIC(12,2) NOT NULL,
  line_total NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Sales Invoices
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mongo_id VARCHAR(64) UNIQUE,
  invoice_number VARCHAR(100) UNIQUE NOT NULL,
  customer_name VARCHAR(200) DEFAULT 'Walk-in Customer',
  customer_phone VARCHAR(50),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) DEFAULT 0,
  tax_rate NUMERIC(6,2) DEFAULT 0,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  grand_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  gross_profit NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(50) DEFAULT 'CASH',
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  change_due NUMERIC(12,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'RETURNED', 'CANCELLED')),
  idempotency_key VARCHAR(100) UNIQUE,
  sold_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  sale_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Sale Line Items
CREATE TABLE IF NOT EXISTS public.sale_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name VARCHAR(255) NOT NULL,
  sku VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_cost_snapshot NUMERIC(12,2) NOT NULL,
  selling_price_snapshot NUMERIC(12,2) NOT NULL,
  line_total NUMERIC(12,2) NOT NULL,
  profit NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Sale Returns
CREATE TABLE IF NOT EXISTS public.sale_returns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mongo_id VARCHAR(64) UNIQUE,
  return_number VARCHAR(100) UNIQUE NOT NULL,
  sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
  invoice_number VARCHAR(100) NOT NULL,
  refund_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  refund_method VARCHAR(50) DEFAULT 'CASH',
  reason TEXT,
  processed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  return_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Sale Return Line Items
CREATE TABLE IF NOT EXISTS public.sale_return_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id UUID REFERENCES public.sale_returns(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name VARCHAR(255) NOT NULL,
  sku VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL,
  refund_amount NUMERIC(12,2) NOT NULL,
  unit_cost_snapshot NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Stock Movement Audit Ledger
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mongo_id VARCHAR(64) UNIQUE,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  movement_type VARCHAR(50) NOT NULL CHECK (movement_type IN ('OPENING_STOCK', 'PURCHASE_INWARD', 'SALE_OUTWARD', 'SALE_RETURN', 'ADJUSTMENT_ADD', 'ADJUSTMENT_SUB')),
  quantity_changed INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reference_type VARCHAR(50) DEFAULT 'MANUAL_ADJUSTMENT',
  reference_id VARCHAR(100),
  notes TEXT,
  performed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Supplier Payments
CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mongo_id VARCHAR(64) UNIQUE,
  payment_number VARCHAR(100) UNIQUE NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE CASCADE,
  purchase_id UUID REFERENCES public.purchases(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  payment_date TIMESTAMPTZ DEFAULT NOW(),
  payment_method VARCHAR(50) DEFAULT 'BANK_TRANSFER',
  reference_number VARCHAR(100),
  notes TEXT,
  recorded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for high-performance querying
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_number ON public.sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON public.sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id ON public.purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier_id ON public.supplier_payments(supplier_id);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

-- Base RLS Policy: Authenticated users can read active inventory & catalog
CREATE POLICY "Allow authenticated read products" ON public.products FOR SELECT USING (true);
CREATE POLICY "Allow authenticated read suppliers" ON public.suppliers FOR SELECT USING (true);
CREATE POLICY "Allow authenticated read sales" ON public.sales FOR SELECT USING (true);
CREATE POLICY "Allow authenticated read purchases" ON public.purchases FOR SELECT USING (true);

