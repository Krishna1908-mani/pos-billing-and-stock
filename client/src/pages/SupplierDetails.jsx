import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import {
  Building,
  ArrowLeft,
  CreditCard,
  Truck,
  Phone,
  Mail,
  MapPin,
  Calendar,
  PlusCircle,
  FileText
} from 'lucide-react';

const SupplierDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [supplier, setSupplier] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Payment modal state
  const [paymentModal, setPaymentModal] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('BANK_TRANSFER');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [paying, setPaying] = useState(false);

  const fetchSupplierData = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/suppliers/${id}`);
      if (res.data.success) {
        setSupplier(res.data.data);
        setPurchases(res.data.purchases || []);
        setPayments(res.data.payments || []);
      }
    } catch (err) {
      showToast('Failed to load supplier statement', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSupplierData();
  }, [id]);

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    const amountNum = parseFloat(payAmount);
    if (!amountNum || amountNum <= 0) {
      showToast('Please enter a valid payment amount', 'warning');
      return;
    }

    setPaying(true);
    try {
      const res = await api.post('/payments', {
        supplier: supplier._id,
        amount: amountNum,
        paymentMethod: payMethod,
        referenceNumber: payRef,
        notes: payNotes
      });
      if (res.data.success) {
        showToast(res.data.message || 'Payment recorded successfully', 'success');
        setPaymentModal(false);
        setPayAmount('');
        setPayRef('');
        setPayNotes('');
        fetchSupplierData(); // Refresh statement and balance!
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Payment failed', 'error');
    } finally {
      setPaying(false);
    }
  };

  if (loading || !supplier) {
    return <div className="p-8 text-center text-slate-500 text-sm">Loading vendor statement...</div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/suppliers')}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Suppliers</span>
        </button>
        <button
          onClick={() => {
            setPayAmount(supplier.currentBalance > 0 ? supplier.currentBalance.toString() : '');
            setPaymentModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Record Supplier Payment</span>
        </button>
      </div>

      {/* Supplier Profile Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{supplier.company}</h1>
              <span className="px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700 font-medium">
                Active Supplier
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1">Contact Person: {supplier.name}</div>
            <div className="flex flex-wrap gap-4 text-xs text-slate-600 mt-3">
              <div className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-mono">{supplier.phone}</span>
              </div>
              {supplier.email && (
                <div className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>{supplier.email}</span>
                </div>
              )}
              {supplier.address && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>{supplier.address}</span>
                </div>
              )}
            </div>
          </div>

          <div className="text-right sm:border-l sm:border-slate-100 sm:pl-6">
            <div className="text-xs text-slate-400 font-medium">Net Outstanding Balance</div>
            <div
              className={`text-3xl font-extrabold font-mono mt-1 ${
                supplier.currentBalance > 0 ? 'text-rose-600' : 'text-emerald-600'
              }`}
            >
              ₹{(supplier.currentBalance || 0).toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Opening Balance: ₹{(supplier.openingBalance || 0).toLocaleString('en-IN')}
            </div>
          </div>
        </div>

        {/* Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-6">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <div className="text-[11px] text-slate-500 font-medium">Total Procurement (Spend)</div>
            <div className="text-lg font-bold text-slate-900 font-mono mt-0.5">
              ₹{(supplier.totalPurchases || 0).toLocaleString('en-IN')}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">{purchases.length} invoices received</div>
          </div>
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <div className="text-[11px] text-slate-500 font-medium">Total Payments Made</div>
            <div className="text-lg font-bold text-emerald-600 font-mono mt-0.5">
              ₹{(supplier.totalPayments || 0).toLocaleString('en-IN')}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">{payments.length} payment disbursements</div>
          </div>
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <div className="text-[11px] text-slate-500 font-medium">Payment Settlement Ratio</div>
            <div className="text-lg font-bold text-indigo-600 mt-0.5">
              {supplier.totalPurchases > 0
                ? `${Math.min(
                    Number(((supplier.totalPayments / supplier.totalPurchases) * 100).toFixed(1)),
                    100
                  )}%`
                : '100%'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Clearing efficiency</div>
          </div>
        </div>
      </div>

      {/* Purchases History */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
              Inward Purchase Invoices
            </h2>
          </div>
          <button
            onClick={() => navigate('/purchases/new')}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
          >
            + New Inward Bill
          </button>
        </div>

        {purchases.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No purchases recorded from this vendor.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-2.5 px-3">Purchase #</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3 text-right">Total Amount</th>
                  <th className="py-2.5 px-3 text-right">Amount Paid</th>
                  <th className="py-2.5 px-3 text-right">Balance Due</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {purchases.map((p) => (
                  <tr
                    key={p._id}
                    className="hover:bg-slate-50/60 cursor-pointer"
                    onClick={() => navigate(`/purchases/${p._id}`)}
                  >
                    <td className="py-2.5 px-3 font-semibold text-indigo-600">{p.purchaseNumber}</td>
                    <td className="py-2.5 px-3 text-slate-500">
                      {new Date(p.purchaseDate).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-900">
                      ₹{p.totalAmount.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-600">
                      ₹{p.amountPaid.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600">
                      ₹{p.balanceDue.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <StatusBadge status={p.paymentStatus} type="payment" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment History */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
            Payment Disbursements History
          </h2>
        </div>

        {payments.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No payments made yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-2.5 px-3">Receipt / Vch #</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Method</th>
                  <th className="py-2.5 px-3 text-right">Amount Paid</th>
                  <th className="py-2.5 px-3">Reference / UTR</th>
                  <th className="py-2.5 px-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((pay) => (
                  <tr key={pay._id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-3 font-semibold text-slate-800 font-mono">
                      {pay.paymentNumber}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">
                      {new Date(pay.paymentDate).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-700">{pay.paymentMethod}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600">
                      ₹{pay.amount.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">{pay.referenceNumber || '—'}</td>
                    <td className="py-2.5 px-3 text-slate-500">{pay.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      <Modal
        isOpen={paymentModal}
        onClose={() => setPaymentModal(false)}
        title={`Record Payment to ${supplier.company}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
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
              placeholder="0.00"
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
              <option value="BANK_TRANSFER">Bank Transfer (NEFT/RTGS/IMPS)</option>
              <option value="UPI">UPI / QR Code</option>
              <option value="CHEQUE">Cheque</option>
              <option value="CASH">Cash</option>
              <option value="CARD">Debit / Credit Card</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Transaction Reference / UTR / Cheque No.
            </label>
            <input
              type="text"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              placeholder="e.g. UTR-HDFC-991122"
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
              onClick={() => setPaymentModal(false)}
              className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={paying}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
            >
              {paying ? 'Recording...' : 'Confirm Payment'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default SupplierDetails;
