import { useState, useEffect } from 'react';
import { api } from '../api';
import type { Account, ProfitAndLossReport } from '../api';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export default function Dashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [pnl, setPnl] = useState<ProfitAndLossReport | null>(null);

  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    api<Account[]>('accounts.list', {}).then(setAccounts);
    api<ProfitAndLossReport>('reports.pnl', { startDate, endDate, basis: 'cash' }).then(setPnl);
  }, []);

  const bankAccounts = accounts.filter((a) => a.subtype === 'bank');
  const totalCash = bankAccounts.reduce((sum, a) => sum + a.balance, 0);

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div className="card">
          <p className="text-muted" style={{ fontSize: 13, marginBottom: 4 }}>Cash on Hand</p>
          <p style={{ fontSize: 28, fontFamily: 'var(--font-display)' }}>{formatCurrency(totalCash)}</p>
        </div>
        <div className="card">
          <p className="text-muted" style={{ fontSize: 13, marginBottom: 4 }}>YTD Income</p>
          <p style={{ fontSize: 28, fontFamily: 'var(--font-display)', color: 'var(--color-income)' }}>
            {formatCurrency(pnl?.income.reduce((s, l) => s + l.amount, 0) ?? 0)}
          </p>
        </div>
        <div className="card">
          <p className="text-muted" style={{ fontSize: 13, marginBottom: 4 }}>YTD Expenses</p>
          <p style={{ fontSize: 28, fontFamily: 'var(--font-display)', color: 'var(--color-expense)' }}>
            {formatCurrency(pnl?.expenses.reduce((s, l) => s + l.amount, 0) ?? 0)}
          </p>
        </div>
        <div className="card">
          <p className="text-muted" style={{ fontSize: 13, marginBottom: 4 }}>Net Income (YTD)</p>
          <p style={{ fontSize: 28, fontFamily: 'var(--font-display)' }}>
            {formatCurrency(pnl?.netIncome ?? 0)}
          </p>
        </div>
      </div>

      {bankAccounts.length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Bank Accounts</h3>
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {bankAccounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.code} — {a.name}</td>
                  <td className="text-right font-mono">{formatCurrency(a.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
