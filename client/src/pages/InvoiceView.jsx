import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import {
  Receipt,
  ArrowLeft,
  Printer,
  FileDown,
  RotateCcw,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';

const InvoiceView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [sale, setSale] = useState(null);
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);

  // Return modal state
  const [returnModal, setReturnModal] = useState(false);
  const [returnReason, setReturnReason] = useState('Customer changed mind');
  const [refundMethod, setRefundMethod] = useState('CASH');
  const [returning, setReturning] = useState(false);

  const fetchInvoice = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/sales/${id}`);
      if (res.data.success) {
        setSale(res.data.data);
        setReturns(res.data.returns || []);
      }
    } catch (err) {
      showToast('Error loading invoice', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoice();
  }, [id]);

  const handleProcessReturn = async (e) => {
    e.preventDefault();
    if (!returnReason.trim()) {
      showToast('Please provide a reason for the return', 'warning');
      return;
    }

    setReturning(true);
    try {
      const res = await api.post(`/sales/${sale._id}/return`, {
        reason: returnReason,
        refundMethod
      });
      if (res.data.success) {
        showToast(
          'Return processed successfully! Stock has been restored to inventory.',
          'success'
        );
        setReturnModal(false);
        fetchInvoice(); // Refresh state
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Return failed', 'error');
    } finally {
      setReturning(false);
    }
  };

  if (loading || !sale) {
    return <div className="p-8 text-center text-slate-500 text-sm">Loading invoice data...</div>;
  }

  const isReturned = sale.status === 'RETURNED';

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Action Buttons Header (Hidden in Print) */}
      <div className="no-print flex items-center justify-between">
        <button
          onClick={() => navigate('/sales')}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Sales</span>
        </button>

        <div className="flex items-center gap-2">
          {!isReturned && (
            <button
              onClick={() => setReturnModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Return / Cancel Sale</span>
            </button>
          )}

          <button
            onClick={() => {
              const token = localStorage.getItem('stockwise_token');
              window.open(
                `${import.meta.env.VITE_API_URL || '/api'}/sales/${sale._id}/pdf${token ? `?token=${encodeURIComponent(token)}` : ''}`,
                '_blank'
              );
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-semibold transition-colors"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>PDF Invoice</span>
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Invoice</span>
          </button>
        </div>
      </div>

      {/* Return Alert Banner if already returned */}
      {isReturned && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 text-amber-900 text-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div>
            <strong>This transaction has been refunded & returned.</strong> The items were returned to
            the stock ledger, and inventory balances were safely restored.
          </div>
        </div>
      )}

      {/* Printable Invoice Container */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-8 shadow-sm space-y-6">
        {/* Brand Header */}
        <div className="flex items-start justify-between pb-6 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-indigo-600">StockWise Retail</h1>
            <p className="text-xs text-slate-500 mt-0.5">Inventory & Sales Intelligence OS</p>
            <p className="text-xs text-slate-500 font-mono mt-1">GSTIN: 29ABCDE1234F1Z5</p>
            <p className="text-xs text-slate-500">Commercial Hub, Bangalore 560001 • +91 98765 43210</p>
          </div>

          <div className="text-right">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Tax Invoice
            </span>
            <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">
              {sale.invoiceNumber}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Date: {new Date(sale.saleDate).toLocaleDateString()}
            </div>
            <div className="mt-2">
              <StatusBadge status={sale.status} type="sale" />
            </div>
          </div>
        </div>

        {/* Customer Information Strip */}
        <div className="grid grid-cols-2 gap-4 text-xs py-2 bg-slate-50/70 p-4 rounded-xl border border-slate-100">
          <div>
            <span className="text-slate-400 uppercase font-semibold text-[10px] block">Billed To</span>
            <span className="font-bold text-slate-900 text-sm mt-0.5 block">{sale.customerName}</span>
            {sale.customerPhone && (
              <span className="font-mono text-slate-500 block mt-0.5">Phone: {sale.customerPhone}</span>
            )}
          </div>
          <div className="text-right">
            <span className="text-slate-400 uppercase font-semibold text-[10px] block">
              Payment Method
            </span>
            <span className="font-bold text-slate-900 text-sm mt-0.5 block">{sale.paymentMethod}</span>
            <span className="text-slate-500 text-[11px] block mt-0.5">Cashier: {sale.soldBy?.name || 'Store Staff'}</span>
          </div>
        </div>

        {/* Itemized Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-100">
              <tr>
                <th className="py-2.5 px-3 w-8">#</th>
                <th className="py-2.5 px-3">Item Description</th>
                <th className="py-2.5 px-3 font-mono">SKU</th>
                <th className="py-2.5 px-3 text-right">Qty</th>
                <th className="py-2.5 px-3 text-right">Unit Rate (₹)</th>
                <th className="py-2.5 px-3 text-right">Line Total (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sale.items.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-2.5 px-3 text-slate-400 font-mono">{idx + 1}</td>
                  <td className="py-2.5 px-3 font-semibold text-slate-800">{item.productName}</td>
                  <td className="py-2.5 px-3 font-mono text-slate-500">{item.sku}</td>
                  <td className="py-2.5 px-3 text-right font-bold text-slate-900">{item.quantity}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                    ₹{item.sellingPriceSnapshot.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                    ₹{item.lineTotal.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Summary */}
        <div className="pt-4 border-t border-slate-200 flex flex-col items-end space-y-1.5 text-xs">
          <div className="w-64 flex justify-between text-slate-600">
            <span>Subtotal:</span>
            <span className="font-mono font-semibold">₹{sale.subtotal.toFixed(2)}</span>
          </div>

          {sale.discount > 0 && (
            <div className="w-64 flex justify-between text-slate-600">
              <span>Discount:</span>
              <span className="font-mono text-emerald-600">- ₹{sale.discount.toFixed(2)}</span>
            </div>
          )}

          {sale.taxAmount > 0 && (
            <div className="w-64 flex justify-between text-slate-600">
              <span>GST Tax ({sale.taxRate}%):</span>
              <span className="font-mono">+ ₹{sale.taxAmount.toFixed(2)}</span>
            </div>
          )}

          <div className="w-64 flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
            <span>Grand Total:</span>
            <span className="font-mono text-indigo-600">₹{sale.grandTotal.toFixed(2)}</span>
          </div>

          <div className="w-64 flex justify-between text-slate-600">
            <span>Amount Paid:</span>
            <span className="font-mono">₹{sale.amountPaid.toFixed(2)}</span>
          </div>

          {sale.changeDue > 0 && (
            <div className="w-64 flex justify-between text-emerald-600 font-semibold">
              <span>Change Returned:</span>
              <span className="font-mono">₹{sale.changeDue.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Footer Notes */}
        <div className="pt-6 border-t border-slate-100 text-center text-[11px] text-slate-400">
          Thank you for shopping with us! Terms: Goods sold are subject to standard retail guarantee.
        </div>
      </div>

      {/* Return / Cancel Sale Modal */}
      <Modal
        isOpen={returnModal}
        onClose={() => setReturnModal(false)}
        title={`Process Return for Invoice ${sale.invoiceNumber}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleProcessReturn} className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs">
            Confirming this will restore all {sale.items.length} line items back to available
            inventory and record a financial refund transaction.
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Reason for Return <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows="2"
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder="e.g. Defective item, customer changed mind..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Refund Method</label>
            <select
              value={refundMethod}
              onChange={(e) => setRefundMethod(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
            >
              <option value="CASH">Cash Refund</option>
              <option value="ORIGINAL_PAYMENT">Original Payment Mode</option>
              <option value="STORE_CREDIT">Store Credit</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setReturnModal(false)}
              className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={returning}
              className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
            >
              {returning ? 'Restoring Stock...' : 'Confirm Return & Restock'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default InvoiceView;
