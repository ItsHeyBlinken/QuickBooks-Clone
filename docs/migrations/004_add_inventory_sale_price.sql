-- Add sales price for inventory items used on invoices
ALTER TABLE inventory_items ADD COLUMN sale_price REAL NOT NULL DEFAULT 0;

UPDATE inventory_items SET sale_price = cost_per_unit WHERE sale_price = 0;
