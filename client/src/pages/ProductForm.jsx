import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import { Package, ArrowLeft, Save, Sparkles } from 'lucide-react';

const ProductForm = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category: '',
    description: '',
    supplier: '',
    purchaseCost: '',
    sellingPrice: '',
    mrp: '',
    stockQuantity: '0',
    lowStockThreshold: '10',
    unit: 'pcs'
  });

  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);
        const [supRes, catRes] = await Promise.all([
          api.get('/suppliers'),
          api.get('/products/categories')
        ]);
        if (supRes.data.success) setSuppliers(supRes.data.data);
        if (catRes.data.success) setCategories(catRes.data.data);

        if (isEdit) {
          const prodRes = await api.get(`/products/${id}`);
          if (prodRes.data.success) {
            const p = prodRes.data.data;
            setFormData({
              name: p.name || '',
              sku: p.sku || '',
              category: p.category || '',
              description: p.description || '',
              supplier: p.supplier?._id || p.supplier || '',
              purchaseCost: p.purchaseCost?.toString() || '',
              sellingPrice: p.sellingPrice?.toString() || '',
              mrp: p.mrp ? p.mrp.toString() : '',
              stockQuantity: p.stockQuantity?.toString() || '0',
              lowStockThreshold: p.lowStockThreshold?.toString() || '10',
              unit: p.unit || 'pcs'
            });
          }
        }
      } catch (err) {
        showToast('Error loading product details', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [id, isEdit]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Real-time Margin & Profit Calculation
  const cost = parseFloat(formData.purchaseCost) || 0;
  const price = parseFloat(formData.sellingPrice) || 0;
  const unitProfit = price - cost;
  const marginPct = price > 0 ? Number(((unitProfit / price) * 100).toFixed(2)) : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.sku.trim() || !formData.category.trim()) {
      showToast('Please provide Name, SKU, and Category', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit) {
        const res = await api.put(`/products/${id}`, formData);
        if (res.data.success) {
          showToast('Product updated successfully', 'success');
          navigate('/products');
        }
      } else {
        const res = await api.post('/products', formData);
        if (res.data.success) {
          showToast('Product created successfully', 'success');
          navigate('/products');
        }
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save product', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500 text-sm">Loading product details...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/products')}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Catalog</span>
        </button>
        <h1 className="text-xl font-bold text-slate-900">
          {isEdit ? 'Edit Product' : 'Register New Product'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Main Details Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 pb-2 border-b border-slate-100 flex items-center gap-2">
            <Package className="w-4 h-4 text-indigo-600" />
            General Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Product Name */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Product Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Wireless Noise-Cancelling Headphones"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 text-slate-800"
              />
            </div>

            {/* SKU */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                SKU / Barcode <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                name="sku"
                required
                value={formData.sku}
                onChange={handleChange}
                placeholder="e.g. ELEC-HP-001"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono uppercase focus:ring-2 focus:ring-indigo-500 text-slate-800"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Category <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                name="category"
                required
                list="category-suggestions"
                value={formData.category}
                onChange={handleChange}
                placeholder="Select or enter category..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 text-slate-800"
              />
              <datalist id="category-suggestions">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            {/* Supplier */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Primary Supplier
              </label>
              <select
                name="supplier"
                value={formData.supplier}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 text-slate-800"
              >
                <option value="">No specific supplier</option>
                {suppliers.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.company} ({s.name})
                  </option>
                ))}
              </select>
            </div>

            {/* Unit */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Measurement Unit
              </label>
              <select
                name="unit"
                value={formData.unit}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 text-slate-800"
              >
                <option value="pcs">Pieces (pcs)</option>
                <option value="box">Box</option>
                <option value="pack">Pack</option>
                <option value="kg">Kilogram (kg)</option>
                <option value="bag">Bag</option>
                <option value="bottle">Bottle</option>
                <option value="liter">Liter (L)</option>
                <option value="meter">Meter (m)</option>
              </select>
            </div>

            {/* Description */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Description / Notes
              </label>
              <textarea
                name="description"
                rows="2"
                value={formData.description}
                onChange={handleChange}
                placeholder="Product specifications, size, warranty terms..."
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 text-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Pricing & Margins Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              Pricing & Profitability
            </h2>
            {/* Live Margin Calculation Indicator */}
            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-500">Gross Margin:</span>
              <span
                className={`font-bold px-2 py-0.5 rounded-md ${
                  marginPct >= 30
                    ? 'bg-emerald-100 text-emerald-800'
                    : marginPct > 0
                    ? 'bg-indigo-100 text-indigo-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {marginPct}% (₹{unitProfit.toFixed(2)} / unit)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Purchase Cost */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Purchase Cost (₹) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                name="purchaseCost"
                value={formData.purchaseCost}
                onChange={handleChange}
                placeholder="0.00"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-indigo-500 text-slate-800"
              />
            </div>

            {/* Selling Price */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Selling Price (₹) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                name="sellingPrice"
                value={formData.sellingPrice}
                onChange={handleChange}
                placeholder="0.00"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold focus:ring-2 focus:ring-indigo-500 text-slate-800"
              />
            </div>

            {/* MRP */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                MRP (Printed Max Retail)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                name="mrp"
                value={formData.mrp}
                onChange={handleChange}
                placeholder="Optional MRP..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-indigo-500 text-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Stock & Thresholds Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 pb-2 border-b border-slate-100">
            Stock Control & Safety Buffers
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Initial Stock (Only for new items) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isEdit ? 'Current Stock Quantity' : 'Initial Opening Stock'}
              </label>
              <input
                type="number"
                min="0"
                name="stockQuantity"
                disabled={isEdit}
                value={formData.stockQuantity}
                onChange={handleChange}
                className={`w-full px-3.5 py-2.5 border rounded-xl text-xs font-mono font-bold ${
                  isEdit
                    ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                    : 'bg-slate-50 border-slate-200 focus:ring-2 focus:ring-indigo-500 text-slate-800'
                }`}
              />
              {isEdit && (
                <p className="text-[11px] text-slate-400 mt-1">
                  Use "Stock Movement Ledger" or "Purchase" to adjust stock.
                </p>
              )}
            </div>

            {/* Low Stock Threshold */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Low-Stock Alert Threshold
              </label>
              <input
                type="number"
                min="0"
                name="lowStockThreshold"
                value={formData.lowStockThreshold}
                onChange={handleChange}
                placeholder="10"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-indigo-500 text-slate-800"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Triggers visual warning when inventory drops to or below this count.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate('/products')}
            className="px-5 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/30 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Product'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProductForm;
