import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ErrorBoundary from './components/ErrorBoundary';

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
  const [slowLoading, setSlowLoading] = React.useState(false);

  React.useEffect(() => {
    let timer;
    if (loading) {
      timer = setTimeout(() => setSlowLoading(true), 4000);
    }
    return () => clearTimeout(timer);
  }, [loading]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white text-sm p-6 text-center">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span>Authenticating StockWise session...</span>
        </div>
        {slowLoading && (
          <div className="max-w-md bg-slate-800/90 border border-slate-700 rounded-xl p-4 text-xs text-slate-300 space-y-3 shadow-xl">
            <p className="leading-relaxed">
              The backend service is waking up from idle (Render free tier spin-up typically takes ~30–50s). Please wait a moment.
            </p>
            <div className="flex justify-center gap-2 pt-1">
              <button
                onClick={() => {
                  localStorage.removeItem('stockwise_token');
                  localStorage.removeItem('stockwise_user');
                  window.location.href = '/login';
                }}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-medium text-xs transition-colors"
              >
                Sign In With Different Account
              </button>
            </div>
          </div>
        )}
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
                  <ErrorBoundary>
                    <Layout />
                  </ErrorBoundary>
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
