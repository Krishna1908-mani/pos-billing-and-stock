import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/StatusBadge';
import { TableSkeleton } from '../components/SkeletonLoader';
import {
  TrendingUp,
  Sparkles,
  Sliders,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Package,
  Layers,
  Truck,
  ArrowRight,
  Info,
  CheckCircle2
} from 'lucide-react';

const RestockRecommendations = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [recommendations, setRecommendations] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);

  // Tunable Parameters
  const [windowDays, setWindowDays] = useState(30);
  const [leadTimeDays, setLeadTimeDays] = useState(7);
  const [safetyStockDays, setSafetyStockDays] = useState(3);
  const [selectedUrgency, setSelectedUrgency] = useState('ALL');

  const fetchRestock = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        windowDays,
        leadTimeDays,
        safetyStockDays
      });
      const res = await api.get(`/restock?${params.toString()}`);
      if (res.data.success) {
        setRecommendations(res.data.recommendations || []);
        setMeta(res.data.meta);
      }
    } catch (err) {
      showToast('Failed to calculate restock intelligence', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRestock();
  }, [windowDays, leadTimeDays, safetyStockDays]);

  // Filter recommendations by urgency
  const filteredRecs = recommendations.filter((r) => {
    if (selectedUrgency === 'ALL') return true;
    if (selectedUrgency === 'RESTOCK_ONLY') return r.needsRestock;
    return r.urgency === selectedUrgency;
  });

  const totalRestockCost = recommendations
    .filter((r) => r.needsRestock)
    .reduce((sum, r) => sum + r.estimatedRestockCost, 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Header with Project Novelty Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Predictive Restock Intelligence
            </h1>
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
              <Sparkles className="w-3.5 h-3.5" /> Project Novelty
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Explainable mathematical inventory forecasting based on historical sales velocity
          </p>
        </div>

        <button
          onClick={fetchRestock}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
        >
          <span>Recalculate Model</span>
        </button>
      </div>

      {/* Tunable Model Parameters & Formula Explanation Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sliders Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Model Parameters
              </h3>
            </div>
            <span className="text-[11px] text-indigo-600 font-semibold">Real-time Tuning</span>
          </div>

          {/* Historical Window Slider */}
          <div>
            <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
              <span>Sales Analysis Window:</span>
              <span className="font-mono text-indigo-600">{windowDays} Days</span>
            </div>
            <input
              type="range"
              min="7"
              max="90"
              step="1"
              value={windowDays}
              onChange={(e) => setWindowDays(parseInt(e.target.value, 10))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>7 days</span>
              <span>30 days (Default)</span>
              <span>90 days</span>
            </div>
          </div>

          {/* Supplier Lead Time Slider */}
          <div>
            <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
              <span>Supplier Lead Time:</span>
              <span className="font-mono text-indigo-600">{leadTimeDays} Days</span>
            </div>
            <input
              type="range"
              min="1"
              max="30"
              step="1"
              value={leadTimeDays}
              onChange={(e) => setLeadTimeDays(parseInt(e.target.value, 10))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>1 day (Local)</span>
              <span>7 days (Regional)</span>
              <span>30 days</span>
            </div>
          </div>

          {/* Safety Stock Buffer Slider */}
          <div>
            <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
              <span>Safety Stock Buffer:</span>
              <span className="font-mono text-indigo-600">{safetyStockDays} Days</span>
            </div>
            <input
              type="range"
              min="1"
              max="14"
              step="1"
              value={safetyStockDays}
              onChange={(e) => setSafetyStockDays(parseInt(e.target.value, 10))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>1 day</span>
              <span>3 days (Recommended)</span>
              <span>14 days</span>
            </div>
          </div>
        </div>

        {/* Explainable Mathematical Framework Card */}
        <div className="lg:col-span-2 bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-2xl p-5 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-4 h-4 text-indigo-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-200">
                Explainable Mathematical Logic & Formula
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Instead of opaque black-box machine learning, StockWise utilizes an explainable, deterministic
              retail inventory reorder formulation grounded in persisted store transactions:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-white/10 backdrop-blur-sm p-3 rounded-xl border border-white/10">
                <div className="font-bold text-indigo-300 font-mono text-[11px]">1. Average Daily Sales (ADS)</div>
                <div className="text-[11px] text-slate-300 mt-1 font-mono">
                  ADS = Total Units Sold in Window / {windowDays} Days
                </div>
              </div>

              <div className="bg-white/10 backdrop-blur-sm p-3 rounded-xl border border-white/10">
                <div className="font-bold text-indigo-300 font-mono text-[11px]">2. Lead Time Demand (LTD)</div>
                <div className="text-[11px] text-slate-300 mt-1 font-mono">
                  LTD = ADS × {leadTimeDays} Lead Time Days
                </div>
              </div>

              <div className="bg-white/10 backdrop-blur-sm p-3 rounded-xl border border-white/10">
                <div className="font-bold text-indigo-300 font-mono text-[11px]">3. Safety Stock Buffer (SS)</div>
                <div className="text-[11px] text-slate-300 mt-1 font-mono">
                  SS = ADS × {safetyStockDays} Safety Buffer Days
                </div>
              </div>

              <div className="bg-white/10 backdrop-blur-sm p-3 rounded-xl border border-white/10">
                <div className="font-bold text-indigo-300 font-mono text-[11px]">4. Reorder Point (ROP)</div>
                <div className="text-[11px] text-slate-300 mt-1 font-mono">
                  ROP = Max(LTD + SS, LowStockThreshold)
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between text-xs text-indigo-200">
            <div>Products Analyzed: <strong className="text-white">{meta?.totalProductsAnalyzed || 0}</strong></div>
            <div>Reorder Flagged: <strong className="text-amber-400">{meta?.productsNeedingRestock || 0}</strong></div>
            <div>Estimated Restock Capital: <strong className="text-emerald-400 font-mono">₹{Number(totalRestockCost || 0).toLocaleString('en-IN')}</strong></div>
          </div>
        </div>
      </div>

      {/* Filter Tabs by Urgency */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {[
          { label: 'All Items', value: 'ALL' },
          { label: 'Requires Restock Now', value: 'RESTOCK_ONLY' },
          { label: 'Critical (Stockouts)', value: 'CRITICAL' },
          { label: 'High Priority', value: 'HIGH' },
          { label: 'Medium Priority', value: 'MEDIUM' }
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => setSelectedUrgency(tab.value)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              selectedUrgency === tab.value
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Recommendations Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6">
            <TableSkeleton rows={8} cols={8} />
          </div>
        ) : filteredRecs.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No items meet this filter criteria. Inventory levels are currently optimal.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Product Name & SKU</th>
                  <th className="py-3 px-4 text-center">Current Stock</th>
                  <th className="py-3 px-4 text-center">Avg Daily Sales (ADS)</th>
                  <th className="py-3 px-4 text-center">Reorder Point (ROP)</th>
                  <th className="py-3 px-4 text-center">Est. Days to Stockout</th>
                  <th className="py-3 px-4 text-right">Recommended Order Qty</th>
                  <th className="py-3 px-4 text-right">Est. Cost (₹)</th>
                  <th className="py-3 px-4 text-center">Urgency</th>
                  <th className="py-3 px-4 text-center">Data Confidence</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecs.map((rec) => {
                  const p = rec.product;
                  return (
                    <tr
                      key={p._id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        rec.urgency === 'CRITICAL' ? 'bg-rose-50/30' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{p.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {p.sku} • {p.category}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span
                          className={`font-mono font-bold text-sm ${
                            rec.currentStock === 0
                              ? 'text-rose-600'
                              : rec.currentStock <= rec.reorderPoint
                              ? 'text-amber-600'
                              : 'text-slate-800'
                          }`}
                        >
                          {rec.currentStock} {p.unit}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-medium text-slate-700">
                        {rec.averageDailySales} <span className="text-[10px] text-slate-400">/day</span>
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-bold text-indigo-600">
                        {rec.reorderPoint} {p.unit}
                      </td>

                      <td className="py-3 px-4 text-center">
                        {rec.daysUntilStockout === null ? (
                          <span className="text-slate-400 text-[11px]">No Consumption</span>
                        ) : rec.daysUntilStockout === 0 ? (
                          <span className="font-mono font-bold text-rose-600 text-xs">Stocked Out</span>
                        ) : (
                          <span
                            className={`font-mono font-bold text-xs ${
                              rec.daysUntilStockout <= 5
                                ? 'text-rose-600'
                                : rec.daysUntilStockout <= 10
                                ? 'text-amber-600'
                                : 'text-emerald-600'
                            }`}
                          >
                            ~{rec.daysUntilStockout} days
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        {rec.recommendedOrderQty > 0 ? (
                          <span className="font-mono font-bold text-indigo-700 text-sm">
                            +{rec.recommendedOrderQty} {p.unit}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono">0</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {rec.estimatedRestockCost > 0
                          ? `₹${Number(rec.estimatedRestockCost || 0).toLocaleString('en-IN')}`
                          : '—'}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <StatusBadge status={rec.urgency} type="urgency" />
                      </td>

                      <td className="py-3 px-4 text-center" title={rec.dataSufficiencyNote}>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                            rec.confidence === 'HIGH'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : rec.confidence === 'MODERATE'
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {rec.confidence === 'HIGH'
                            ? 'High History'
                            : rec.confidence === 'MODERATE'
                            ? 'Moderate'
                            : 'Threshold Fallback'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => navigate('/purchases/new')}
                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors whitespace-nowrap"
                        >
                          Order Inward
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default RestockRecommendations;
