import { NavLink } from 'react-router-dom';
import type { CompanyInfo } from '../api';
import '../styles/layout.css';

interface LayoutProps {
  company: CompanyInfo;
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '◈' },
  { to: '/sales', label: 'Sales', icon: '↑' },
  { to: '/expenses', label: 'Expenses', icon: '↓' },
  { to: '/bills', label: 'Bills', icon: '⊟' },
  { to: '/banking', label: 'Banking', icon: '◇' },
  { to: '/accounts', label: 'Accounts', icon: '⊞' },
  { to: '/reconciliation', label: 'Reconcile', icon: '✓' },
  { to: '/reports', label: 'Reports', icon: '≡' },
  { to: '/inventory', label: 'Inventory', icon: '▣' },
  { to: '/payroll', label: 'Payroll', icon: '◎' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

export default function Layout({ company, children }: LayoutProps) {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>LedgerLocal</h1>
          <p>{company.name}</p>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          Offline · Your data stays local
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
