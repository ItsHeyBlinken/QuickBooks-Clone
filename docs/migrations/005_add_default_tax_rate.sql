-- Default sales tax rate for invoices (percentage)
ALTER TABLE company ADD COLUMN default_tax_rate REAL NOT NULL DEFAULT 0;
