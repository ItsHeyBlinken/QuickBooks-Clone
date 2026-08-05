import { useState, useEffect } from 'react';
import type { CompanyInfo } from '../api';
import { api } from '../api';
import '../styles/welcome.css';

interface WelcomeProps {
  onCompanyOpen: (info: CompanyInfo) => void;
}

export default function Welcome({ onCompanyOpen }: WelcomeProps) {
  const [mode, setMode] = useState<'home' | 'create'>('home');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState('');
  const [recent, setRecent] = useState<Array<{ path: string; name: string; lastOpened: string }>>([]);

  useEffect(() => {
    window.ledger.getRecentCompanies().then(setRecent).catch(() => {});
  }, []);

  const handleOpen = async () => {
    const path = await window.dialog.openFile();
    if (!path) return;
    try {
      const info = await window.ledger.openCompany(path);
      onCompanyOpen(info);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open company file');
    }
  };

  const handleCreate = async () => {
    if (!companyName.trim()) {
      setError('Please enter a company name');
      return;
    }
    const path = await window.dialog.saveFile(`${companyName.trim()}.ledger`);
    if (!path) return;
    try {
      const info = await window.ledger.createCompany(path, companyName.trim());
      onCompanyOpen(info);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create company file');
    }
  };

  const handleRecent = async (path: string) => {
    try {
      const info = await window.ledger.openCompany(path);
      onCompanyOpen(info);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open company file');
    }
  };

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <h1>LedgerLocal</h1>
        <p className="welcome-tagline">Your books. Your machine. No cloud required.</p>

        <div className="welcome-card">
          {error && <div className="error-banner">{error}</div>}

          {mode === 'home' ? (
            <>
              <h2>Open or create a company</h2>
              <div className="welcome-actions">
                <button className="btn btn-primary" onClick={handleOpen}>
                  Open Company File
                </button>
                <button className="btn btn-secondary" onClick={() => setMode('create')}>
                  Create New Company
                </button>
              </div>
            </>
          ) : (
            <div className="create-form">
              <h2>Create new company</h2>
              <div className="form-group">
                <label>Company name</label>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="My Business LLC"
                  autoFocus
                />
              </div>
              <div className="welcome-actions">
                <button className="btn btn-primary" onClick={handleCreate}>
                  Create Company
                </button>
                <button className="btn btn-secondary" onClick={() => setMode('home')}>
                  Back
                </button>
              </div>
            </div>
          )}

          {recent.length > 0 && mode === 'home' && (
            <div className="recent-list">
              <h3>Recent companies</h3>
              {recent.map((r) => (
                <a
                  key={r.path}
                  href="#"
                  className="recent-item"
                  onClick={(e) => { e.preventDefault(); handleRecent(r.path); }}
                >
                  {r.name}
                  <small>{r.path}</small>
                </a>
              ))}
            </div>
          )}
        </div>

        <p className="privacy-note">
          All financial data is stored locally on your computer. Nothing is sent to the cloud.
        </p>
      </div>
    </div>
  );
}
