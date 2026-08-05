import { useState, useEffect } from 'react';
import type { CompanyInfo } from '../api';
import { api } from '../api';

interface SettingsProps {
  company: CompanyInfo;
  onCompanyClose: () => void;
  onCompanyUpdate: (company: CompanyInfo) => void;
}

interface SeedStatus {
  seeded: boolean;
  counts: Record<string, number>;
  seededAt: string | null;
  removed?: number;
}

function formatSeedSummary(counts: Record<string, number>): string {
  const labels: Record<string, string> = {
    customers: 'customers',
    vendors: 'vendors',
    invoices: 'invoices',
    bills: 'bills',
    inventory_items: 'inventory items',
    payroll_employees: 'employees',
    payroll_runs: 'payroll runs',
    import_transactions: 'import transactions',
    import_rules: 'import rules',
  };
  return Object.entries(counts)
    .filter(([key]) => labels[key])
    .map(([key, count]) => `${count} ${labels[key]}`)
    .join(', ');
}

const INVOICE_DUE_OPTION_GROUPS = [
  {
    label: 'No default',
    options: [{ value: '', label: 'No automatic due date' }],
  },
  {
    label: 'Due on receipt',
    options: [{ value: '0', label: 'Due on receipt (same day)' }],
  },
  {
    label: 'Net payment terms',
    options: [
      { value: '7', label: 'Net 7' },
      { value: '15', label: 'Net 15' },
      { value: '30', label: 'Net 30' },
      { value: '45', label: 'Net 45' },
      { value: '60', label: 'Net 60' },
      { value: '90', label: 'Net 90' },
    ],
  },
] as const;

function settingsSectionTitle(title: string, isFirst = false) {
  return (
    <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-muted)', margin: isFirst ? '0 0 12px' : '32px 0 12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {title}
    </h2>
  );
}

export default function Settings({ company, onCompanyClose, onCompanyUpdate }: SettingsProps) {
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const [exportPassword, setExportPassword] = useState('');
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [defaultTaxRate, setDefaultTaxRate] = useState(company.defaultTaxRate);
  const [defaultInvoiceDueDays, setDefaultInvoiceDueDays] = useState<number | null>(
    company.defaultInvoiceDueDays ?? null,
  );
  const [seedStatus, setSeedStatus] = useState<SeedStatus | null>(null);
  const [seedBusy, setSeedBusy] = useState(false);

  useEffect(() => {
    api<CompanyInfo | null>('company.info', {})
      .then((info) => {
        if (!info) return;
        setDefaultTaxRate(info.defaultTaxRate ?? 0);
        setDefaultInvoiceDueDays(
          info.defaultInvoiceDueDays === undefined || info.defaultInvoiceDueDays === null
            ? null
            : info.defaultInvoiceDueDays,
        );
        onCompanyUpdate(info);
      })
      .catch(() => {});
  }, []);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage(text);
    setMessageType(type);
  };

  const refreshSeedStatus = async () => {
    const status = await api<SeedStatus>('dev.seedStatus', {});
    setSeedStatus(status);
    return status;
  };

  useEffect(() => {
    refreshSeedStatus().catch(() => {
      setSeedStatus({ seeded: false, counts: {}, seededAt: null });
    });
  }, []);

  useEffect(() => {
    if (company.logoPath) {
      window.app.getLocalFileUrl(company.logoPath).then(setLogoPreviewUrl);
    } else {
      setLogoPreviewUrl(null);
    }
  }, [company.logoPath]);

  const handleUploadLogo = async () => {
    const sourcePath = await window.dialog.openImage();
    if (!sourcePath) return;
    try {
      const updated = await api<CompanyInfo>('company.setLogo', { sourcePath });
      onCompanyUpdate(updated);
      setMessage('Company logo updated. It will appear on exported invoices.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to upload logo');
    }
  };

  const handleRemoveLogo = async () => {
    try {
      const updated = await api<CompanyInfo>('company.removeLogo', {});
      onCompanyUpdate(updated);
      setMessage('Company logo removed.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to remove logo');
    }
  };

  const handleBackup = async () => {
    const path = await window.dialog.saveFile(`${company.name}-backup.ledger`);
    if (!path) return;
    await window.ledger.backup(path);
    setMessage(`Backup saved to ${path}`);
  };

  const handleRestore = async () => {
    const path = await window.dialog.openFile();
    if (!path) return;
    const restored = await window.ledger.restore(path);
    onCompanyUpdate(restored);
    setMessage('Company restored from backup');
  };

  const handleExport = async () => {
    if (!exportPassword) {
      setMessage('Enter a password for the export package');
      return;
    }
    const path = await window.dialog.saveFile(`${company.name}-accountant-export.llx`);
    if (!path) return;
    await api('export.create', { destPath: path, password: exportPassword });
    setMessage(`Accountant export saved to ${path}`);
  };

  const handleCheckUpdates = async () => {
    const result = await window.app.checkUpdates();
    if (result.available) {
      setMessage(`Update available: v${result.version}`);
    } else {
      setMessage('You are on the latest version');
    }
  };

  const handleSaveBusinessSettings = async () => {
    try {
      const updated = await api<CompanyInfo>('company.updateSettings', {
        defaultTaxRate,
        defaultInvoiceDueDays,
      });
      setDefaultTaxRate(updated.defaultTaxRate ?? 0);
      setDefaultInvoiceDueDays(
        updated.defaultInvoiceDueDays === undefined || updated.defaultInvoiceDueDays === null
          ? null
          : updated.defaultInvoiceDueDays,
      );
      onCompanyUpdate(updated);
      setMessage('Business settings saved. New invoices will use these defaults.');
      setMessageType('success');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to save business settings');
      setMessageType('error');
    }
  };

  const handleLoadDemoData = async () => {
    setSeedBusy(true);
    try {
      const status = await api<SeedStatus>('dev.seedDemo', {});
      setSeedStatus(status);
      showMessage('Sample data loaded for development testing.', 'success');
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Failed to load sample data', 'error');
      await refreshSeedStatus().catch(() => {
        setSeedStatus({ seeded: false, counts: {}, seededAt: null });
      });
    } finally {
      setSeedBusy(false);
    }
  };

  const handleClearDemoData = async () => {
    const confirmed = window.confirm(
      'Remove all sample data? Your chart of accounts and company settings will be kept.',
    );
    if (!confirmed) return;

    setSeedBusy(true);
    try {
      const status = await api<SeedStatus>('dev.clearDemo', {});
      setSeedStatus({ seeded: false, counts: {}, seededAt: null, removed: status.removed });
      showMessage('Sample data removed. Company file is ready for a clean release.', 'success');
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Failed to remove sample data', 'error');
    } finally {
      setSeedBusy(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      {message && (
        <div className={messageType === 'error' ? 'error-banner' : 'success-banner'}>{message}</div>
      )}

      {settingsSectionTitle('Company', true)}

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16 }}>Company Profile</h3>
        <p><strong>{company.name}</strong></p>
        <p className="text-muted" style={{ marginTop: 4 }}>Default basis: {company.defaultBasis}</p>
        <p className="text-muted">Created: {new Date(company.createdAt).toLocaleDateString()}</p>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16 }}>Business Settings</h3>
        <p className="text-muted" style={{ marginBottom: 24 }}>
          Defaults applied when creating new invoices.
        </p>

        <div style={{ marginBottom: 24 }}>
          <h4 style={{ marginBottom: 12, fontSize: 15 }}>Tax</h4>
          <div className="form-group" style={{ maxWidth: 320, marginBottom: 0 }}>
            <label>Default Tax Rate (%)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={defaultTaxRate}
              onChange={(e) => setDefaultTaxRate(parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <h4 style={{ marginBottom: 12, fontSize: 15 }}>Payment Terms</h4>
          <div className="form-group" style={{ maxWidth: 320, marginBottom: 0 }}>
            <label>Default Invoice Due Date</label>
            <select
              value={defaultInvoiceDueDays === null ? '' : String(defaultInvoiceDueDays)}
              onChange={(e) => {
                const { value } = e.target;
                setDefaultInvoiceDueDays(value === '' ? null : parseInt(value, 10));
              }}
            >
              {INVOICE_DUE_OPTION_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((option) => (
                    <option key={option.value || 'none'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="text-muted" style={{ marginTop: 8, fontSize: 13 }}>
              {defaultInvoiceDueDays === null
                ? 'Due date is left blank on new invoices until you set it.'
                : defaultInvoiceDueDays === 0
                  ? 'New invoices default to the same day as the invoice date.'
                  : `New invoices default to ${defaultInvoiceDueDays} days after the invoice date.`}
            </p>
          </div>
        </div>

        <button className="btn btn-primary" onClick={handleSaveBusinessSettings}>
          Save Business Settings
        </button>
      </div>

      {settingsSectionTitle('Branding')}

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16 }}>Company Logo</h3>
        <p className="text-muted" style={{ marginBottom: 16 }}>
          Upload a logo to display on invoice PDFs. The image is stored locally next to your company file.
        </p>
        {logoPreviewUrl && (
          <div style={{ marginBottom: 16 }}>
            <img
              src={logoPreviewUrl}
              alt={`${company.name} logo`}
              className="logo-preview"
            />
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={handleUploadLogo}>
            {company.logoPath ? 'Replace Logo' : 'Upload Logo'}
          </button>
          {company.logoPath && (
            <button className="btn btn-secondary" onClick={handleRemoveLogo}>Remove Logo</button>
          )}
        </div>
      </div>

      {settingsSectionTitle('Data & Portability')}

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16 }}>Backup & Restore</h3>
        <p className="text-muted" style={{ marginBottom: 16 }}>
          Your company file is stored locally. Create regular backups to protect your data.
          If you use a logo, back up the matching <code>*.logo.*</code> file in the same folder.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={handleBackup}>Backup Company File</button>
          <button className="btn btn-secondary" onClick={handleRestore}>Restore from Backup</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16 }}>Accountant Export</h3>
        <p className="text-muted" style={{ marginBottom: 16 }}>
          Create an encrypted package for your accountant to review (read-only).
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="password"
            placeholder="Export password"
            value={exportPassword}
            onChange={(e) => setExportPassword(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
          />
          <button className="btn btn-primary" onClick={handleExport}>Create Export</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16 }}>Multi-Company</h3>
        <p className="text-muted" style={{ marginBottom: 16 }}>
          Each company is a separate .ledger file. Close this company to open another.
        </p>
        <button className="btn btn-secondary" onClick={onCompanyClose}>Switch Company</button>
      </div>

      {settingsSectionTitle('Development')}

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16 }}>Development Sample Data</h3>
        <p className="text-muted" style={{ marginBottom: 16 }}>
          Load realistic sample customers, invoices, inventory, employees, bills, expenses, and bank
          import transactions for testing. Remove it before sharing or releasing to start with a clean slate.
        </p>
        {seedStatus?.seeded ? (
          <p style={{ marginBottom: 16 }}>
            <span className="badge badge-warning">Sample data loaded</span>
            {seedStatus.seededAt && (
              <span className="text-muted" style={{ marginLeft: 8, fontSize: 13 }}>
                since {new Date(seedStatus.seededAt).toLocaleString()}
              </span>
            )}
          </p>
        ) : (
          <p className="text-muted" style={{ marginBottom: 16 }}>No sample data loaded.</p>
        )}
        {seedStatus?.seeded && Object.keys(seedStatus.counts).length > 0 && (
          <p className="text-muted" style={{ marginBottom: 16, fontSize: 13 }}>
            Includes {formatSeedSummary(seedStatus.counts)}.
          </p>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-secondary"
            onClick={handleLoadDemoData}
            disabled={seedBusy || seedStatus?.seeded}
          >
            Load Sample Data
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleClearDemoData}
            disabled={seedBusy || !seedStatus?.seeded}
          >
            Remove Sample Data
          </button>
        </div>
      </div>

      {settingsSectionTitle('Application')}

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16 }}>Updates</h3>
        <p className="text-muted" style={{ marginBottom: 16 }}>
          Check for updates manually. Updates are never forced.
        </p>
        <button className="btn btn-secondary" onClick={handleCheckUpdates}>Check for Updates</button>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Close Company</h3>
        <button className="btn btn-secondary" onClick={onCompanyClose}>Close Company File</button>
      </div>
    </div>
  );
}
