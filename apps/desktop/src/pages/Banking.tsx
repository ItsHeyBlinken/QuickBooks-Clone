import { useState, useEffect } from 'react';
import { api } from '../api';
import type { Account, ImportTransaction, ImportRule } from '../api';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export default function Banking() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<ImportTransaction[]>([]);
  const [rules, setRules] = useState<ImportRule[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bankAccountId, setBankAccountId] = useState('');
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [ruleForm, setRuleForm] = useState({
    name: '',
    descriptionContains: '',
    categoryId: '',
  });

  useEffect(() => {
    api<Account[]>('accounts.list', {}).then((accts) => {
      setAccounts(accts);
      const bank = accts.find((a) => a.subtype === 'bank');
      if (bank) setBankAccountId(bank.id);
    });
    api<ImportRule[]>('rules.list', {}).then(setRules);
  }, []);

  const expenseAccounts = accounts.filter((a) => a.type === 'expense' || a.type === 'income');
  const bankAccounts = accounts.filter((a) => a.subtype === 'bank');

  const handleImport = async () => {
    const filePath = await window.dialog.openCsv();
    if (!filePath) return;

    try {
      const content = await window.fs.readFile(filePath);
      const ext = filePath.split('.').pop()?.toLowerCase();
      let result: { batchId: string; transactions: ImportTransaction[] };

      if (ext === 'ofx' || ext === 'qfx') {
        result = await api('import.ofx', { content, filename: filePath });
      } else if (ext === 'qif') {
        result = await api('import.qif', { content, filename: filePath });
      } else {
        result = await api('import.csv', { content, filename: filePath });
      }

      setBatchId(result.batchId);
      setTransactions(result.transactions);
      setSelected(new Set(result.transactions.map((t) => t.id)));
      setSuccess(`Imported ${result.transactions.length} transactions`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    }
  };

  const handleApprove = async () => {
    if (!bankAccountId) {
      setError('Select a bank account');
      return;
    }
    try {
      const result = await api<{ count: number }>('import.approve', {
        transactionIds: Array.from(selected),
        bankAccountId,
      });
      setSuccess(`Approved ${result.count} transactions`);
      setTransactions((prev) => prev.filter((t) => !selected.has(t.id)));
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approval failed');
    }
  };

  const handleSkip = async () => {
    await api('import.skip', { transactionIds: Array.from(selected) });
    setTransactions((prev) => prev.filter((t) => !selected.has(t.id)));
    setSelected(new Set());
  };

  const handleCreateRule = async () => {
    if (!ruleForm.name || !ruleForm.descriptionContains || !ruleForm.categoryId) {
      setError('Fill in all rule fields');
      return;
    }
    await api('rules.create', {
      name: ruleForm.name,
      criteria: { descriptionContains: ruleForm.descriptionContains },
      action: { categoryId: ruleForm.categoryId },
    });
    setShowRuleForm(false);
    api<ImportRule[]>('rules.list', {}).then(setRules);
  };

  const confidenceBadge = (c: string) => {
    const map: Record<string, string> = {
      rule: 'badge-success',
      fuzzy: 'badge-warning',
      ml: 'badge-warning',
      none: 'badge-muted',
    };
    return <span className={`badge ${map[c] || 'badge-muted'}`}>{c}</span>;
  };

  const toggleAll = () => {
    if (selected.size === transactions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(transactions.map((t) => t.id)));
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Banking & Import</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setShowRuleForm(true)}>Manage Rules</button>
          <button className="btn btn-primary" onClick={handleImport}>Import File</button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      {showRuleForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>Import Rules</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="form-group">
              <label>Rule Name</label>
              <input value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Description Contains</label>
              <input value={ruleForm.descriptionContains} onChange={(e) => setRuleForm({ ...ruleForm, descriptionContains: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Category</label>
              <select value={ruleForm.categoryId} onChange={(e) => setRuleForm({ ...ruleForm, categoryId: e.target.value })}>
                <option value="">Select...</option>
                {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button className="btn btn-primary" onClick={handleCreateRule}>Add Rule</button>
            <button className="btn btn-secondary" onClick={() => setShowRuleForm(false)}>Close</button>
          </div>
          {rules.length > 0 && (
            <table>
              <thead><tr><th>Name</th><th>Criteria</th><th>Category</th></tr></thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.criteria.descriptionContains}</td>
                    <td>{accounts.find((a) => a.id === r.action.categoryId)?.name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {transactions.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Deposit to Account</label>
              <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" onClick={handleApprove} disabled={selected.size === 0}>
              Approve Selected ({selected.size})
            </button>
            <button className="btn btn-secondary" onClick={handleSkip} disabled={selected.size === 0}>
              Skip Selected
            </button>
          </div>

          <table>
            <thead>
              <tr>
                <th><input type="checkbox" checked={selected.size === transactions.length} onChange={toggleAll} /></th>
                <th>Date</th>
                <th>Description</th>
                <th className="text-right">Amount</th>
                <th>Suggested Category</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(t.id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(t.id);
                        else next.delete(t.id);
                        setSelected(next);
                      }}
                    />
                  </td>
                  <td>{t.date}</td>
                  <td>{t.description}</td>
                  <td className={`text-right font-mono ${t.amount < 0 ? 'text-expense' : 'text-income'}`}>
                    {formatCurrency(t.amount)}
                  </td>
                  <td>{accounts.find((a) => a.id === t.suggestedAccountId)?.name ?? '—'}</td>
                  <td>{confidenceBadge(t.confidence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {transactions.length === 0 && !batchId && (
        <div className="card">
          <div className="empty-state">
            <p>Import a CSV, OFX, or QIF file from your bank to review and categorize transactions.</p>
            <p className="text-muted" style={{ marginTop: 8 }}>
              Need another bank account? Add one under <strong>Accounts</strong> in the sidebar.
            </p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handleImport}>
              Import Bank File
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
