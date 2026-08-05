import { useEffect, useMemo, useState } from 'react';
import type { AccountType, AccountSubtype } from '@ledgerlocal/shared';
import { api } from '../api';
import type { Account } from '../api';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

const TYPE_ORDER: AccountType[] = ['asset', 'liability', 'equity', 'income', 'expense'];

const TYPE_LABELS: Record<AccountType, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  income: 'Income',
  expense: 'Expenses',
};

const SUBTYPES_BY_TYPE: Record<AccountType, { value: AccountSubtype; label: string }[]> = {
  asset: [
    { value: 'bank', label: 'Bank' },
    { value: 'accounts_receivable', label: 'Accounts Receivable' },
    { value: 'other_current_asset', label: 'Other Current Asset' },
    { value: 'fixed_asset', label: 'Fixed Asset' },
  ],
  liability: [
    { value: 'accounts_payable', label: 'Accounts Payable' },
    { value: 'other_current_liability', label: 'Other Current Liability' },
    { value: 'long_term_liability', label: 'Long-Term Liability' },
  ],
  equity: [{ value: 'equity', label: 'Equity' }],
  income: [
    { value: 'income', label: 'Income' },
    { value: 'other_income', label: 'Other Income' },
  ],
  expense: [
    { value: 'expense', label: 'Expense' },
    { value: 'cost_of_goods_sold', label: 'Cost of Goods Sold' },
    { value: 'other_expense', label: 'Other Expense' },
  ],
};

const CODE_PREFIX_BY_TYPE: Record<AccountType, number> = {
  asset: 1000,
  liability: 2000,
  equity: 3000,
  income: 4000,
  expense: 6000,
};

function formatSubtype(subtype: AccountSubtype): string {
  return subtype.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function suggestCode(accounts: Account[], type: AccountType, subtype: AccountSubtype): string {
  const prefix = CODE_PREFIX_BY_TYPE[type];
  const matching = accounts.filter((account) => account.type === type && account.subtype === subtype);
  const numericCodes = matching
    .map((account) => parseInt(account.code, 10))
    .filter((code) => !Number.isNaN(code));

  if (numericCodes.length > 0) {
    return String(Math.max(...numericCodes) + 10);
  }

  if (subtype === 'bank') {
    return '1010';
  }

  return String(prefix);
}

interface AccountFormState {
  code: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
}

function defaultForm(accounts: Account[]): AccountFormState {
  const type: AccountType = 'asset';
  const subtype: AccountSubtype = 'bank';
  return {
    code: suggestCode(accounts, type, subtype),
    name: '',
    type,
    subtype,
  };
}

export default function ChartOfAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState<AccountFormState>(defaultForm([]));

  const load = () => {
    api<Account[]>('accounts.list', {}).then(setAccounts);
  };

  useEffect(() => { load(); }, []);

  const groupedAccounts = useMemo(() => {
    const groups = new Map<AccountType, Account[]>();
    for (const type of TYPE_ORDER) {
      groups.set(type, []);
    }
    for (const account of accounts) {
      const group = groups.get(account.type);
      if (group) {
        group.push(account);
      }
    }
    return TYPE_ORDER
      .map((type) => ({ type, accounts: groups.get(type) ?? [] }))
      .filter((group) => group.accounts.length > 0);
  }, [accounts]);

  const subtypeOptions = SUBTYPES_BY_TYPE[form.type];

  const openForm = (preset?: Partial<AccountFormState>) => {
    const nextType = preset?.type ?? 'asset';
    const nextSubtype = preset?.subtype ?? SUBTYPES_BY_TYPE[nextType][0].value;
    setForm({
      code: preset?.code ?? suggestCode(accounts, nextType, nextSubtype),
      name: preset?.name ?? '',
      type: nextType,
      subtype: nextSubtype,
    });
    setShowForm(true);
    setError('');
    setSuccess('');
  };

  const handleTypeChange = (type: AccountType) => {
    const subtype = SUBTYPES_BY_TYPE[type][0].value;
    setForm({
      ...form,
      type,
      subtype,
      code: suggestCode(accounts, type, subtype),
    });
  };

  const handleSubtypeChange = (subtype: AccountSubtype) => {
    setForm({
      ...form,
      subtype,
      code: suggestCode(accounts, form.type, subtype),
    });
  };

  const handleCreate = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setError('Account code and name are required');
      return;
    }

    try {
      await api('accounts.create', {
        code: form.code.trim(),
        name: form.name.trim(),
        type: form.type,
        subtype: form.subtype,
      });
      setShowForm(false);
      setError('');
      setSuccess(`Added account ${form.code.trim()} — ${form.name.trim()}`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create account');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Chart of Accounts</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-secondary"
            onClick={() => openForm({ type: 'asset', subtype: 'bank' })}
          >
            Add Bank Account
          </button>
          <button className="btn btn-primary" onClick={() => openForm()}>Add Account</button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>New Account</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label>Account Code</label>
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="e.g. 1010"
              />
            </div>
            <div className="form-group">
              <label>Account Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Business Savings"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select
                value={form.type}
                onChange={(e) => handleTypeChange(e.target.value as AccountType)}
              >
                {TYPE_ORDER.map((type) => (
                  <option key={type} value={type}>{TYPE_LABELS[type]}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Subtype</label>
              <select
                value={form.subtype}
                onChange={(e) => handleSubtypeChange(e.target.value as AccountSubtype)}
              >
                {subtypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary" onClick={handleCreate}>Save Account</button>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {groupedAccounts.length === 0 ? (
        <div className="card">
          <div className="empty-state">No accounts found.</div>
        </div>
      ) : (
        groupedAccounts.map((group) => (
          <div key={group.type} className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 16 }}>{TYPE_LABELS[group.type]}</h3>
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Subtype</th>
                  <th className="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {group.accounts.map((account) => (
                  <tr key={account.id}>
                    <td className="font-mono">{account.code}</td>
                    <td>{account.name}</td>
                    <td className="text-muted">{formatSubtype(account.subtype)}</td>
                    <td className="text-right font-mono">{formatCurrency(account.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}
