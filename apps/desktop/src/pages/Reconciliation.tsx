import { useState, useEffect } from 'react';
import { api } from '../api';
import type { Account } from '../api';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

interface ReconSession {
  id: string;
  accountId: string;
  statementDate: string;
  statementBalance: number;
  clearedBalance: number;
  difference: number;
  status: string;
  items: Array<{
    id: string;
    date: string;
    memo: string;
    debit: number;
    credit: number;
    isCleared: boolean;
  }>;
}

export default function Reconciliation() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [session, setSession] = useState<ReconSession | null>(null);
  const [form, setForm] = useState({
    accountId: '',
    statementDate: new Date().toISOString().slice(0, 10),
    statementBalance: 0,
  });
  const [error, setError] = useState('');

  useEffect(() => {
    api<Account[]>('accounts.list', {}).then((accts) => {
      setAccounts(accts);
      const bank = accts.find((a) => a.subtype === 'bank');
      if (bank) setForm((f) => ({ ...f, accountId: bank.id }));
    });
  }, []);

  const bankAccounts = accounts.filter((a) => a.subtype === 'bank');

  const handleStart = async () => {
    if (!form.accountId) {
      setError('Select a bank account');
      return;
    }
    try {
      const result = await api<ReconSession>('reconciliation.start', form);
      setSession(result);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start reconciliation');
    }
  };

  const handleToggle = async (itemId: string, isCleared: boolean) => {
    const result = await api<ReconSession>('reconciliation.toggle', { itemId, isCleared });
    setSession(result);
  };

  const handleComplete = async () => {
    if (!session) return;
    if (Math.abs(session.difference) > 0.01) {
      setError(`Difference of ${formatCurrency(session.difference)} must be zero to complete`);
      return;
    }
    await api('reconciliation.complete', { sessionId: session.id });
    setSession(null);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Bank Reconciliation</h1>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!session ? (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Start Reconciliation</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label>Bank Account</label>
              <select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
                <option value="">Select...</option>
                {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Statement Date</label>
              <input type="date" value={form.statementDate} onChange={(e) => setForm({ ...form, statementDate: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Statement Balance</label>
              <input type="number" value={form.statementBalance} onChange={(e) => setForm({ ...form, statementBalance: parseFloat(e.target.value) || 0 })} />
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleStart} style={{ marginTop: 8 }}>Start Reconciliation</button>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <div>
                <p className="text-muted" style={{ fontSize: 13 }}>Statement Balance</p>
                <p style={{ fontSize: 20, fontFamily: 'var(--font-display)' }}>{formatCurrency(session.statementBalance)}</p>
              </div>
              <div>
                <p className="text-muted" style={{ fontSize: 13 }}>Cleared Balance</p>
                <p style={{ fontSize: 20, fontFamily: 'var(--font-display)' }}>{formatCurrency(session.clearedBalance)}</p>
              </div>
              <div>
                <p className="text-muted" style={{ fontSize: 13 }}>Difference</p>
                <p style={{ fontSize: 20, fontFamily: 'var(--font-display)', color: session.difference === 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                  {formatCurrency(session.difference)}
                </p>
              </div>
            </div>
          </div>

          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Cleared</th>
                  <th>Date</th>
                  <th>Memo</th>
                  <th className="text-right">Debit</th>
                  <th className="text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {session.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={item.isCleared}
                        onChange={(e) => handleToggle(item.id, e.target.checked)}
                      />
                    </td>
                    <td>{item.date}</td>
                    <td>{item.memo ?? '—'}</td>
                    <td className="text-right font-mono">{item.debit > 0 ? formatCurrency(item.debit) : ''}</td>
                    <td className="text-right font-mono">{item.credit > 0 ? formatCurrency(item.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-primary" onClick={handleComplete}>Complete Reconciliation</button>
              <button className="btn btn-secondary" onClick={() => setSession(null)}>Cancel</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
