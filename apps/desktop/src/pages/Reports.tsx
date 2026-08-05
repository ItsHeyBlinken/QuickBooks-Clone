import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { ProfitAndLossReport, BalanceSheetReport } from '../api';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

type ReportType = 'pnl' | 'balanceSheet' | 'trialBalance' | 'cashFlow' | 'agingAr' | 'agingAp';

export default function Reports() {
  const [reportType, setReportType] = useState<ReportType>('pnl');
  const [basis, setBasis] = useState<'cash' | 'accrual'>('cash');
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(`${new Date().getFullYear()}-12-31`);
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [pnl, setPnl] = useState<ProfitAndLossReport | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetReport | null>(null);
  const [trialBalance, setTrialBalance] = useState<{ lines: Array<{ accountCode: string; accountName: string; debit: number; credit: number }> } | null>(null);
  const [cashFlow, setCashFlow] = useState<{ operating: number; netChange: number } | null>(null);
  const [aging, setAging] = useState<{ items: Array<Record<string, unknown>> } | null>(null);
  const [drillDown, setDrillDown] = useState<Array<Record<string, unknown>> | null>(null);
  const [drillAccount, setDrillAccount] = useState('');
  const [canDrillDown, setCanDrillDown] = useState(false);
  const [licenseReady, setLicenseReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ allowed: boolean }>('license.checkFeature', { feature: 'advanced_reporting' })
      .then((result) => setCanDrillDown(result.allowed))
      .catch(() => setCanDrillDown(false))
      .finally(() => setLicenseReady(true));
  }, []);

  const runReport = async () => {
    setDrillDown(null);
    setError('');
    try {
      switch (reportType) {
        case 'pnl':
          setPnl(await api('reports.pnl', { startDate, endDate, basis }));
          break;
        case 'balanceSheet':
          setBalanceSheet(await api('reports.balanceSheet', { asOfDate, basis }));
          break;
        case 'trialBalance':
          setTrialBalance(await api('reports.trialBalance', { asOfDate, basis }));
          break;
        case 'cashFlow':
          setCashFlow(await api('reports.cashFlow', { startDate, endDate }));
          break;
        case 'agingAr':
          setAging(await api('reports.aging', { type: 'ar', asOfDate }));
          break;
        case 'agingAp':
          setAging(await api('reports.aging', { type: 'ap', asOfDate }));
          break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run report');
    }
  };

  useEffect(() => { runReport(); }, []);

  const handleDrillDown = async (accountId: string, accountName: string) => {
    if (!canDrillDown) {
      setError('Report drill-down requires a Pro license or an active trial. Open License to upgrade or start a trial.');
      return;
    }
    try {
      setError('');
      setDrillAccount(accountName);
      const result = await api<Array<Record<string, unknown>>>('reports.drillDown', {
        accountId, startDate, endDate,
      });
      setDrillDown(result);
    } catch (e) {
      setDrillDown(null);
      const message = e instanceof Error ? e.message : 'Failed to load drill-down transactions';
      setError(
        message.includes('license tier')
          ? 'Report drill-down requires a Pro license or an active trial. Open License to upgrade or start a trial.'
          : message,
      );
    }
  };

  const showDrillLinks = licenseReady && canDrillDown;

  return (
    <div>
      <div className="page-header">
        <h1>Reports</h1>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {licenseReady && !canDrillDown && reportType === 'pnl' && (
        <div className="info-banner">
          Report drill-down is not included in your current license. Account names are shown without
          transaction detail. <Link to="/license" className="btn-link">View License</Link>
        </div>
      )}

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Report</label>
            <select value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)}>
              <option value="pnl">Profit & Loss</option>
              <option value="balanceSheet">Balance Sheet</option>
              <option value="trialBalance">Trial Balance</option>
              <option value="cashFlow">Cash Flow</option>
              <option value="agingAr">A/R Aging</option>
              <option value="agingAp">A/P Aging</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Basis</label>
            <select value={basis} onChange={(e) => setBasis(e.target.value as 'cash' | 'accrual')}>
              <option value="cash">Cash</option>
              <option value="accrual">Accrual</option>
            </select>
          </div>
          {!['balanceSheet', 'trialBalance', 'agingAr', 'agingAp'].includes(reportType) && (
            <>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>From</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>To</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </>
          )}
          {['balanceSheet', 'trialBalance', 'agingAr', 'agingAp'].includes(reportType) && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>As of</label>
              <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
            </div>
          )}
          <button className="btn btn-primary" onClick={runReport}>Run Report</button>
        </div>
      </div>

      {reportType === 'pnl' && pnl && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Profit & Loss ({pnl.basis} basis)</h3>
          <p className="text-muted" style={{ marginBottom: 16 }}>{pnl.startDate} to {pnl.endDate}</p>
          <h4 style={{ marginBottom: 8 }}>Income</h4>
          <table style={{ marginBottom: 24 }}>
            <tbody>
              {pnl.income.map((l) => (
                <tr key={l.accountId}>
                  <td>
                    {showDrillLinks ? (
                      <button className="btn btn-sm btn-link" onClick={() => handleDrillDown(l.accountId, l.accountName)}>
                        {l.accountCode} — {l.accountName}
                      </button>
                    ) : (
                      <span>{l.accountCode} — {l.accountName}</span>
                    )}
                  </td>
                  <td className="text-right font-mono text-income">{formatCurrency(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h4 style={{ marginBottom: 8 }}>Expenses</h4>
          <table style={{ marginBottom: 24 }}>
            <tbody>
              {pnl.expenses.map((l) => (
                <tr key={l.accountId}>
                  <td>
                    {showDrillLinks ? (
                      <button className="btn btn-sm btn-link" onClick={() => handleDrillDown(l.accountId, l.accountName)}>
                        {l.accountCode} — {l.accountName}
                      </button>
                    ) : (
                      <span>{l.accountCode} — {l.accountName}</span>
                    )}
                  </td>
                  <td className="text-right font-mono text-expense">{formatCurrency(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ borderTop: '2px solid var(--color-border)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
            <span>Net Income</span>
            <span className="font-mono">{formatCurrency(pnl.netIncome)}</span>
          </div>
        </div>
      )}

      {reportType === 'balanceSheet' && balanceSheet && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Balance Sheet ({balanceSheet.basis} basis) — {balanceSheet.asOfDate}</h3>
          {(['assets', 'liabilities', 'equity'] as const).map((section) => (
            <div key={section} style={{ marginBottom: 24 }}>
              <h4 style={{ marginBottom: 8, textTransform: 'capitalize' }}>{section}</h4>
              <table>
                <tbody>
                  {balanceSheet[section].map((l) => (
                    <tr key={l.accountId}>
                      <td>{l.accountCode} — {l.accountName}</td>
                      <td className="text-right font-mono">{formatCurrency(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {reportType === 'trialBalance' && trialBalance && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Trial Balance</h3>
          <table>
            <thead><tr><th>Account</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead>
            <tbody>
              {trialBalance.lines.map((l, i) => (
                <tr key={i}>
                  <td>{l.accountCode} — {l.accountName}</td>
                  <td className="text-right font-mono">{l.debit > 0 ? formatCurrency(l.debit) : ''}</td>
                  <td className="text-right font-mono">{l.credit > 0 ? formatCurrency(l.credit) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reportType === 'cashFlow' && cashFlow && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Cash Flow Statement</h3>
          <table>
            <tbody>
              <tr><td>Operating Activities</td><td className="text-right font-mono">{formatCurrency(cashFlow.operating)}</td></tr>
              <tr style={{ fontWeight: 600 }}><td>Net Change in Cash</td><td className="text-right font-mono">{formatCurrency(cashFlow.netChange)}</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {(reportType === 'agingAr' || reportType === 'agingAp') && aging && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>{reportType === 'agingAr' ? 'Accounts Receivable' : 'Accounts Payable'} Aging</h3>
          <table>
            <thead><tr><th>Name</th><th>Document</th><th>Due Date</th><th className="text-right">Balance</th></tr></thead>
            <tbody>
              {aging.items.map((item, i) => (
                <tr key={i}>
                  <td>{item.name as string}</td>
                  <td>{item.documentNumber as string}</td>
                  <td>{item.dueDate as string}</td>
                  <td className="text-right font-mono">{formatCurrency(item.balance as number)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {drillDown && (
        <div className="card" style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 16 }}>Transactions: {drillAccount}</h3>
          <table>
            <thead><tr><th>Date</th><th>Memo</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead>
            <tbody>
              {drillDown.map((t, i) => (
                <tr key={i}>
                  <td>{t.date as string}</td>
                  <td>{(t.memo as string) ?? '—'}</td>
                  <td className="text-right font-mono">{(t.debit as number) > 0 ? formatCurrency(t.debit as number) : ''}</td>
                  <td className="text-right font-mono">{(t.credit as number) > 0 ? formatCurrency(t.credit as number) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => setDrillDown(null)}>Close</button>
        </div>
      )}
    </div>
  );
}
