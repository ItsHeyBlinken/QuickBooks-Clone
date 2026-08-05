import { useState, useEffect } from 'react';
import { api } from '../api';
import type { LicenseInfo } from '../api';

export default function License() {
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [key, setKey] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<LicenseInfo>('license.info', {}).then(setLicense);
  }, []);

  const handleActivate = async () => {
    const result = await api<{ success: boolean; error?: string; tier?: string }>('license.activate', { key });
    if (result.success) {
      setMessage(`Activated ${result.tier} license`);
      api<LicenseInfo>('license.info', {}).then(setLicense);
    } else {
      setMessage(result.error ?? 'Activation failed');
    }
  };

  const tierLabels: Record<string, string> = {
    trial: 'Trial (30 days)',
    basic: 'Basic',
    pro: 'Pro',
    enterprise: 'Enterprise',
  };

  return (
    <div>
      <div className="page-header">
        <h1>License</h1>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16 }}>Current License</h3>
        {license && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <div>
              <p className="text-muted" style={{ fontSize: 13 }}>Tier</p>
              <p style={{ fontSize: 18 }}>{tierLabels[license.tier] ?? license.tier}</p>
            </div>
            <div>
              <p className="text-muted" style={{ fontSize: 13 }}>Status</p>
              <p style={{ fontSize: 18, color: license.isValid ? 'var(--color-success)' : 'var(--color-danger)' }}>
                {license.isValid ? 'Active' : 'Expired'}
              </p>
            </div>
            <div>
              <p className="text-muted" style={{ fontSize: 13 }}>Expires</p>
              <p style={{ fontSize: 18 }}>{license.expiresAt ? new Date(license.expiresAt).toLocaleDateString() : 'Never'}</p>
            </div>
          </div>
        )}
        {license && (
          <div style={{ marginTop: 16 }}>
            <p className="text-muted" style={{ fontSize: 13, marginBottom: 8 }}>Enabled features</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {license.features.map((f) => (
                <span key={f} className="badge badge-success">{f.replace(/_/g, ' ')}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Activate License</h3>
        <p className="text-muted" style={{ marginBottom: 16 }}>
          Enter your license key to activate. Keys start with LL-BASIC-, LL-PRO-, or LL-ENT-.
        </p>
        {message && <div className={message.includes('Activated') ? 'success-banner' : 'error-banner'}>{message}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="LL-PRO-XXXXXXXX"
            style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
          />
          <button className="btn btn-primary" onClick={handleActivate}>Activate</button>
        </div>
      </div>
    </div>
  );
}
