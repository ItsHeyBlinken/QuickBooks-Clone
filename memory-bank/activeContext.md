# Active Context

## Current Phase
All phases (0–4) implemented. Focus is **polish, UI parity with backend, and pre-launch marketing** — not new core ledger features unless blocking.

## Stack (locked)
- **UI:** Electron + React + TypeScript + Vite
- **Ledger:** Python 3.11+ (IPC via stdio JSON-RPC)
- **Database:** SQLite per company file (`.ledger` extension)
- **Platform:** Windows-first; cross-platform dev

## Architecture Decisions
- One SQLite file per company; backup = file copy
- Double-entry from day one; cash-basis as default report mode
- Posted journal entries are append-only (void/reverse pattern)
- Import never auto-posts without user approval
- Python handles all ledger logic; Electron is UI shell + IPC bridge
- Feature gates enforce license tiers (trial unlocks all for 30 days; `LEDGERLOCAL_DEV=1` in dev)
- Company settings (`defaultTaxRate`, `defaultInvoiceDueDays`) stored on `company` table; migrations applied on open **and** on settings read/save for hot-reload safety
- Marketing site is static HTML at `docs/marketing/` — `index.html` (landing) + `onboarding.html` (product tour); Coming Soon with mailto waitlist

## Monorepo Layout
```
apps/desktop/       Electron + React UI
services/ledger/    Python ledger service
packages/shared/    Shared TypeScript types
docs/marketing/     Static landing page (index.html + styles.css)
docs/migrations/    SQL migrations (001–006)
memory-bank/        Project memory
```

## Dev Commands
```bash
npm install
cd services/ledger && pip install -r requirements.txt
npm run dev                              # Desktop app
npm run marketing:preview                # http://localhost:4173
cd services/ledger && python -m pytest
cd apps/desktop && npm run typecheck
```

## Latest Session (2026-07-30, continued)
- Backend-vs-UI audit completed (many RPC params/methods lack UI exposure)
- Business Settings: default tax rate + default invoice due date (Net terms); Settings page grouped into sections
- Migration `006_add_default_invoice_due_days.sql` — user applies by reopening company file (auto) or pgAdmin
- Fixed due-date setting not persisting (migration-on-save, Settings refresh from `company.info`)
- Full marketing landing page built; switched to **Coming Soon** + waitlist CTA

## To-Dos — Next Session

### User (manual)
- [ ] Apply migrations **003–006** on existing `.ledger` files if not already (reopen company or run SQL in pgAdmin)
- [ ] Git commit session changes when ready (user handles all commits)
- [ ] Smoke-test: Settings → save Net 30 due date → Sales → New Invoice due date auto-fills
- [ ] Preview marketing site: `npm run marketing:preview`

### UI parity — high priority (from backend audit)
- [ ] **Sales → Record Payment:** deposit account dropdown + optional payment reference (mirror Bills pay-from pattern)
- [ ] **Bills → Pay Bill:** optional payment reference field
- [ ] **Payroll:** Post Payroll button + pay-from account (`payroll.post`)
- [ ] **Expenses:** vendor picker in form (`vendorId` already sent, no UI)

### UI parity — medium priority
- [ ] **Bills create:** due date, expense account picker, description field, optional tax / multi-line
- [ ] **Banking:** per-row category override before approve; delete import rules (`rules.delete`)
- [ ] **Customers / vendors:** edit screens (`customers.update`, `vendors.update`); address on create
- [ ] **Chart of Accounts:** rename / deactivate (`accounts.update`); show inactive (`activeOnly: false`)
- [ ] **Inventory:** adjust quantity + standalone sale UI (`inventory.adjust`, `inventory.sale`)
- [ ] **Reports:** balance sheet / trial balance drill-down links (same as P&L)

### Settings & company
- [ ] Expose `defaultBasis` and `fiscalYearStartMonth` in Settings (needs backend RPC extension — columns exist, no update method yet)
- [ ] **Settings → export:** period start/end for accountant export (`export.create` params)

### Marketing & launch
- [ ] Deploy `docs/marketing/` to static host (Netlify, GitHub Pages, etc.)
- [ ] Replace mailto waitlist with real email capture (Formspree, Buttondown, etc.) when domain/email ready
- [ ] Swap Coming Soon CTAs to download links when Windows build is signed and hosted
- [ ] Update `hello@ledgerlocal.app` to real contact address if different

### Larger / later
- [ ] Journal viewer + void UI (`journal.list` filters, `journal.void`)
- [ ] Invoice detail view (`invoices.get`)
- [ ] LAN sync UI (`sync.start` / `stop` / `discover`) — Pro/Enterprise gated
- [ ] Accountant export open UI (`export.open`)
- [ ] Code signing + production installer for Windows ship

### Quality
- [ ] Re-run full pytest + typecheck after UI parity work
- [ ] End-to-end test with sample data: invoice → payment → report drill-down
