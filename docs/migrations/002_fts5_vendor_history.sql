-- Migration 002: FTS5 for fuzzy vendor matching (Phase 3)

CREATE VIRTUAL TABLE IF NOT EXISTS vendor_history_fts USING fts5(
    description,
    category_id,
    vendor_name,
    content='',
    tokenize='porter'
);

CREATE TABLE IF NOT EXISTS vendor_history (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    category_id TEXT NOT NULL REFERENCES accounts(id),
    vendor_name TEXT,
    created_at TEXT NOT NULL
);
