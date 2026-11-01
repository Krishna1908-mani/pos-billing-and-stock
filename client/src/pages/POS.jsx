import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import {
  ShoppingCart,
  Search,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Printer,
  FileDown,
  User,
  CreditCard,
  Percent,
  RefreshCw,
  PackageCheck
} from 'lucide-react';

const POS = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();

  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Cart State
  const [cart, setCart] = useState([]);
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState('');
  const [discount, setDiscount] = useState('0');
  const [taxRate, setTaxRate] = useState('5');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [amountPaid, setAmountPaid] = useState('');

  // Checkout modal state
  const [processing, setProcessing] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);
  const [receiptModal, setReceiptModal] = useState(false);

  const searchInputRef = useRef(null);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const [prodRes, catRes] = await Promise.all([
        api.get('/products?limit=150'),
        api.get('/products/categories')
      ]);
      if (prodRes.data.success) setProducts(prodRes.data.data);
      if (catRes.data.success) setCategories(catRes.data.data);
    } catch (err) {
      showToast('Error loading POS catalogue', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
    // Keyboard shortcut for search
    const handleKeyDown = (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter products by search and category
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase());
    const matchesCat = selectedCategory === 'ALL' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  // Cart operations
  const addToCart = (product) => {
    if (product.stockQuantity <= 0) {
      showToast(`"${product.name}" is OUT OF STOCK`, 'warning');
      return;
    }

    const existingIndex = cart.findIndex((item) => item.product === product._id);
    if (existingIndex > -1) {
      const currentQty = cart[existingIndex].quantity;
      if (currentQty + 1 > product.stockQuantity) {
        showToast(`Only ${product.stockQuantity} units available in stock`, 'warning');
        return;
      }
      const updated = [...cart];
      updated[existingIndex].quantity += 1;
      updated[existingIndex].lineTotal = Number(
        (updated[existingIndex].quantity * updated[existingIndex].sellingPrice).toFixed(2)
      );
      setCart(updated);
    } else {
      setCart([
        ...cart,
        {
          product: product._id,
          name: product.name,
          sku: product.sku,
          unit: product.unit,
          purchaseCost: product.purchaseCost,
          sellingPrice: product.sellingPrice,
          maxStock: product.stockQuantity,
          quantity: 1,
          lineTotal: product.sellingPrice
        }
      ]);
    }
  };

  const updateCartQty = (productId, delta) => {
    const updated = cart
      .map((item) => {
        if (item.product === productId) {
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null;
          if (newQty > item.maxStock) {
            showToast(`Max available stock is ${item.maxStock}`, 'warning');
            return item;
          }
          return {
            ...item,
            quantity: newQty,
            lineTotal: Number((newQty * item.sellingPrice).toFixed(2))
          };
        }
        return item;
      })
      .filter(Boolean);

    setCart(updated);
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter((item) => item.product !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setCustomerName('Walk-in Customer');
    setCustomerPhone('');
    setDiscount('0');
    setAmountPaid('');
  };

  // Calculations
  const subtotal = Number(
    cart.reduce((sum, item) => sum + (parseFloat(item.lineTotal) || 0), 0).toFixed(2)
  );
  const discountNum = Math.max(parseFloat(discount) || 0, 0);
  const taxRateNum = Math.max(parseFloat(taxRate) || 0, 0);
  const discountedSubtotal = Math.max(subtotal - discountNum, 0);
  const taxAmount = Number(((discountedSubtotal * taxRateNum) / 100).toFixed(2));
  const grandTotal = Number((discountedSubtotal + taxAmount).toFixed(2));

  // Default tender
  const effectiveAmountPaid = amountPaid ? parseFloat(amountPaid) : grandTotal;
  const changeDue = Math.max(effectiveAmountPaid - grandTotal, 0);

  const handleCheckout = async () => {
    if (cart.length === 0) {
      showToast('Your cart is empty', 'warning');
      return;
    }

    if (effectiveAmountPaid < grandTotal && paymentMethod !== 'BANK_TRANSFER') {
      showToast(`Amount paid (₹${effectiveAmountPaid}) is less than total (₹${grandTotal})`, 'error');
      return;
    }

    setProcessing(true);
    try {
      const payload = {
        customerName: customerName.trim() || 'Walk-in Customer',
        customerPhone: customerPhone.trim(),
        items: cart.map((i) => ({
          product: i.product,
          quantity: i.quantity,
          sellingPrice: i.sellingPrice
        })),
        discount: discountNum,
        taxRate: taxRateNum,
        paymentMethod,
        amountPaid: effectiveAmountPaid,
        idempotencyKey: `SALE-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
      };

      const res = await api.post('/sales', payload);
      if (res.data.success) {
        showToast('Sale completed successfully!', 'success');
        setCompletedSale(res.data.data);
        setReceiptModal(true);
        clearCart();
        loadProducts(); // Refresh available stock counts
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Checkout failed', 'error');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-4 pb-12">
      {/* Top Bar with Shortcuts */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-indigo-600" />
          <h1 className="text-xl font-bold text-slate-900">Point of Sale (POS Billing)</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded font-mono">
            F2: Search Focus
          </span>
          <button
            onClick={loadProducts}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
            title="Refresh Catalog"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main POS Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Product Selector (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Search & Category Pills */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products or scan barcode (F2)..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 text-slate-800"
              />
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                onClick={() => setSelectedCategory('ALL')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedCategory === 'ALL'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Categories
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setSelectedCategory(c)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    selectedCategory === c
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Product Items Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[580px] overflow-y-auto pr-1">
            {filteredProducts.map((p) => {
              const isOut = p.stockQuantity <= 0;
              const isLow = p.stockQuantity > 0 && p.stockQuantity <= p.lowStockThreshold;

              return (
                <button
                  key={p._id}
                  disabled={isOut}
                  onClick={() => addToCart(p)}
                  className={`text-left p-3.5 rounded-xl border transition-all relative flex flex-col justify-between ${
                    isOut
                      ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                      : 'bg-white border-slate-200/80 hover:border-indigo-400 hover:shadow-md'
                  }`}
                >
                  <div>
                    <div className="text-[10px] font-mono text-slate-400 tracking-tight">{p.sku}</div>
                    <div className="text-xs font-semibold text-slate-900 line-clamp-2 mt-0.5">
                      {p.name}
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                    <div className="text-sm font-bold font-mono text-indigo-600">
                      ₹{p.sellingPrice.toFixed(2)}
                    </div>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        isOut
                          ? 'bg-rose-100 text-rose-800'
                          : isLow
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {isOut ? 'Out of Stock' : `${p.stockQuantity} ${p.unit}`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Side: Active Cart & Checkout Panel (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-bold text-slate-800">Current Order Cart</h2>
              <span className="text-xs text-slate-400">({cart.length} items)</span>
            </div>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs text-rose-600 hover:text-rose-800 font-semibold"
              >
                Clear Cart
              </button>
            )}
          </div>

          {/* Customer Meta */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Customer Name
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Walk-in Customer"
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Phone</label>
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+91..."
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
              />
            </div>
          </div>

          {/* Cart Items List */}
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
            {cart.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                Cart is empty. Click a product on the left to add it.
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.product} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-800 truncate">{item.name}</div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      ₹{item.sellingPrice.toFixed(2)} × {item.quantity} = ₹{item.lineTotal.toFixed(2)}
                    </div>
                  </div>

                  {/* Quantity Controls */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => updateCartQty(item.product, -1)}
                      className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center text-xs font-bold font-mono text-slate-900">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateCartQty(item.product, 1)}
                      className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => removeFromCart(item.product)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded ml-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Discount & Tax controls */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Discount (₹)</label>
              <input
                type="number"
                min="0"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">GST Tax Rate (%)</label>
              <select
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-medium"
              >
                <option value="0">0% (Nil)</option>
                <option value="5">5% (Essentials)</option>
                <option value="12">12% (Standard)</option>
                <option value="18">18% (Electronics)</option>
              </select>
            </div>
          </div>

          {/* Bill Calculation Summary */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-1.5 text-xs font-medium">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal:</span>
              <span className="font-mono">₹{subtotal.toFixed(2)}</span>
            </div>
            {discountNum > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Discount:</span>
                <span className="font-mono">- ₹{discountNum.toFixed(2)}</span>
              </div>
            )}
            {taxAmount > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>GST Tax ({taxRateNum}%):</span>
                <span className="font-mono">+ ₹{taxAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
              <span>Grand Total:</span>
              <span className="font-mono text-indigo-600">₹{grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Payment Method
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {['CASH', 'UPI', 'CARD', 'BANK_TRANSFER'].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={`py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    paymentMethod === m
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {m === 'BANK_TRANSFER' ? 'BANK' : m}
                </button>
              ))}
            </div>
          </div>

          {/* Cash Tendered & Change Due */}
          {paymentMethod === 'CASH' && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  placeholder={`Cash Tendered (₹${grandTotal.toFixed(2)})`}
                  className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                />
                <button
                  type="button"
                  onClick={() => setAmountPaid(grandTotal.toString())}
                  className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 rounded-lg text-xs font-semibold text-slate-700"
                >
                  Exact
                </button>
              </div>

              {changeDue > 0 && (
                <div className="flex justify-between text-xs font-bold text-emerald-700 bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                  <span>Change to Return:</span>
                  <span className="font-mono">₹{changeDue.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          {/* Checkout Button */}
          <button
            disabled={processing || cart.length === 0}
            onClick={handleCheckout}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {processing ? (
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                <span>Complete Checkout (₹{grandTotal.toFixed(2)})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Sale Success & Receipt Modal */}
      <Modal
        isOpen={receiptModal}
        onClose={() => setReceiptModal(false)}
        title="Transaction Completed Successfully"
        maxWidth="max-w-md"
      >
        {completedSale && (
          <div className="space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <PackageCheck className="w-7 h-7" />
            </div>

            <div>
              <div className="text-xs text-slate-400 font-medium">Invoice Number</div>
              <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                {completedSale.invoiceNumber}
              </div>
              <div className="text-sm font-extrabold text-emerald-600 font-mono mt-1">
                Total: ₹{completedSale.grandTotal.toFixed(2)}
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl text-left text-xs space-y-1 font-medium border border-slate-100">
              <div className="flex justify-between text-slate-600">
                <span>Customer:</span>
                <span className="text-slate-900">{completedSale.customerName}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Payment Mode:</span>
                <span className="text-slate-900">{completedSale.paymentMethod}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Amount Paid:</span>
                <span className="font-mono text-slate-900">₹{completedSale.amountPaid.toFixed(2)}</span>
              </div>
              {completedSale.changeDue > 0 && (
                <div className="flex justify-between text-emerald-600 font-bold">
                  <span>Change Returned:</span>
                  <span className="font-mono">₹{completedSale.changeDue.toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => {
                  window.open(
                    `${import.meta.env.VITE_API_URL || '/api'}/sales/${completedSale._id}/pdf`,
                    '_blank'
                  );
                }}
                className="flex items-center justify-center gap-1.5 p-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-semibold border border-indigo-200 transition-colors"
              >
                <FileDown className="w-4 h-4" />
                <span>Download PDF</span>
              </button>

              <button
                onClick={() => {
                  navigate(`/sales/${completedSale.invoiceNumber}`);
                }}
                className="flex items-center justify-center gap-1.5 p-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
              >
                <Printer className="w-4 h-4" />
                <span>View Full Bill</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default POS;
