import { useState, useEffect } from 'react';
import { api } from '../api';
import type { Account, Vendor } from '../api';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export default function Expenses() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [entries, setEntries] = useState<Array<Record<string, unknown>>>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    amount: 0,
    expenseAccountId: '',
    paymentAccountId: '',
    memo: '',
    vendorId: '',
  });

  const load = () => {
    api<Account[]>('accounts.list', {}).then(setAccounts);
    api<Vendor[]>('vendors.list', {}).then(setVendors);
    api<Array<Record<string, unknown>>>('journal.list', { limit: 50 }).then(setEntries);
  };

  useEffect(() => { load(); }, []);

  const expenseAccounts = accounts.filter((a) => a.type === 'expense');
  const bankAccounts = accounts.filter((a) => a.subtype === 'bank' || a.subtype === 'other_current_liability');

  const handleSubmit = async () => {
    if (!form.expenseAccountId || !form.paymentAccountId || form.amount <= 0) {
      setError('Fill in all required fields');
      return;
    }
    try {
      await api('expenses.record', {
        date: form.date,
        amount: form.amount,
        expenseAccountId: form.expenseAccountId,
        paymentAccountId: form.paymentAccountId,
        memo: form.memo || null,
        vendorId: form.vendorId || null,
      });
      setShowForm(false);
      setError('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record expense');
    }
  };

  const expenseEntries = entries.filter((e) => e.sourceType === 'expense' || e.sourceType === 'import');

  return (
    <div>
      <div className="page-header">
        <h1>Expenses</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>Record Expense</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>Record Expense</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Amount</label>
              <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="form-group">
              <label>Expense Category</label>
              <select value={form.expenseAccountId} onChange={(e) => setForm({ ...form, expenseAccountId: e.target.value })}>
                <option value="">Select...</option>
                {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Paid From</label>
              <select value={form.paymentAccountId} onChange={(e) => setForm({ ...form, paymentAccountId: e.target.value })}>
                <option value="">Select...</option>
                {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Memo</label>
              <input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary" onClick={handleSubmit}>Save Expense</button>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        {expenseEntries.length === 0 ? (
          <div className="empty-state">No expenses recorded yet.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Date</th><th>Memo</th><th className="text-right">Amount</th></tr>
            </thead>
            <tbody>
              {expenseEntries.map((e) => (
                <tr key={e.id as string}>
                  <td>{e.date as string}</td>
                  <td>{(e.memo as string) ?? '—'}</td>
                  <td className="text-right font-mono text-expense">
                    {formatCurrency(
                      ((e.lines as Array<{ debit: number }>) ?? []).reduce((s, l) => s + l.debit, 0)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="page-header" style={{ marginBottom: 16 }}>
          <h3>Vendors</h3>
          <NewVendorButton onCreated={load} />
        </div>
        {vendors.length === 0 ? (
          <p className="text-muted">No vendors yet.</p>
        ) : (
          <table>
            <thead><tr><th>Name</th><th>Email</th></tr></thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id}><td>{v.name}</td><td>{v.email ?? '—'}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function NewVendorButton({ onCreated }: { onCreated: () => void }) {
  const [show, setShow] = useState(false);
  const [name, setName] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return;
    await api('vendors.create', { name: name.trim() });
    setShow(false);
    setName('');
    onCreated();
  };

  if (!show) return <button className="btn btn-sm btn-secondary" onClick={() => setShow(true)}>Add Vendor</button>;

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <input placeholder="Vendor name" value={name} onChange={(e) => setName(e.target.value)} />
      <button className="btn btn-sm btn-primary" onClick={handleCreate}>Save</button>
      <button className="btn btn-sm btn-secondary" onClick={() => setShow(false)}>Cancel</button>
    </div>
  );
}
