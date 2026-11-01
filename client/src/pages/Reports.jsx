import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import {
  FileBarChart,
  Download,
  Calendar,
  Layers,
  IndianRupee,
  TrendingUp,
  Truck,
  Package
} from 'lucide-react';

const Reports = () => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('sales'); // 'sales' | 'inventory' | 'purchases' | 'topProducts'
  const [loading, setLoading] = useState(false);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Data states
  const [salesData, setSalesData] = useState(null);
  const [inventoryData, setInventoryData] = useState(null);
  const [purchasesData, setPurchasesData] = useState([]);
  const [topProductsData, setTopProductsData] = useState([]);

  const fetchActiveReport = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      if (activeTab === 'sales') {
        const res = await api.get(`/reports/sales?${params.toString()}`);
        if (res.data.success) setSalesData(res.data);
      } else if (activeTab === 'inventory') {
        const res = await api.get('/reports/inventory-valuation');
        if (res.data.success) setInventoryData(res.data);
      } else if (activeTab === 'purchases') {
        const res = await api.get(`/reports/purchases?${params.toString()}`);
        if (res.data.success) setPurchasesData(res.data.data);
      } else if (activeTab === 'topProducts') {
        const res = await api.get(`/reports/top-products?${params.toString()}`);
        if (res.data.success) setTopProductsData(res.data.data);
      }
    } catch (err) {
      showToast('Error loading analytics report', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveReport();
  }, [activeTab, startDate, endDate]);

  const handleExportCSV = () => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    params.append('format', 'csv');

    let endpoint = '/reports/sales';
    if (activeTab === 'inventory') endpoint = '/reports/inventory-valuation';
    if (activeTab === 'purchases') endpoint = '/reports/purchases';
    if (activeTab === 'topProducts') endpoint = '/reports/top-products';

    window.open(`${import.meta.env.VITE_API_URL || '/api'}${endpoint}?${params.toString()}`, '_blank');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Financial & Operational Reports
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Server-aggregated revenue, gross profit, inventory valuation, and procurement reports
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
        >
          <Download className="w-4 h-4" />
          <span>Export Current Report (CSV)</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200">
        <div className="flex items-center gap-1">
          {[
            { id: 'sales', label: 'Sales & Gross Profit', icon: TrendingUp },
            { id: 'inventory', label: 'Inventory Valuation', icon: Layers },
            { id: 'purchases', label: 'Procurement & Spend', icon: Truck },
            { id: 'topProducts', label: 'Top Velocity Products', icon: Package }
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Date Filter Strip (for sales, purchases, and top products) */}
        {activeTab !== 'inventory' && (
          <div className="flex items-center gap-2 pb-2">
            <span className="text-[11px] font-semibold text-slate-500">Date Range:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-700"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-700"
            />
            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="text-xs text-rose-600 hover:text-rose-800 font-semibold ml-1"
              >
                Reset
              </button>
            )}
          </div>
        )}
      </div>

      {/* TAB 1: Sales & Gross Profit Report */}
      {activeTab === 'sales' && salesData && (
        <div className="space-y-6">
          {/* Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-semibold uppercase text-slate-400 block">Total Revenue</span>
              <span className="text-xl font-bold font-mono text-slate-900 mt-1 block">
                ₹{salesData.summary?.totalRevenue?.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-semibold uppercase text-slate-400 block">Total Cost of Goods</span>
              <span className="text-xl font-bold font-mono text-slate-700 mt-1 block">
                ₹{salesData.summary?.totalCost?.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-semibold uppercase text-slate-400 block">Gross Profit</span>
              <span className="text-xl font-bold font-mono text-emerald-600 mt-1 block">
                ₹{salesData.summary?.grossProfit?.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-semibold uppercase text-slate-400 block">Overall Margin</span>
              <span className="text-xl font-bold font-mono text-indigo-600 mt-1 block">
                {salesData.summary?.overallMargin}%
              </span>
            </div>
          </div>

          {/* Daily Breakdown Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 font-semibold text-xs text-slate-800 uppercase tracking-wide">
              Daily Sales Breakdown
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-center">Invoices</th>
                    <th className="py-3 px-4 text-center">Units Sold</th>
                    <th className="py-3 px-4 text-right">Revenue (₹)</th>
                    <th className="py-3 px-4 text-right">Cost (₹)</th>
                    <th className="py-3 px-4 text-right">Gross Profit (₹)</th>
                    <th className="py-3 px-4 text-right">Margin (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(salesData.dailyBreakdown || []).map((row) => {
                    const margin =
                      row.totalSales > 0 ? ((row.grossProfit / row.totalSales) * 100).toFixed(2) : 0;
                    return (
                      <tr key={row._id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-4 font-mono font-medium text-slate-800">{row._id}</td>
                        <td className="py-2.5 px-4 text-center font-bold text-slate-700">
                          {row.invoiceCount}
                        </td>
                        <td className="py-2.5 px-4 text-center font-bold text-slate-700">
                          {row.unitsSold}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                          ₹{row.totalSales.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-slate-600">
                          ₹{row.totalCost.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-600">
                          ₹{row.grossProfit.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-semibold text-indigo-600">
                          {margin}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Inventory Valuation Report */}
      {activeTab === 'inventory' && inventoryData && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-semibold uppercase text-slate-400 block">Total SKUs</span>
              <span className="text-xl font-bold font-mono text-slate-900 mt-1 block">
                {inventoryData.summary?.totalProducts}
              </span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-semibold uppercase text-slate-400 block">Units On-Hand</span>
              <span className="text-xl font-bold font-mono text-slate-900 mt-1 block">
                {inventoryData.summary?.totalUnits}
              </span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-semibold uppercase text-slate-400 block">Cost Valuation</span>
              <span className="text-xl font-bold font-mono text-indigo-600 mt-1 block">
                ₹{inventoryData.summary?.totalCostValuation?.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-semibold uppercase text-slate-400 block">Potential Retail Value</span>
              <span className="text-xl font-bold font-mono text-emerald-600 mt-1 block">
                ₹{inventoryData.summary?.totalRetailValuation?.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 font-semibold text-xs text-slate-800 uppercase tracking-wide">
              Valuation Breakdown by Category
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-center">Products Count</th>
                    <th className="py-3 px-4 text-center">Units in Stock</th>
                    <th className="py-3 px-4 text-right">Cost Valuation (₹)</th>
                    <th className="py-3 px-4 text-right">Retail Valuation (₹)</th>
                    <th className="py-3 px-4 text-right">Potential Gross Profit (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(inventoryData.categories || []).map((cat) => (
                    <tr key={cat.category} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-semibold text-slate-800">{cat.category}</td>
                      <td className="py-2.5 px-4 text-center font-bold text-slate-700">{cat.productCount}</td>
                      <td className="py-2.5 px-4 text-center font-bold text-slate-900">{cat.totalUnits}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-medium text-slate-700">
                        ₹{cat.costValuation.toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-indigo-600">
                        ₹{cat.retailValuation.toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-600">
                        ₹{cat.potentialProfit.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Procurement & Purchases Report */}
      {activeTab === 'purchases' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 font-semibold text-xs text-slate-800 uppercase tracking-wide">
            Vendor Procurement & Inward Spend Breakdown
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Supplier Company</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4 text-center">Inward Invoices</th>
                  <th className="py-3 px-4 text-right">Total Spent (₹)</th>
                  <th className="py-3 px-4 text-right">Amount Paid (₹)</th>
                  <th className="py-3 px-4 text-right">Balance Due (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {purchasesData.map((p) => (
                  <tr key={p.supplierId} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-semibold text-slate-900">{p.company}</td>
                    <td className="py-2.5 px-4 text-slate-500">{p.supplierName}</td>
                    <td className="py-2.5 px-4 text-center font-bold text-slate-700">
                      {p.purchaseCount}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                      ₹{p.totalSpent.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-medium text-emerald-600">
                      ₹{p.totalPaid.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-rose-600">
                      ₹{p.totalBalanceDue.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Top Velocity Products Report */}
      {activeTab === 'topProducts' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 font-semibold text-xs text-slate-800 uppercase tracking-wide">
            Top 10 Fast-Moving Revenue Generators
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Rank</th>
                  <th className="py-3 px-4">Product Name</th>
                  <th className="py-3 px-4 font-mono">SKU</th>
                  <th className="py-3 px-4 text-center">Units Sold</th>
                  <th className="py-3 px-4 text-right">Total Revenue (₹)</th>
                  <th className="py-3 px-4 text-right">Gross Profit (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topProductsData.map((p, idx) => (
                  <tr key={p._id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-400">#{idx + 1}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-900">{p.productName}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-500">{p.sku}</td>
                    <td className="py-2.5 px-4 text-center font-bold text-indigo-700">
                      {p.unitsSold}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                      ₹{p.totalRevenue.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-600">
                      ₹{p.totalProfit.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
