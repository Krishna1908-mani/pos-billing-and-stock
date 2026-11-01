import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import KpiCard from '../components/KpiCard';
import StatusBadge from '../components/StatusBadge';
import { CardSkeleton } from '../components/SkeletonLoader';
import {
  Package,
  Layers,
  IndianRupee,
  TrendingUp,
  AlertTriangle,
  AlertOctagon,
  CreditCard,
  ShoppingCart,
  Calendar,
  ArrowRight,
  TrendingDown
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

const Dashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('30d');
  const navigate = useNavigate();

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/dashboard?timeRange=${timeRange}`);
      if (res.data.success) {
        setData(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [timeRange]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-slate-200 rounded w-1/4 animate-pulse" />
        <CardSkeleton count={8} />
      </div>
    );
  }

  const kpis = data?.kpis || {};
  const charts = data?.charts || {};
  const recent = data?.recentActivity || {};
  const alerts = data?.alerts || [];

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header with Time Range Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Executive Dashboard</h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Live operational intelligence & real-time inventory telemetry
          </p>
        </div>

        {/* Date Filter Tabs */}
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          <Calendar className="w-4 h-4 text-slate-400 ml-2 mr-1" />
          {[
            { label: 'Today', value: 'today' },
            { label: '7 Days', value: '7d' },
            { label: 'This Month', value: 'month' },
            { label: 'Last 30 Days', value: '30d' }
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setTimeRange(tab.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                timeRange === tab.value
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Critical Stock Alerts Banner */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, idx) => (
            <div
              key={idx}
              className={`flex items-center justify-between p-3.5 rounded-xl border text-xs font-medium ${
                alert.type === 'danger'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              <div className="flex items-center gap-2">
                {alert.type === 'danger' ? (
                  <AlertOctagon className="w-4 h-4 text-rose-600 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                )}
                <span>{alert.message}</span>
              </div>
              <button
                onClick={() => navigate('/restock')}
                className="font-bold underline hover:no-underline ml-4 flex-shrink-0"
              >
                View Restock Plan &rarr;
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 8 MongoDB Live KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Products"
          value={kpis.totalProducts ?? 0}
          subtitle="Catalog active SKUs"
          icon={Package}
          color="indigo"
        />
        <KpiCard
          title="Units in Stock"
          value={kpis.totalUnitsInStock ?? 0}
          subtitle="Current physical on-hand"
          icon={Layers}
          color="blue"
        />
        <KpiCard
          title="Stock Valuation"
          value={`₹${(kpis.currentStockValue || 0).toLocaleString('en-IN')}`}
          subtitle="Valued at purchase cost"
          icon={IndianRupee}
          color="emerald"
        />
        <KpiCard
          title="Today's Revenue"
          value={`₹${(kpis.todaySalesRevenue || 0).toLocaleString('en-IN')}`}
          subtitle={`${kpis.todayInvoicesCount || 0} bills closed today`}
          icon={ShoppingCart}
          color="indigo"
        />
        <KpiCard
          title="Today's Gross Profit"
          value={`₹${(kpis.todayGrossProfit || 0).toLocaleString('en-IN')}`}
          subtitle="Calculated from item cost snapshots"
          icon={TrendingUp}
          color="emerald"
        />
        <KpiCard
          title="Low Stock Items"
          value={kpis.lowStockCount ?? 0}
          subtitle="At or below safety threshold"
          icon={AlertTriangle}
          color="amber"
        />
        <KpiCard
          title="Out of Stock"
          value={kpis.outOfStockCount ?? 0}
          subtitle="Immediate restock required"
          icon={AlertOctagon}
          color="rose"
        />
        <KpiCard
          title="Supplier Payables"
          value={`₹${(kpis.outstandingSupplierBalance || 0).toLocaleString('en-IN')}`}
          subtitle="Net outstanding balances"
          icon={CreditCard}
          color="purple"
        />
      </div>

      {/* Recharts Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales & Profit Trend */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Revenue & Gross Profit Trend</h3>
              <p className="text-xs text-slate-500">Daily performance over selected window</p>
            </div>
          </div>
          <div className="h-72 w-full">
            {charts.salesTrend?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={charts.salesTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip
                    formatter={(val) => [`₹${Number(val).toLocaleString('en-IN')}`, '']}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke="#4f46e5"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorRev)"
                  />
                  <Area
                    type="monotone"
                    dataKey="profit"
                    name="Gross Profit"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorProfit)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No sales records in this time window
              </div>
            )}
          </div>
        </div>

        {/* Top Selling Products */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900">Top Velocity Products</h3>
            <p className="text-xs text-slate-500">Highest revenue contributors</p>
          </div>
          <div className="h-72 w-full">
            {charts.topProducts?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={charts.topProducts}
                  layout="vertical"
                  margin={{ top: 5, right: 10, left: 15, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 10, fill: '#475569' }} />
                  <Tooltip
                    formatter={(val, name) => [
                      name === 'revenue' ? `₹${Number(val).toLocaleString('en-IN')}` : val,
                      name === 'revenue' ? 'Revenue' : 'Units Sold'
                    ]}
                    contentStyle={{ borderRadius: '12px', fontSize: '11px' }}
                  />
                  <Bar dataKey="revenue" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No transaction data available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sales Table */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Recent Sales Invoices</h3>
              <p className="text-xs text-slate-500">Latest completed customer checkout events</p>
            </div>
            <button
              onClick={() => navigate('/sales')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-semibold border-y border-slate-100">
                <tr>
                  <th className="py-2.5 px-3">Invoice</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">Payment</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(recent.sales || []).map((sale) => (
                  <tr
                    key={sale._id}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    onClick={() => navigate(`/sales/${sale.invoiceNumber}`)}
                  >
                    <td className="py-2.5 px-3 font-semibold text-indigo-600">{sale.invoiceNumber}</td>
                    <td className="py-2.5 px-3 text-slate-700">{sale.customerName}</td>
                    <td className="py-2.5 px-3 font-medium text-slate-900">₹{sale.grandTotal.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-slate-600">{sale.paymentMethod}</td>
                    <td className="py-2.5 px-3">
                      <StatusBadge status={sale.status} type="sale" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Purchases Table */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Recent Purchases (Inward)</h3>
              <p className="text-xs text-slate-500">Latest supplier shipments received</p>
            </div>
            <button
              onClick={() => navigate('/purchases')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-semibold border-y border-slate-100">
                <tr>
                  <th className="py-2.5 px-3">Purchase #</th>
                  <th className="py-2.5 px-3">Supplier</th>
                  <th className="py-2.5 px-3">Total</th>
                  <th className="py-2.5 px-3">Due</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(recent.purchases || []).map((p) => (
                  <tr
                    key={p._id}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    onClick={() => navigate(`/purchases/${p._id}`)}
                  >
                    <td className="py-2.5 px-3 font-semibold text-indigo-600">{p.purchaseNumber}</td>
                    <td className="py-2.5 px-3 text-slate-700">{p.supplier?.company || 'Supplier'}</td>
                    <td className="py-2.5 px-3 font-medium text-slate-900">₹{p.totalAmount.toFixed(2)}</td>
                    <td className="py-2.5 px-3 font-medium text-rose-600">₹{p.balanceDue.toFixed(2)}</td>
                    <td className="py-2.5 px-3">
                      <StatusBadge status={p.paymentStatus} type="payment" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
