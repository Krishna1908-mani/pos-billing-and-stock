import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import { Truck, ArrowLeft, Plus, Trash2, Save, ShoppingBag } from 'lucide-react';

const NewPurchase = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [supplier, setSupplier] = useState('');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [items, setItems] = useState([
    { product: '', quantity: 1, unitCost: 0, lineTotal: 0 }
  ]);
  const [discount, setDiscount] = useState('0');
  const [tax, setTax] = useState('0');
  const [amountPaid, setAmountPaid] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [supRes, prodRes] = await Promise.all([
          api.get('/suppliers'),
          api.get('/products?limit=200')
        ]);
        if (supRes.data.success) setSuppliers(supRes.data.data);
        if (prodRes.data.success) setProducts(prodRes.data.data);
      } catch (err) {
        showToast('Error loading suppliers or product catalogue', 'error');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleItemChange = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = value;

    if (field === 'product') {
      const selected = products.find((p) => p._id === value);
      if (selected) {
        updated[index].unitCost = selected.purchaseCost || 0;
      }
    }

    const qty = parseFloat(updated[index].quantity) || 0;
    const cost = parseFloat(updated[index].unitCost) || 0;
    updated[index].lineTotal = Number((qty * cost).toFixed(2));

    setItems(updated);
  };

  const handleAddItem = () => {
    setItems([...items, { product: '', quantity: 1, unitCost: 0, lineTotal: 0 }]);
  };

  const handleRemoveItem = (index) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  // Authoritative dynamic subtotal
  const subtotal = Number(
    items.reduce((sum, item) => sum + (parseFloat(item.lineTotal) || 0), 0).toFixed(2)
  );
  const discountNum = Math.max(parseFloat(discount) || 0, 0);
  const taxNum = Math.max(parseFloat(tax) || 0, 0);
  const totalAmount = Number((subtotal - discountNum + taxNum).toFixed(2));
  const paidNum = Math.min(Math.max(parseFloat(amountPaid) || 0, 0), totalAmount);
  const balanceDue = Number((totalAmount - paidNum).toFixed(2));

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!supplier) {
      showToast('Please select a supplier', 'warning');
      return;
    }

    // Validate items
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.product) {
        showToast(`Please select a product for line item #${i + 1}`, 'warning');
        return;
      }
      if (it.quantity <= 0) {
        showToast(`Quantity must be at least 1 for line item #${i + 1}`, 'warning');
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        supplier,
        supplierInvoiceNumber,
        purchaseDate,
        dueDate: dueDate || null,
        items,
        discount: discountNum,
        tax: taxNum,
        amountPaid: paidNum,
        paymentMethod,
        notes,
        idempotencyKey: `PUR-IDEMP-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
      };

      const res = await api.post('/purchases', payload);
      if (res.data.success) {
        showToast('Purchase recorded! Stock successfully inwarded to inventory.', 'success');
        navigate(`/purchases/${res.data.data._id}`);
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to record purchase', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500 text-sm">Loading procurement form...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/purchases')}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Purchases</span>
        </button>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Truck className="w-5 h-5 text-indigo-600" />
          <span>Inward Purchase Invoice</span>
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Supplier & Invoice Meta */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 pb-2 border-b border-slate-100">
            Vendor & Shipment Details
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Supplier Vendor <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 text-slate-800"
              >
                <option value="">Select a supplier...</option>
                {suppliers.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.company} ({s.name})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Supplier Bill / Invoice #
              </label>
              <input
                type="text"
                value={supplierInvoiceNumber}
                onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                placeholder="e.g. APX-9941"
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono uppercase focus:ring-2 focus:ring-indigo-500 text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Purchase / Receipt Date
              </label>
              <input
                type="date"
                required
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 text-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-indigo-600" />
              Inward Stock Line Items
            </h2>
            <button
              type="button"
              onClick={handleAddItem}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Another Item</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-2.5 px-3 w-10">#</th>
                  <th className="py-2.5 px-3">Product Description</th>
                  <th className="py-2.5 px-3 text-right w-28">Quantity</th>
                  <th className="py-2.5 px-3 text-right w-32">Unit Cost (₹)</th>
                  <th className="py-2.5 px-3 text-right w-32">Line Total (₹)</th>
                  <th className="py-2.5 px-3 text-center w-12">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, index) => (
                  <tr key={index} className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-3 text-slate-400 font-mono">{index + 1}</td>
                    <td className="py-2.5 px-3">
                      <select
                        required
                        value={item.product}
                        onChange={(e) => handleItemChange(index, 'product', e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                      >
                        <option value="">Select product to inward...</option>
                        {products.map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.name} ({p.sku}) — Current Stock: {p.stockQuantity} {p.unit}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <input
                        type="number"
                        min="1"
                        required
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                        className="w-full text-right px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={item.unitCost}
                        onChange={(e) => handleItemChange(index, 'unitCost', e.target.value)}
                        className="w-full text-right px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                      ₹{item.lineTotal.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        disabled={items.length <= 1}
                        onClick={() => handleRemoveItem(index)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded disabled:opacity-30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Financial Summary & Payment */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Payment Terms */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 pb-2 border-b border-slate-100">
              Payment Terms & Settlement
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Amount Paid Now (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={totalAmount}
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                >
                  <option value="BANK_TRANSFER">Bank Transfer (NEFT/RTGS)</option>
                  <option value="UPI">UPI</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="CASH">Cash</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Payment Due Date (for balance credit)
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
                <textarea
                  rows="2"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Inward verification comments..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* Totals Summary */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 pb-2 border-b border-slate-100">
              Procurement Summary
            </h2>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal ({items.length} items):</span>
                <span className="font-mono font-semibold">₹{subtotal.toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-center text-slate-600">
                <span>Discount (₹):</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="w-24 text-right px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-mono"
                />
              </div>

              <div className="flex justify-between items-center text-slate-600">
                <span>Taxes & GST (₹):</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                  className="w-24 text-right px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-mono"
                />
              </div>

              <div className="flex justify-between text-sm font-bold text-slate-900 pt-3 border-t border-slate-100">
                <span>Grand Total:</span>
                <span className="font-mono text-base text-indigo-600">₹{totalAmount.toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-xs font-semibold text-emerald-700 pt-1">
                <span>Amount Paid Now:</span>
                <span className="font-mono">₹{paidNum.toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-xs font-bold text-rose-600 pt-1 border-t border-dashed border-slate-200">
                <span>Balance Added to Supplier Payable:</span>
                <span className="font-mono">₹{balanceDue.toFixed(2)}</span>
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/30 transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{submitting ? 'Inwarding Inventory...' : 'Confirm & Inward Stock'}</span>
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

export default NewPurchase;
