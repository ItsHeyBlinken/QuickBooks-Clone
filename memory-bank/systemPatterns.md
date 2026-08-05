# System Patterns

## IPC Protocol
Electron main process spawns Python ledger service as child process.
Communication: newline-delimited JSON-RPC 2.0 over stdin/stdout.

```json
{"jsonrpc":"2.0","id":1,"method":"health.check","params":{}}
{"jsonrpc":"2.0","id":1,"result":{"status":"ok","version":"0.1.0"}}
```

## Ledger Invariants
1. Every posted transaction balances (debits = credits)
2. Journal entries are immutable once posted; corrections via reversing entries
3. Cash-basis reports recognize revenue/expense on payment date
4. Accrual-basis reports recognize on invoice/bill date (Phase 2+)
5. No financial data leaves the machine

## Import Pipeline (3 layers)
1. **Layer 1:** User-defined deterministic rules (first match wins)
2. **Layer 2:** SQLite FTS5 fuzzy vendor match (Phase 3)
3. **Layer 3:** Local Multinomial Naive Bayes suggestion (Phase 3)

## Company File
- Extension: `.ledger`
- Single SQLite database per company
- Tables: accounts, journal_entries, journal_lines, customers, vendors, invoices, etc.
- Schema version tracked in `meta` table

## UI Navigation
Dashboard | Sales | Expenses | Bills | Banking | Accounts | Reconciliation | Reports | Inventory | Payroll | Settings | License

## Company Settings
- `company.updateSettings` RPC: `defaultTaxRate`, `defaultInvoiceDueDays` (days after invoice date; `null` = no default)
- Settings UI grouped: Company → Business Settings → Branding → Data & Portability → Development → Application
- Pending migrations run on `get_company_info` and `update_company_settings` (not only on file open)

## Licensing (Phase 4)
- Signed JWT license file stored locally after one-time online validation
- Feature gates by tier: basic | pro | enterprise
- 30-day full-feature trial, no credit card
