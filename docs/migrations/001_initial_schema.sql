-- Migration 001: Initial schema
-- Apply on new company file creation

CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1');

CREATE TABLE IF NOT EXISTS company (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    fiscal_year_start_month INTEGER NOT NULL DEFAULT 1,
    default_basis TEXT NOT NULL DEFAULT 'cash',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    subtype TEXT NOT NULL,
    parent_id TEXT REFERENCES accounts(id),
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    memo TEXT,
    reference TEXT,
    source_type TEXT,
    source_id TEXT,
    is_void INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS journal_lines (
    id TEXT PRIMARY KEY,
    entry_id TEXT NOT NULL REFERENCES journal_entries(id),
    account_id TEXT NOT NULL REFERENCES accounts(id),
    debit REAL NOT NULL DEFAULT 0,
    credit REAL NOT NULL DEFAULT 0,
    memo TEXT
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(date);

CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS vendors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    unit_price REAL NOT NULL DEFAULT 0,
    income_account_id TEXT REFERENCES accounts(id),
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id),
    invoice_number TEXT NOT NULL,
    date TEXT NOT NULL,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    subtotal REAL NOT NULL DEFAULT 0,
    tax_amount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    amount_paid REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS invoice_lines (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL REFERENCES invoices(id),
    description TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL DEFAULT 0,
    amount REAL NOT NULL DEFAULT 0,
    account_id TEXT REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS invoice_payments (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL REFERENCES invoices(id),
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    deposit_account_id TEXT NOT NULL REFERENCES accounts(id),
    reference TEXT
);

CREATE TABLE IF NOT EXISTS bills (
    id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL REFERENCES vendors(id),
    bill_number TEXT NOT NULL,
    date TEXT NOT NULL,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    subtotal REAL NOT NULL DEFAULT 0,
    tax_amount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    amount_paid REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bill_lines (
    id TEXT PRIMARY KEY,
    bill_id TEXT NOT NULL REFERENCES bills(id),
    description TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL DEFAULT 0,
    amount REAL NOT NULL DEFAULT 0,
    account_id TEXT REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS bill_payments (
    id TEXT PRIMARY KEY,
    bill_id TEXT NOT NULL REFERENCES bills(id),
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    payment_account_id TEXT NOT NULL REFERENCES accounts(id),
    reference TEXT
);

CREATE TABLE IF NOT EXISTS import_rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    criteria_json TEXT NOT NULL,
    action_json TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS import_batches (
    id TEXT PRIMARY KEY,
    filename TEXT,
    imported_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS import_transactions (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL REFERENCES import_batches(id),
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    suggested_account_id TEXT REFERENCES accounts(id),
    suggested_vendor_name TEXT,
    confidence TEXT NOT NULL DEFAULT 'none',
    status TEXT NOT NULL DEFAULT 'pending',
    rule_id TEXT REFERENCES import_rules(id),
    posted_entry_id TEXT REFERENCES journal_entries(id)
);

CREATE TABLE IF NOT EXISTS reconciliation_sessions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    statement_date TEXT NOT NULL,
    statement_balance REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress',
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS reconciliation_items (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES reconciliation_sessions(id),
    journal_line_id TEXT NOT NULL REFERENCES journal_lines(id),
    is_cleared INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inventory_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sku TEXT,
    quantity_on_hand REAL NOT NULL DEFAULT 0,
    cost_per_unit REAL NOT NULL DEFAULT 0,
    income_account_id TEXT REFERENCES accounts(id),
    asset_account_id TEXT REFERENCES accounts(id),
    cogs_account_id TEXT REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS payroll_runs (
    id TEXT PRIMARY KEY,
    pay_date TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    total_gross REAL NOT NULL DEFAULT 0,
    total_net REAL NOT NULL DEFAULT 0,
    journal_entry_id TEXT REFERENCES journal_entries(id)
);

CREATE TABLE IF NOT EXISTS payroll_employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    pay_rate REAL NOT NULL DEFAULT 0,
    pay_type TEXT NOT NULL DEFAULT 'hourly',
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS recent_companies (
  path TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  last_opened TEXT NOT NULL
);
