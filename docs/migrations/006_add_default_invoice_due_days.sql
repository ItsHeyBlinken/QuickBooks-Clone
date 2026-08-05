-- Default invoice payment terms: days after invoice date (NULL = no default)
ALTER TABLE company ADD COLUMN default_invoice_due_days INTEGER DEFAULT NULL;
