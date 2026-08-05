# Tech Context

## Frontend
- Electron 33+
- React 18 + TypeScript
- Vite for bundling
- React Router for navigation
- CSS modules / CSS variables for theming

## Backend (Ledger Service)
- Python 3.11+
- sqlite3 (stdlib) for database
- scikit-learn for Naive Bayes (Phase 3)
- ofxparse, quiffen for OFX/QIF (Phase 2)

## Dev Commands
```bash
# Install all
npm install
cd services/ledger && pip install -r requirements.txt

# Dev (from root)
npm run dev
npm run marketing:preview   # static site → http://localhost:4173

# Build
npm run build

# Test ledger
cd services/ledger && python -m pytest
```

## IPC Bridge
- `apps/desktop/electron/main.ts` spawns `services/ledger/main.py`
- `apps/desktop/electron/ledger-client.ts` sends JSON-RPC requests
- Preload exposes `window.ledger.*` API to renderer

## Database Migrations
- SQL files in `docs/migrations/` (current: **001–006**)
- Latest: `006_add_default_invoice_due_days.sql` — `default_invoice_due_days` on `company`
- Applied on company file open via `schema_version` in meta table; also on `get_company_info` / `update_company_settings`
- User may apply manually in pgAdmin per project rules

## Build & Distribution (Phase 4)
- electron-builder for Windows (.exe) and macOS (.dmg)
- electron-updater with manual check (never forced)
- Code signing: EV cert (Windows), Apple Developer ID (macOS)

## Marketing site (VPS)
- Source: `docs/marketing/` on `main`
- Publish: GitHub Action flattens to deploy branch root (`gh-pages` default)
- VPS: nginx `root` = git clone root on deploy branch; `git pull` to deploy
- Docs: `docs/marketing/DEPLOY.md`
