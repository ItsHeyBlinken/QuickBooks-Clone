# Progress Log

## Session: 2026-07-30 — Full Plan Implementation

### Completed
- [x] Created Memory Bank (projectbrief, productContext, activeContext, systemPatterns, techContext, progress)
- [x] Phase 0: Monorepo scaffold — Electron + React + Vite, Python ledger service, SQLite migrations, JSON-RPC IPC
- [x] Phase 1: Double-entry engine — CoA, journal posting, customers/invoices/payments, expenses, cash-basis P&L/BS/TB
- [x] Phase 1: CSV bank import + deterministic rules + bulk review/approve UI + backup/restore
- [x] Phase 2: Accrual toggle, full AP (bills), reconciliation, batch invoicing, OFX/QIF import, multi-company, aging/cash-flow reports
- [x] Phase 3: Drill-down reports, FTS5 fuzzy + Naive Bayes ML import, encrypted accountant export, inventory, payroll calc, LAN sync stub
- [x] Phase 4: Offline licensing (trial/basic/pro/enterprise), feature gates, electron-builder config, electron-updater hooks, marketing site

### Test Results
- Python ledger tests: 9/9 passed
- TypeScript typecheck: passed

### Files to Stage (suggested commit)
```
memory-bank/
package.json
.gitignore
README.md
apps/desktop/
packages/shared/
services/ledger/
docs/migrations/
docs/marketing/
```

### Suggested Commit Message
```
feat: implement LedgerLocal offline desktop accounting app (Phases 0-4)

Electron + React UI with Python ledger service, double-entry bookkeeping,
invoicing, AP, bank import with rules/ML, reports, licensing, and marketing site.
```

### Next Steps (User)
- Run `npm run dev` to launch the app
- Apply any new SQL migrations from `docs/migrations/` if schema changes
- Handle git commit manually

### Session: 2026-07-30 (continued) — Contrast accessibility pass
- [x] Welcome screen: solid white inputs, high-contrast labels, brighter secondary text
- [x] Sidebar: replaced opacity-based text with explicit light colors
- [x] Global: darker muted/success/warning/danger tokens, stronger badges, focus-visible rings, form label weight
- [x] Reports: drill-down links use accessible `.btn-link` class
- [x] Sales: inline Add Customer on New Invoice form (auto-selects new customer)
- [x] Sales: multi-line invoice items + PDF export and email client workflow
- [x] Company logo: upload/remove in Settings, stored beside `.ledger` file, shown on invoice PDFs
- [x] Fix startup `Database not connected` console noise — `company.info` returns `null` when no file is open
- [x] Sales invoice form: searchable customer picker + add inventory items to line items (with sales price on inventory)
- [x] Chart of Accounts page: grouped account list, add account form, quick Add Bank Account preset
- [x] Sales invoice form: tax entered as percentage, calculated from subtotal on create
- [x] Default tax rate in Settings (Business Settings); invoices pull rate from company settings
- [x] Development sample data: load/remove demo seed (customers, invoices, inventory, payroll, bills, imports) from Settings
- [x] Fix sample data reload after clear (sweep leftover seed records, auto-cleanup before re-seed, error banner in Settings)
- [x] Fix report drill-down license errors: trial/dev unlock features; graceful UI for Basic tier
- [x] Ledger errors surface in-app (not just Electron console); Reports shows license notice for drill-down
- [x] Backend-vs-UI audit documented (gaps: payment refs, payroll post, inventory adjust, etc.)
- [x] Default invoice due date setting (Net 7/15/30/etc.) in Business Settings; Sales auto-fills due date from company default
- [x] Settings page reorganized into logical sections (Company, Branding, Data & Portability, Development, Application)
- [x] Fix default invoice due date not persisting: apply pending migrations on save/read, refresh Settings from DB on mount, stop UI state reset race
- [x] Marketing landing page: full static site at `docs/marketing/` (hero, features, pricing, FAQ, app preview mock)
- [x] Marketing site updated to Coming Soon — waitlist CTA replaces download buttons

---

## Session: 2026-07-30 (continued #2) — Settings, audit, marketing

### Completed
- [x] Backend-vs-UI audit: documented RPC methods/params missing or partial in desktop UI
- [x] Default invoice due date company setting (migration 006, Business Settings, Sales auto-fill)
- [x] Settings page reorganized into logical section groups
- [x] Fix due-date setting persistence (migrations on read/save, Settings mount refresh, state race fix)
- [x] Marketing landing page: `docs/marketing/index.html` + `styles.css`
- [x] Marketing site: Coming Soon mode, waitlist form (mailto), `npm run marketing:preview`

### Migrations added (user applies manually or via reopen)
- `003_add_company_logo.sql`
- `004_add_inventory_sale_price.sql`
- `005_add_default_tax_rate.sql`
- `006_add_default_invoice_due_days.sql`

### Test status (end of session)
- Python ledger tests: passing (incl. `test_company_settings_defaults`, migration-on-save test)
- TypeScript typecheck: passing

### Suggested commits (user handles git)
1. `feat: add default invoice due date setting and fix settings persistence`
2. `feat: add Coming Soon marketing landing page`

### To-Dos for next session
See **activeContext.md → To-Dos — Next Session** (source of truth for backlog).

---

## Session: 2026-08-04 — Marketing product tour

### Completed
- [x] `docs/marketing/onboarding.html` — 6-step product tour (setup, invoicing, banking, payables, reports, backup)
- [x] CSS UI mocks per workflow step; sticky jump nav with scroll highlighting
- [x] Feature matrix summary + waitlist CTA
- [x] Linked from `index.html` nav, hero, and footer ("Product tour")
