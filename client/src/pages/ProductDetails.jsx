import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import StatusBadge from '../components/StatusBadge';
import {
  Package,
  ArrowLeft,
  Edit,
  History,
  Layers,
  IndianRupee,
  Building,
  Calendar
} from 'lucide-react';

const ProductDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/products/${id}`);
        if (res.data.success) {
          setProduct(res.data.data);
          setMovements(res.data.recentMovements || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [id]);

  if (loading || !product) {
    return <div className="p-8 text-center text-slate-500 text-sm">Loading product details...</div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/products')}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Catalog</span>
        </button>
        <button
          onClick={() => navigate(`/products/edit/${product._id}`)}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
        >
          <Edit className="w-4 h-4" />
          <span>Edit Product</span>
        </button>
      </div>

      {/* Overview Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900">{product.name}</h1>
              <StatusBadge status={product.stockStatus} type="stock" />
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 font-mono">
              <span>SKU: {product.sku}</span>
              <span>•</span>
              <span className="font-sans font-medium bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                {product.category}
              </span>
            </div>
            {product.description && (
              <p className="text-xs text-slate-600 mt-3 max-w-2xl">{product.description}</p>
            )}
          </div>

          <div className="text-right sm:border-l sm:border-slate-100 sm:pl-6">
            <div className="text-xs text-slate-400 font-medium">Current Stock Level</div>
            <div className="text-3xl font-extrabold text-slate-900 mt-1">
              {product.stockQuantity}{' '}
              <span className="text-xs font-normal text-slate-500">{product.unit}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Safety threshold: {product.lowStockThreshold} {product.unit}
            </div>
          </div>
        </div>

        {/* Financial Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <div className="text-[11px] text-slate-500 font-medium">Purchase Cost</div>
            <div className="text-lg font-bold text-slate-900 font-mono mt-0.5">
              ₹{(product.purchaseCost ?? 0).toFixed(2)}
            </div>
          </div>
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <div className="text-[11px] text-slate-500 font-medium">Selling Price</div>
            <div className="text-lg font-bold text-indigo-600 font-mono mt-0.5">
              ₹{(product.sellingPrice ?? 0).toFixed(2)}
            </div>
          </div>
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <div className="text-[11px] text-slate-500 font-medium">Gross Margin</div>
            <div className="text-lg font-bold text-emerald-600 mt-0.5">
              {product.marginPercentage ?? 0}%
            </div>
          </div>
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <div className="text-[11px] text-slate-500 font-medium">Total On-Hand Value</div>
            <div className="text-lg font-bold text-slate-900 font-mono mt-0.5">
              ₹{((product.stockQuantity || 0) * (product.purchaseCost || 0)).toFixed(2)}
            </div>
          </div>
        </div>

        {/* Supplier details */}
        {product.supplier && (
          <div className="mt-6 p-4 rounded-xl bg-indigo-50/50 border border-indigo-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg text-indigo-700">
                <Building className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  {product.supplier.company}
                </div>
                <div className="text-[11px] text-slate-500">
                  Contact: {product.supplier.name} ({product.supplier.phone})
                </div>
              </div>
            </div>
            <button
              onClick={() => navigate(`/suppliers/${product.supplier._id}`)}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              View Supplier Statement &rarr;
            </button>
          </div>
        )}
      </div>

      {/* Stock Movement Audit Ledger for this Product */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
              Audit Movement History
            </h2>
          </div>
          <span className="text-xs text-slate-400">Last 10 ledger entries</span>
        </div>

        {movements.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No movement logs recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Movement Type</th>
                  <th className="py-2.5 px-3 text-right">Qty Changed</th>
                  <th className="py-2.5 px-3 text-right">Balance After</th>
                  <th className="py-2.5 px-3">Reference</th>
                  <th className="py-2.5 px-3">Audit Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.map((m) => (
                  <tr key={m._id} className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                      {new Date(m.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-700">
                      {m.movementType}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono font-bold ${
                        m.quantityChanged > 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {m.quantityChanged > 0 ? `+${m.quantityChanged}` : m.quantityChanged}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                      {m.balanceAfter}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-indigo-600 font-medium">
                      {m.referenceId || 'N/A'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">{m.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductDetails;
