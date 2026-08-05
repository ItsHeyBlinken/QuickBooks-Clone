import { useState, useEffect } from 'react';
import { api } from '../api';
import type { Bill, Vendor, Account } from '../api';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export default function Bills() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showPayment, setShowPayment] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    vendorId: '',
    billNumber: '',
    date: new Date().toISOString().slice(0, 10),
    description: '',
    amount: 0,
  });

  const [paymentForm, setPaymentForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    amount: 0,
    paymentAccountId: '',
  });

  const load = () => {
    api<Bill[]>('bills.list', {}).then(setBills);
    api<Vendor[]>('vendors.list', {}).then(setVendors);
    api<Account[]>('accounts.list', {}).then(setAccounts);
  };

  useEffect(() => { load(); }, []);

  const expenseAccount = accounts.find((a) => a.subtype === 'expense');
  const bankAccount = accounts.find((a) => a.subtype === 'bank');
  const paymentAccounts = accounts.filter(
    (a) => a.subtype === 'bank' || a.subtype === 'other_current_liability',
  );

  const handleCreate = async () => {
    if (!form.vendorId || !form.billNumber) {
      setError('Vendor and bill number are required');
      return;
    }
    try {
      await api('bills.create', {
        vendorId: form.vendorId,
        billNumber: form.billNumber,
        date: form.date,
        lines: [{
          description: form.description || 'Bill',
          quantity: 1,
          unitPrice: form.amount,
          accountId: expenseAccount?.id,
        }],
      });
      setShowForm(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create bill');
    }
  };

  const handlePayment = async (billId: string) => {
    const paymentAccountId = paymentForm.paymentAccountId || bankAccount?.id;
    if (!paymentAccountId) {
      setError('Select an account to pay from');
      return;
    }
    try {
      await api('bills.pay', {
        billId,
        date: paymentForm.date,
        amount: paymentForm.amount,
        paymentAccountId,
      });
      setShowPayment(null);
      setError('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record payment');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Bills (Accounts Payable)</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>Enter Bill</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>Enter Bill</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label>Vendor</label>
              <select value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })}>
                <option value="">Select vendor...</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Bill Number</label>
              <input value={form.billNumber} onChange={(e) => setForm({ ...form, billNumber: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Amount</label>
              <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary" onClick={handleCreate}>Save Bill</button>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {showPayment && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>Pay Bill</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label>Payment Date</label>
              <input type="date" value={paymentForm.date} onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Amount</label>
              <input type="number" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="form-group">
              <label>Pay From</label>
              <select
                value={paymentForm.paymentAccountId}
                onChange={(e) => setPaymentForm({ ...paymentForm, paymentAccountId: e.target.value })}
              >
                <option value="">Select account...</option>
                {paymentAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary" onClick={() => handlePayment(showPayment)}>Record Payment</button>
            <button className="btn btn-secondary" onClick={() => setShowPayment(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        {bills.length === 0 ? (
          <div className="empty-state">No bills entered yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Bill #</th>
                <th>Date</th>
                <th>Vendor</th>
                <th className="text-right">Total</th>
                <th className="text-right">Paid</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bills.map((bill) => {
                const vendor = vendors.find((v) => v.id === bill.vendorId);
                return (
                  <tr key={bill.id}>
                    <td>{bill.billNumber}</td>
                    <td>{bill.date}</td>
                    <td>{vendor?.name ?? '—'}</td>
                    <td className="text-right font-mono">{formatCurrency(bill.total)}</td>
                    <td className="text-right font-mono">{formatCurrency(bill.amountPaid)}</td>
                    <td><span className={`badge ${bill.status === 'paid' ? 'badge-success' : 'badge-warning'}`}>{bill.status}</span></td>
                    <td>
                      {bill.status !== 'paid' && (
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => {
                            setShowPayment(bill.id);
                            setPaymentForm({
                              date: new Date().toISOString().slice(0, 10),
                              amount: bill.total - bill.amountPaid,
                              paymentAccountId: bankAccount?.id ?? paymentAccounts[0]?.id ?? '',
                            });
                          }}
                        >
                          Pay Bill
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
