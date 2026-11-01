import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import StatusBadge from '../components/StatusBadge';
import { Truck, ArrowLeft, Building, Calendar, CreditCard } from 'lucide-react';

const PurchaseDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [purchase, setPurchase] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPurchase = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/purchases/${id}`);
        if (res.data.success) {
          setPurchase(res.data.data);
          setPayments(res.data.payments || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchPurchase();
  }, [id]);

  if (loading || !purchase) {
    return <div className="p-8 text-center text-slate-500 text-sm">Loading purchase bill...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/purchases')}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Purchases</span>
        </button>
        <div className="flex items-center gap-2">
          <StatusBadge status={purchase.paymentStatus} type="payment" />
        </div>
      </div>

      {/* Bill Overview Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="text-xs text-slate-400 uppercase font-semibold">Purchase Inward Order</div>
            <h1 className="text-2xl font-bold font-mono text-slate-900 mt-0.5">
              {purchase.purchaseNumber}
            </h1>
            {purchase.supplierInvoiceNumber && (
              <div className="text-xs text-slate-500 font-mono mt-0.5">
                Supplier Bill Ref: {purchase.supplierInvoiceNumber}
              </div>
            )}
            <div className="text-xs text-slate-500 mt-2">
              Receipt Date: {new Date(purchase.purchaseDate).toLocaleDateString()}
              {purchase.dueDate && ` • Due Date: ${new Date(purchase.dueDate).toLocaleDateString()}`}
            </div>
          </div>

          <div className="sm:text-right">
            <div className="text-xs text-slate-400 uppercase font-semibold">Supplier Details</div>
            <div className="text-base font-bold text-slate-900 mt-0.5">
              {purchase.supplier?.company || 'Supplier'}
            </div>
            <div className="text-xs text-slate-500">{purchase.supplier?.name}</div>
            <div className="text-xs font-mono text-slate-500">{purchase.supplier?.phone}</div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-100">
              <tr>
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Product Name</th>
                <th className="py-2.5 px-3 font-mono">SKU</th>
                <th className="py-2.5 px-3 text-right">Qty Inwarded</th>
                <th className="py-2.5 px-3 text-right">Unit Cost</th>
                <th className="py-2.5 px-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(purchase.items || []).map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50">
                  <td className="py-2.5 px-3 text-slate-400 font-mono">{idx + 1}</td>
                  <td className="py-2.5 px-3 font-semibold text-slate-800">{item.productName}</td>
                  <td className="py-2.5 px-3 font-mono text-slate-500">{item.sku}</td>
                  <td className="py-2.5 px-3 text-right font-bold text-slate-900">{item.quantity}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                    ₹{item.unitCost.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                    ₹{item.lineTotal.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Strip */}
        <div className="pt-4 border-t border-slate-100 flex flex-col items-end space-y-1.5 text-xs">
          <div className="w-64 flex justify-between text-slate-600">
            <span>Subtotal:</span>
            <span className="font-mono font-semibold">₹{purchase.subtotal.toFixed(2)}</span>
          </div>
          {purchase.discount > 0 && (
            <div className="w-64 flex justify-between text-slate-600">
              <span>Discount:</span>
              <span className="font-mono text-emerald-600">- ₹{purchase.discount.toFixed(2)}</span>
            </div>
          )}
          {purchase.tax > 0 && (
            <div className="w-64 flex justify-between text-slate-600">
              <span>Tax / GST:</span>
              <span className="font-mono">+ ₹{purchase.tax.toFixed(2)}</span>
            </div>
          )}
          <div className="w-64 flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
            <span>Total Inward:</span>
            <span className="font-mono text-indigo-600">₹{purchase.totalAmount.toFixed(2)}</span>
          </div>
          <div className="w-64 flex justify-between font-semibold text-emerald-600">
            <span>Amount Paid:</span>
            <span className="font-mono">₹{purchase.amountPaid.toFixed(2)}</span>
          </div>
          <div className="w-64 flex justify-between font-bold text-rose-600">
            <span>Balance Due:</span>
            <span className="font-mono">₹{purchase.balanceDue.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Linked Payments Table */}
      {payments.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
              Payments Recorded Against This Invoice
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-2.5 px-3">Receipt #</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Method</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                  <th className="py-2.5 px-3">Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((pay) => (
                  <tr key={pay._id}>
                    <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">
                      {pay.paymentNumber}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">
                      {new Date(pay.paymentDate).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 px-3">{pay.paymentMethod}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600">
                      ₹{pay.amount.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">
                      {pay.referenceNumber || '—'}
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

export default PurchaseDetails;
