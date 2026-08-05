-- Migration 003: Company logo for invoice branding

ALTER TABLE company ADD COLUMN logo_path TEXT;
