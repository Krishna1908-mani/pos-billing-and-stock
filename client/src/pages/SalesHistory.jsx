import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/StatusBadge';
import { TableSkeleton } from '../components/SkeletonLoader';
import {
  Receipt,
  Search,
  Filter,
  Eye,
  FileDown,
  Calendar,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const SalesHistory = () => {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [paymentMethod, setPaymentMethod] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });

  const { showToast } = useToast();
  const navigate = useNavigate();

  const fetchSales = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page,
        limit: 15,
        search,
        status: status === 'ALL' ? '' : status,
        paymentMethod: paymentMethod === 'ALL' ? '' : paymentMethod
      });
      const res = await api.get(`/sales?${params.toString()}`);
      if (res.data.success) {
        setSales(res.data.data);
        setPagination(res.data.pagination);
      }
    } catch (err) {
      showToast('Failed to fetch sales history', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, [page, status, paymentMethod]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setPage(1);
      fetchSales();
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Sales & Billing History</h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            View completed transactions, download invoices, and manage returns
          </p>
        </div>
        <button
          onClick={() => navigate('/pos')}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
        >
          <Receipt className="w-4 h-4" />
          <span>Open POS Counter</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by invoice number or customer name..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 text-slate-800"
          />
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          {/* Status Filter */}
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 text-slate-700"
          >
            <option value="ALL">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="RETURNED">Returned</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          {/* Payment Method Filter */}
          <select
            value={paymentMethod}
            onChange={(e) => {
              setPaymentMethod(e.target.value);
              setPage(1);
            }}
            className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 text-slate-700"
          >
            <option value="ALL">All Payment Methods</option>
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="CARD">Card</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
          </select>
        </div>
      </div>

      {/* Sales Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6">
            <TableSkeleton rows={8} cols={7} />
          </div>
        ) : sales.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No sales transactions found for the specified filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4 text-center">Items</th>
                  <th className="py-3 px-4 text-right">Grand Total (₹)</th>
                  <th className="py-3 px-4 text-right">Profit (₹)</th>
                  <th className="py-3 px-4 text-center">Payment</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sales.map((s) => (
                  <tr key={s._id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-semibold text-indigo-600 font-mono">
                        {s.invoiceNumber}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800">{s.customerName}</div>
                      {s.customerPhone && (
                        <div className="text-[10px] text-slate-400 font-mono">{s.customerPhone}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {new Date(s.saleDate).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-slate-700">
                      {s.items?.length || 0}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      ₹{s.grandTotal.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-600">
                      ₹{s.grossProfit.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-center font-medium text-slate-700">
                      {s.paymentMethod}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <StatusBadge status={s.status} type="sale" />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => navigate(`/sales/${s.invoiceNumber}`)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="View Bill Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            const token = localStorage.getItem('stockwise_token');
                            window.open(
                              `${import.meta.env.VITE_API_URL || '/api'}/sales/${s._id}/pdf${token ? `?token=${encodeURIComponent(token)}` : ''}`,
                              '_blank'
                            );
                          }}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Download Invoice PDF"
                        >
                          <FileDown className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-600">
            <div>
              Showing page <span className="font-semibold">{pagination.page}</span> of{' '}
              <span className="font-semibold">{pagination.pages}</span> ({pagination.total} invoices)
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
  );
};

export default SalesHistory;
