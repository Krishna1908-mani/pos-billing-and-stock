import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import KpiCard from '../components/KpiCard';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import { TableSkeleton } from '../components/SkeletonLoader';
import {
  CreditCard,
  AlertCircle,
  Building,
  Phone,
  Calendar,
  CheckCircle2,
  PlusCircle,
  ArrowRight
} from 'lucide-react';

const SupplierDues = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [duesData, setDuesData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Quick Payment Modal
  const [payModal, setPayModal] = useState(false);
  const [targetSupplier, setTargetSupplier] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('BANK_TRANSFER');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchDues = async () => {
    try {
      setLoading(true);
      const res = await api.get('/payments/dues');
      if (res.data.success) {
        setDuesData(res.data.data);
      }
    } catch (err) {
      showToast('Failed to load supplier payables', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDues();
  }, []);

  const openPayModal = (supplierItem) => {
    setTargetSupplier(supplierItem);
    setPayAmount(supplierItem.currentOutstanding?.toString() || '');
    setPayRef('');
    setPayNotes('');
    setPayModal(true);
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    const amountNum = parseFloat(payAmount);
    if (!amountNum || amountNum <= 0) {
      showToast('Please enter a valid payment amount', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/payments', {
        supplier: targetSupplier.supplier._id,
        amount: amountNum,
        paymentMethod: payMethod,
        referenceNumber: payRef,
        notes: payNotes
      });
      if (res.data.success) {
        showToast(res.data.message || 'Payment recorded successfully', 'success');
        setPayModal(false);
        fetchDues(); // Instantly update balances!
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Payment recording failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !duesData) {
    return <div className="p-8 text-center text-slate-500 text-sm">Loading supplier dues...</div>;
  }

  const summary = duesData?.summary || {};
  const payables = duesData?.payables || [];
  const unpaidInvoices = duesData?.unpaidPurchases || [];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Supplier Payables & Dues Intelligence
        </h1>
        <p className="text-xs text-slate-500 font-medium mt-0.5">
          Monitor vendor credit balances, overdue procurement bills, and record disbursements
        </p>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Total Outstanding Payables"
          value={`₹${Number(summary.totalOutstanding || duesData?.totalOutstandingAll || 0).toLocaleString('en-IN')}`}
          subtitle="Net accounts payable across all vendors"
          icon={CreditCard}
          color="purple"
        />
        <KpiCard
          title="Past Due / Overdue Amount"
          value={`₹${Number(summary.totalOverdue || duesData?.totalOverdueAll || 0).toLocaleString('en-IN')}`}
          subtitle="Bills exceeding agreed credit due dates"
          icon={AlertCircle}
          color="rose"
        />
        <KpiCard
          title="Suppliers with Open Dues"
          value={summary.suppliersWithDuesCount ?? duesData?.suppliersWithDuesCount ?? 0}
          subtitle="Active creditors awaiting settlement"
          icon={Building}
          color="indigo"
        />
      </div>

      {/* Payables by Supplier Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              Vendor Balance Statement
            </h2>
            <p className="text-xs text-slate-500">Opening balances + Inward bills − Disbursements</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">Supplier / Company</th>
                <th className="py-3 px-4">Phone</th>
                <th className="py-3 px-4 text-right">Total Purchased</th>
                <th className="py-3 px-4 text-right">Total Paid</th>
                <th className="py-3 px-4 text-right">Outstanding Due</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payables.map((item) => {
                const s = item.supplier || {};
                const currentOutstanding = Number(item.currentOutstanding ?? item.totalBalanceDue ?? 0);
                const totalPurchased = Number(item.totalPurchased ?? 0);
                const totalPayments = Number(item.totalPayments ?? item.totalPaidOnPurchases ?? 0);
                return (
                  <tr key={s._id || s.id || Math.random()} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{s.company || 'Unknown Supplier'}</div>
                      <div className="text-[11px] text-slate-500">{s.name}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">{s.phone || '—'}</td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-slate-700">
                      ₹{totalPurchased.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-emerald-600">
                      ₹{totalPayments.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span
                        className={`font-mono font-bold text-sm ${
                          currentOutstanding > 0 ? 'text-rose-600' : 'text-emerald-600'
                        }`}
                      >
                        ₹{currentOutstanding.toLocaleString('en-IN')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {item.hasOverdue ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                          Overdue Bills
                        </span>
                      ) : currentOutstanding > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">
                          Due
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800">
                          Cleared
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {item.currentOutstanding > 0 && (
                          <button
                            onClick={() => openPayModal(item)}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                          >
                            Pay Due
                          </button>
                        )}
                        <button
                          onClick={() => navigate(`/suppliers/${s._id}`)}
                          className="px-2.5 py-1 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-medium"
                        >
                          Statement
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unpaid / Upcoming Inward Bills */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 pb-2 border-b border-slate-100">
          Unsettled Purchase Invoices
        </h2>

        {unpaidInvoices.length === 0 ? (
          <p className="text-xs text-emerald-600 py-4 font-medium text-center">
            All purchase bills have been fully paid! No outstanding invoices.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-2.5 px-3">Purchase #</th>
                  <th className="py-2.5 px-3">Supplier</th>
                  <th className="py-2.5 px-3">Receipt Date</th>
                  <th className="py-2.5 px-3">Due Date</th>
                  <th className="py-2.5 px-3 text-right">Total Bill</th>
                  <th className="py-2.5 px-3 text-right">Balance Due</th>
                  <th className="py-2.5 px-3 text-center">Overdue?</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {unpaidInvoices.map((inv) => {
                  const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date();
                  return (
                    <tr key={inv._id || inv.id} className="hover:bg-slate-50/60">
                      <td className="py-2.5 px-3 font-mono font-semibold text-indigo-600">
                        {inv.purchaseNumber}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">
                        {inv.supplier?.company || inv.supplierCompany || 'Supplier'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        {inv.purchaseDate ? new Date(inv.purchaseDate).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 font-medium">
                        {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-900">
                        ₹{Number(inv.totalAmount || 0).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600">
                        ₹{Number(inv.balanceDue || 0).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {isOverdue ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                            Overdue
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                            Upcoming
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => navigate(`/purchases/${inv._id}`)}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                        >
                          View Bill &rarr;
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

      {/* Quick Pay Modal */}
      <Modal
        isOpen={payModal}
        onClose={() => setPayModal(false)}
        title={targetSupplier ? `Record Payment to ${targetSupplier.supplier.company}` : 'Record Payment'}
        maxWidth="max-w-md"
      >
        <form onSubmit={handlePaymentSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Payment Amount (₹) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Payment Method <span className="text-rose-500">*</span>
            </label>
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500"
            >
              <option value="BANK_TRANSFER">Bank Transfer (NEFT/RTGS)</option>
              <option value="UPI">UPI</option>
              <option value="CHEQUE">Cheque</option>
              <option value="CASH">Cash</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Reference / UTR / Cheque Number
            </label>
            <input
              type="text"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              placeholder="e.g. NEFT-998822"
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Audit Notes</label>
            <textarea
              rows="2"
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              placeholder="Payment remarks..."
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setPayModal(false)}
              className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
            >
              {submitting ? 'Recording...' : 'Disburse Payment'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default SupplierDues;
