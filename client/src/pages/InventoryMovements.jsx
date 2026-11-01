import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import { TableSkeleton } from '../components/SkeletonLoader';
import {
  History,
  Plus,
  Minus,
  Search,
  Filter,
  AlertTriangle,
  Layers,
  ChevronLeft,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';

const InventoryMovements = () => {
  const [movements, setMovements] = useState([]);
  const [products, setProducts] = useState([]);
  const [alerts, setAlerts] = useState({ outOfStock: [], lowStock: [] });
  const [activeTab, setActiveTab] = useState('ledger'); // 'ledger' | 'alerts'
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [movementType, setMovementType] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });

  // Manual Adjustment Modal
  const [adjustModal, setAdjustModal] = useState(false);
  const [adjProduct, setAdjProduct] = useState('');
  const [adjType, setAdjType] = useState('ADD');
  const [adjQuantity, setAdjQuantity] = useState('1');
  const [adjReason, setAdjReason] = useState('Physical audit recount');
  const [adjusting, setAdjusting] = useState(false);

  const { showToast } = useToast();

  const fetchMovements = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page,
        limit: 20,
        search,
        movementType: movementType === 'ALL' ? '' : movementType
      });
      const res = await api.get(`/inventory/movements?${params.toString()}`);
      if (res.data.success) {
        setMovements(res.data.data);
        setPagination(res.data.pagination);
      }
    } catch (err) {
      showToast('Failed to load stock ledger', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchAlertsAndProducts = async () => {
    try {
      const [alertRes, prodRes] = await Promise.all([
        api.get('/inventory/alerts'),
        api.get('/products?limit=200')
      ]);
      if (alertRes.data.success) {
        setAlerts(alertRes.data.data);
      }
      if (prodRes.data.success) {
        setProducts(prodRes.data.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchAlertsAndProducts();
  }, []);

  useEffect(() => {
    fetchMovements();
  }, [page, movementType]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setPage(1);
      fetchMovements();
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    if (!adjProduct) {
      showToast('Please select a product', 'warning');
      return;
    }
    const qty = parseFloat(adjQuantity);
    if (!qty || qty <= 0) {
      showToast('Quantity must be greater than zero', 'warning');
      return;
    }

    setAdjusting(true);
    try {
      const res = await api.post('/inventory/adjust', {
        productId: adjProduct,
        type: adjType,
        quantity: qty,
        reason: adjReason
      });
      if (res.data.success) {
        showToast(res.data.message || 'Stock successfully adjusted', 'success');
        setAdjustModal(false);
        setAdjQuantity('1');
        setAdjReason('Physical audit recount');
        fetchMovements();
        fetchAlertsAndProducts();
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Stock adjustment failed', 'error');
    } finally {
      setAdjusting(false);
    }
  };

  const totalAlertCount = (alerts.outOfStock?.length || 0) + (alerts.lowStock?.length || 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Inventory Control & Audit Ledger
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Immutable movement trail tracking purchases, sales, returns, and manual adjustments
          </p>
        </div>

        <button
          onClick={() => setAdjustModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
        >
          <Layers className="w-4 h-4" />
          <span>Manual Stock Adjustment</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('ledger')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'ledger'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Movement Audit Ledger</span>
        </button>

        <button
          onClick={() => setActiveTab('alerts')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'alerts'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span>Low & Out-of-Stock Alerts</span>
          {totalAlertCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
              {totalAlertCount}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'ledger' ? (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reference # or audit notes..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 text-slate-800"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <select
                value={movementType}
                onChange={(e) => {
                  setMovementType(e.target.value);
                  setPage(1);
                }}
                className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 text-slate-700"
              >
                <option value="ALL">All Movement Types</option>
                <option value="OPENING_STOCK">Opening Stock</option>
                <option value="PURCHASE_INWARD">Purchase Inward</option>
                <option value="SALE_OUTWARD">Sale Outward</option>
                <option value="SALE_RETURN">Sale Return</option>
                <option value="ADJUSTMENT_ADD">Manual Add</option>
                <option value="ADJUSTMENT_SUB">Manual Reduce</option>
              </select>
            </div>
          </div>

          {/* Ledger Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-6">
                <TableSkeleton rows={8} cols={7} />
              </div>
            ) : movements.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                No inventory movement records match the specified filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-100">
                    <tr>
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Product / SKU</th>
                      <th className="py-3 px-4">Movement Type</th>
                      <th className="py-3 px-4 text-right">Change</th>
                      <th className="py-3 px-4 text-right">Balance After</th>
                      <th className="py-3 px-4">Reference ID</th>
                      <th className="py-3 px-4">Reason / Notes</th>
                      <th className="py-3 px-4">Performed By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {movements.map((m) => {
                      const isPositive = m.quantityChanged > 0;
                      return (
                        <tr key={m._id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-4 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                            {new Date(m.createdAt).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="font-semibold text-slate-900">{m.product?.name || 'Deleted Product'}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{m.product?.sku}</div>
                          </td>
                          <td className="py-2.5 px-4 font-semibold text-slate-700">
                            <span className="px-2 py-0.5 rounded text-[11px] bg-slate-100">
                              {m.movementType.replace('_', ' ')}
                            </span>
                          </td>
                          <td
                            className={`py-2.5 px-4 text-right font-mono font-bold ${
                              isPositive ? 'text-emerald-600' : 'text-rose-600'
                            }`}
                          >
                            {isPositive ? `+${m.quantityChanged}` : m.quantityChanged}{' '}
                            <span className="text-[10px] font-normal text-slate-400">
                              {m.product?.unit || 'pcs'}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                            {m.balanceAfter}{' '}
                            <span className="text-[10px] font-normal text-slate-400">
                              {m.product?.unit || 'pcs'}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-mono font-medium text-indigo-600">
                            {m.referenceId || '—'}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600 max-w-xs truncate">
                            {m.notes || '—'}
                          </td>
                          <td className="py-2.5 px-4 text-slate-500 text-[11px]">
                            {m.performedBy?.name || 'System / Batch'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Footer */}
            {pagination.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-600">
                <div>
                  Showing page <span className="font-semibold">{pagination.page}</span> of{' '}
                  <span className="font-semibold">{pagination.pages}</span> ({pagination.total} entries)
                </div>
                <div className="flex items-center gap-1">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    disabled={page >= pagination.pages}
                    onClick={() => setPage(page + 1)}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Alerts View */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Out of Stock Section */}
          <div className="bg-white rounded-2xl border border-rose-200 p-6 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-rose-100">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-600" />
                <h2 className="text-sm font-bold text-rose-950 uppercase tracking-wide">
                  Out of Stock ({alerts.outOfStock?.length || 0})
                </h2>
              </div>
              <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">
                Immediate Action
              </span>
            </div>

            {alerts.outOfStock?.length === 0 ? (
              <p className="text-xs text-emerald-600 py-4 font-medium">
                All catalog items currently have positive inventory.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {alerts.outOfStock.map((p) => (
                  <div key={p._id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-slate-900">{p.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {p.sku} • {p.category}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Supplier: {p.supplier?.company || 'Unassigned'}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-rose-600 block">0 {p.unit}</span>
                      <span className="text-[10px] text-slate-400">Threshold: {p.lowStockThreshold}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Low Stock Warning Section */}
          <div className="bg-white rounded-2xl border border-amber-200 p-6 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-amber-100">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h2 className="text-sm font-bold text-amber-950 uppercase tracking-wide">
                  Below Low Stock Threshold ({alerts.lowStock?.length || 0})
                </h2>
              </div>
              <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                Reorder Soon
              </span>
            </div>

            {alerts.lowStock?.length === 0 ? (
              <p className="text-xs text-emerald-600 py-4 font-medium">
                No items are currently below their safety threshold.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {alerts.lowStock.map((p) => (
                  <div key={p._id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-slate-900">{p.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {p.sku} • {p.category}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Supplier: {p.supplier?.company || 'Unassigned'}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-amber-700 block">
                        {p.stockQuantity} {p.unit}
                      </span>
                      <span className="text-[10px] text-slate-400">Threshold: {p.lowStockThreshold}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Stock Adjustment Modal */}
      <Modal
        isOpen={adjustModal}
        onClose={() => setAdjustModal(false)}
        title="Manual Stock Inventory Adjustment"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleAdjustSubmit} className="space-y-4">
          <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-950 text-xs">
            Manual adjustments immediately update physical on-hand stock and log an immutable entry
            with your user signature in the audit ledger.
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Product <span className="text-rose-500">*</span>
            </label>
            <select
              required
              value={adjProduct}
              onChange={(e) => setAdjProduct(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Choose item to adjust...</option>
              {products.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} ({p.sku}) — Current: {p.stockQuantity} {p.unit}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Adjustment Type <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAdjType('ADD')}
                className={`py-2 rounded-xl text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 ${
                  adjType === 'ADD'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Stock (Surplus)</span>
              </button>
              <button
                type="button"
                onClick={() => setAdjType('SUB')}
                className={`py-2 rounded-xl text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 ${
                  adjType === 'SUB'
                    ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Minus className="w-3.5 h-3.5" />
                <span>Reduce Stock (Damaged/Lost)</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Quantity to Adjust <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              min="1"
              required
              value={adjQuantity}
              onChange={(e) => setAdjQuantity(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Reason / Audit Remark <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
              placeholder="e.g. Audit correction, expired goods, damaged packaging..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setAdjustModal(false)}
              className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={adjusting}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
            >
              {adjusting ? 'Adjusting...' : 'Apply Stock Change'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default InventoryMovements;
