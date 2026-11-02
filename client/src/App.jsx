import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';

// Components
import Layout from './components/Layout';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import ProductForm from './pages/ProductForm';
import ProductDetails from './pages/ProductDetails';
import Suppliers from './pages/Suppliers';
import SupplierDetails from './pages/SupplierDetails';
import Purchases from './pages/Purchases';
import NewPurchase from './pages/NewPurchase';
import PurchaseDetails from './pages/PurchaseDetails';
import POS from './pages/POS';
import SalesHistory from './pages/SalesHistory';
import InvoiceView from './pages/InvoiceView';
import InventoryMovements from './pages/InventoryMovements';
import SupplierDues from './pages/SupplierDues';
import RestockRecommendations from './pages/RestockRecommendations';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

// Protected Route Guard
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white text-sm">
        <div className="flex items-center gap-3">
          <span className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span>Authenticating StockWise session...</span>
        </div>
      </div>
    );
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            {/* Public Auth Route */}
            <Route path="/login" element={<Login />} />

            {/* Protected SaaS App Routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="products" element={<Products />} />
              <Route path="products/new" element={<ProductForm />} />
              <Route path="products/edit/:id" element={<ProductForm />} />
              <Route path="products/:id" element={<ProductDetails />} />
              <Route path="suppliers" element={<Suppliers />} />
              <Route path="suppliers/:id" element={<SupplierDetails />} />
              <Route path="purchases" element={<Purchases />} />
              <Route path="purchases/new" element={<NewPurchase />} />
              <Route path="purchases/:id" element={<PurchaseDetails />} />
              <Route path="pos" element={<POS />} />
              <Route path="sales" element={<SalesHistory />} />
              <Route path="sales/:id" element={<InvoiceView />} />
              <Route path="inventory" element={<InventoryMovements />} />
              <Route path="stock-movement" element={<InventoryMovements />} />
              <Route path="low-stock" element={<Products initialStockStatus="LOW_STOCK" />} />
              <Route path="dues" element={<SupplierDues />} />
              <Route path="payments" element={<SupplierDues />} />
              <Route path="restock" element={<RestockRecommendations />} />
              <Route path="reports" element={<Reports />} />
              <Route path="settings" element={<Settings />} />
              <Route path="profile" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
