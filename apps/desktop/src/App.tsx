import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import type { CompanyInfo } from './api';
import { api } from './api';
import Layout from './components/Layout';
import Welcome from './pages/Welcome';
import Dashboard from './pages/Dashboard';
import Sales from './pages/Sales';
import Expenses from './pages/Expenses';
import Banking from './pages/Banking';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Bills from './pages/Bills';
import Reconciliation from './pages/Reconciliation';
import Inventory from './pages/Inventory';
import Payroll from './pages/Payroll';
import License from './pages/License';
import ChartOfAccounts from './pages/ChartOfAccounts';

export default function App() {
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<CompanyInfo | null>('company.info', {})
      .then((info) => setCompany(info))
      .catch(() => setCompany(null))
      .finally(() => setLoading(false));
  }, []);

  const handleCompanyOpen = (info: CompanyInfo) => {
    setCompany(info);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--color-text-muted)' }}>
        <p>Loading LedgerLocal...</p>
      </div>
    );
  }

  if (!company) {
    return <Welcome onCompanyOpen={handleCompanyOpen} />;
  }

  return (
    <Layout company={company}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/sales" element={<Sales company={company} />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/bills" element={<Bills />} />
        <Route path="/banking" element={<Banking />} />
        <Route path="/accounts" element={<ChartOfAccounts />} />
        <Route path="/reconciliation" element={<Reconciliation />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/payroll" element={<Payroll />} />
        <Route path="/settings" element={<Settings company={company} onCompanyClose={() => setCompany(null)} onCompanyUpdate={setCompany} />} />
        <Route path="/license" element={<License />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
