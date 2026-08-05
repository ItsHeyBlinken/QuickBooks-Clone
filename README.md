# LedgerLocal

Offline-first desktop accounting software for small businesses.

## Quick Start

```bash
# Install dependencies
npm install
cd services/ledger && pip install -r requirements.txt

# Run in development
npm run dev

# Run ledger tests
cd services/ledger && python -m pytest
```

## Architecture

- `apps/desktop/` — Electron + React UI
- `services/ledger/` — Python ledger service (JSON-RPC over stdio)
- `packages/shared/` — Shared TypeScript types
- `docs/migrations/` — SQLite schema migrations
- `memory-bank/` — Project memory and decisions

## Company Files

Each company is a single `.ledger` SQLite file. Backup = copy the file.

## License Keys (dev/testing)

- `LL-BASIC-TESTKEY12345678` — Basic tier
- `LL-PRO-TESTKEY123456789` — Pro tier
- `LL-ENT-TESTKEY123456789` — Enterprise tier

## Phases Implemented

- Phase 0: Monorepo scaffold, Memory Bank, IPC health check
- Phase 1: Double-entry ledger, invoicing, expenses, CSV import, cash-basis reports
- Phase 2: AP/bills, reconciliation, batch invoicing, OFX/QIF, accrual toggle, aging reports
- Phase 3: Drill-down reports, FTS5/ML import, accountant export, inventory, payroll calc
- Phase 4: Licensing, feature gates, electron-builder config, marketing site, updater hooks
