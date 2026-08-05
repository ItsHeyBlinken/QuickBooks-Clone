"""JSON-RPC 2.0 handler for ledger service."""

from __future__ import annotations

from typing import Any, Callable

from . import (
    accountant_export,
    accounts,
    bills,
    company_branding,
    company_settings,
    customers,
    import_engine,
    inventory,
    invoice_pdf,
    invoices,
    journal,
    licensing,
    payroll,
    reconciliation,
    reports,
    seed,
    vendors,
)
from .database import Database
from .feature_gates import check_method_access
from . import __version__
from . import lan_sync

Handler = Callable[[Database, dict[str, Any]], Any]


class RpcServer:
    def __init__(self) -> None:
        self.db = Database()
        self.handlers: dict[str, Handler] = {
            "health.check": self._health_check,
            "company.create": self._company_create,
            "company.open": self._company_open,
            "company.info": self._company_info,
            "company.backup": self._company_backup,
            "company.restore": self._company_restore,
            "company.recent": self._company_recent,
            "company.setLogo": self._company_set_logo,
            "company.removeLogo": self._company_remove_logo,
            "company.updateSettings": self._company_update_settings,
            "accounts.list": self._accounts_list,
            "accounts.get": self._accounts_get,
            "accounts.create": self._accounts_create,
            "accounts.update": self._accounts_update,
            "journal.post": self._journal_post,
            "journal.get": self._journal_get,
            "journal.list": self._journal_list,
            "journal.void": self._journal_void,
            "customers.list": self._customers_list,
            "customers.create": self._customers_create,
            "customers.update": self._customers_update,
            "vendors.list": self._vendors_list,
            "vendors.create": self._vendors_create,
            "vendors.update": self._vendors_update,
            "invoices.list": self._invoices_list,
            "invoices.create": self._invoices_create,
            "invoices.get": self._invoices_get,
            "invoices.pay": self._invoices_pay,
            "invoices.batch": self._invoices_batch,
            "invoices.exportPdf": self._invoices_export_pdf,
            "bills.list": self._bills_list,
            "bills.create": self._bills_create,
            "bills.pay": self._bills_pay,
            "expenses.record": self._expenses_record,
            "reports.pnl": self._reports_pnl,
            "reports.balanceSheet": self._reports_balance_sheet,
            "reports.trialBalance": self._reports_trial_balance,
            "reports.cashFlow": self._reports_cash_flow,
            "reports.aging": self._reports_aging,
            "reports.drillDown": self._reports_drill_down,
            "import.csv": self._import_csv,
            "import.ofx": self._import_ofx,
            "import.qif": self._import_qif,
            "import.batch": self._import_batch,
            "import.approve": self._import_approve,
            "import.skip": self._import_skip,
            "rules.list": self._rules_list,
            "rules.create": self._rules_create,
            "rules.delete": self._rules_delete,
            "reconciliation.start": self._reconciliation_start,
            "reconciliation.get": self._reconciliation_get,
            "reconciliation.toggle": self._reconciliation_toggle,
            "reconciliation.complete": self._reconciliation_complete,
            "inventory.list": self._inventory_list,
            "inventory.create": self._inventory_create,
            "inventory.adjust": self._inventory_adjust,
            "inventory.sale": self._inventory_sale,
            "payroll.employees": self._payroll_employees,
            "payroll.createEmployee": self._payroll_create_employee,
            "payroll.calculate": self._payroll_calculate,
            "payroll.post": self._payroll_post,
            "license.info": self._license_info,
            "license.activate": self._license_activate,
            "license.checkFeature": self._license_check_feature,
            "export.create": self._export_create,
            "export.open": self._export_open,
            "sync.start": self._sync_start,
            "sync.stop": self._sync_stop,
            "sync.discover": self._sync_discover,
            "dev.seedStatus": self._dev_seed_status,
            "dev.seedDemo": self._dev_seed_demo,
            "dev.clearDemo": self._dev_clear_demo,
        }

    def handle(self, request: dict[str, Any]) -> dict[str, Any]:
        req_id = request.get("id")
        method = request.get("method", "")
        params = request.get("params", {})

        handler = self.handlers.get(method)
        if not handler:
            return self._error(req_id, -32601, f"Method not found: {method}")

        if not check_method_access(method):
            return self._error(req_id, -32003, f"Feature not available in your license tier: {method}")

        try:
            result = handler(self.db, params)
            return {"jsonrpc": "2.0", "id": req_id, "result": result}
        except FileNotFoundError as e:
            return self._error(req_id, -32001, str(e))
        except ValueError as e:
            return self._error(req_id, -32002, str(e))
        except Exception as e:
            return self._error(req_id, -32000, str(e))

    def _error(self, req_id: Any, code: int, message: str) -> dict[str, Any]:
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {"code": code, "message": message},
        }

    def _health_check(self, db: Database, params: dict) -> dict:
        return {"status": "ok", "version": __version__}

    def _company_create(self, db: Database, params: dict) -> dict:
        return db.create_company(params["path"], params["name"])

    def _company_open(self, db: Database, params: dict) -> dict:
        return db.open_company(params["path"])

    def _company_info(self, db: Database, params: dict) -> dict | None:
        if not db.is_connected:
            return None
        return db.get_company_info()

    def _company_backup(self, db: Database, params: dict) -> dict:
        return db.backup(params["destPath"])

    def _company_restore(self, db: Database, params: dict) -> dict:
        return db.restore(params["sourcePath"])

    def _company_recent(self, db: Database, params: dict) -> list:
        try:
            rows = db.execute(
                "SELECT path, name, last_opened FROM recent_companies ORDER BY last_opened DESC LIMIT 10"
            ).fetchall()
            return [{"path": r["path"], "name": r["name"], "lastOpened": r["last_opened"]} for r in rows]
        except Exception:
            return []

    def _company_set_logo(self, db: Database, params: dict) -> dict:
        return company_branding.set_company_logo(db, params["sourcePath"])

    def _company_remove_logo(self, db: Database, params: dict) -> dict:
        return company_branding.remove_company_logo(db)

    def _company_update_settings(self, db: Database, params: dict) -> dict:
        due_days = (
            params["defaultInvoiceDueDays"]
            if "defaultInvoiceDueDays" in params
            else company_settings._UNSET
        )
        return company_settings.update_company_settings(
            db,
            params.get("defaultTaxRate"),
            due_days,
        )

    def _accounts_list(self, db: Database, params: dict) -> list:
        return accounts.list_accounts(db, params.get("activeOnly", True))

    def _accounts_get(self, db: Database, params: dict) -> dict | None:
        return accounts.get_account(db, params["id"])

    def _accounts_create(self, db: Database, params: dict) -> dict:
        return accounts.create_account(
            db, params["code"], params["name"], params["type"], params["subtype"],
            params.get("parentId"),
        )

    def _accounts_update(self, db: Database, params: dict) -> dict:
        return accounts.update_account(db, params["id"], params.get("name"), params.get("isActive"))

    def _journal_post(self, db: Database, params: dict) -> dict:
        return journal.post_entry(
            db, params["date"], params["lines"],
            params.get("memo"), params.get("reference"),
            params.get("sourceType"), params.get("sourceId"),
        )

    def _journal_get(self, db: Database, params: dict) -> dict | None:
        return journal.get_entry(db, params["id"])

    def _journal_list(self, db: Database, params: dict) -> list:
        return journal.list_entries(
            db, params.get("startDate"), params.get("endDate"),
            params.get("accountId"), params.get("limit", 100),
        )

    def _journal_void(self, db: Database, params: dict) -> dict:
        return journal.void_entry(db, params["id"])

    def _customers_list(self, db: Database, params: dict) -> list:
        return customers.list_customers(db)

    def _customers_create(self, db: Database, params: dict) -> dict:
        return customers.create_customer(
            db, params["name"], params.get("email"),
            params.get("phone"), params.get("address"),
        )

    def _customers_update(self, db: Database, params: dict) -> dict:
        return customers.update_customer(db, params["id"], **params)

    def _vendors_list(self, db: Database, params: dict) -> list:
        return vendors.list_vendors(db)

    def _vendors_create(self, db: Database, params: dict) -> dict:
        return vendors.create_vendor(
            db, params["name"], params.get("email"),
            params.get("phone"), params.get("address"),
        )

    def _vendors_update(self, db: Database, params: dict) -> dict:
        return vendors.update_vendor(db, params["id"], **params)

    def _invoices_list(self, db: Database, params: dict) -> list:
        return invoices.list_invoices(db, params.get("customerId"))

    def _invoices_create(self, db: Database, params: dict) -> dict:
        return invoices.create_invoice(
            db, params["customerId"], params["invoiceNumber"],
            params["date"], params["lines"],
            params.get("dueDate"), params.get("taxAmount", 0),
        )

    def _invoices_get(self, db: Database, params: dict) -> dict | None:
        return invoices.get_invoice(db, params["id"])

    def _invoices_pay(self, db: Database, params: dict) -> dict:
        return invoices.record_payment(
            db, params["invoiceId"], params["date"],
            params["amount"], params["depositAccountId"],
            params.get("reference"),
        )

    def _invoices_batch(self, db: Database, params: dict) -> list:
        return invoices.batch_create_invoices(db, params["invoices"])

    def _invoices_export_pdf(self, db: Database, params: dict) -> dict:
        return invoice_pdf.export_invoice_pdf(db, params["invoiceId"], params["destPath"])

    def _bills_list(self, db: Database, params: dict) -> list:
        return bills.list_bills(db, params.get("vendorId"))

    def _bills_create(self, db: Database, params: dict) -> dict:
        return bills.create_bill(
            db, params["vendorId"], params["billNumber"],
            params["date"], params["lines"],
            params.get("dueDate"), params.get("taxAmount", 0),
        )

    def _bills_pay(self, db: Database, params: dict) -> dict:
        return bills.record_bill_payment(
            db, params["billId"], params["date"],
            params["amount"], params["paymentAccountId"],
            params.get("reference"),
        )

    def _expenses_record(self, db: Database, params: dict) -> dict:
        return bills.record_expense(
            db, params["date"], params["amount"],
            params["expenseAccountId"], params["paymentAccountId"],
            params.get("memo"), params.get("vendorId"),
        )

    def _reports_pnl(self, db: Database, params: dict) -> dict:
        return reports.profit_and_loss(
            db, params["startDate"], params["endDate"],
            params.get("basis", "cash"),
        )

    def _reports_balance_sheet(self, db: Database, params: dict) -> dict:
        return reports.balance_sheet(db, params["asOfDate"], params.get("basis", "cash"))

    def _reports_trial_balance(self, db: Database, params: dict) -> dict:
        return reports.trial_balance(db, params["asOfDate"], params.get("basis", "cash"))

    def _reports_cash_flow(self, db: Database, params: dict) -> dict:
        return reports.cash_flow(db, params["startDate"], params["endDate"])

    def _reports_aging(self, db: Database, params: dict) -> dict:
        return reports.aging_report(db, params["type"], params["asOfDate"])

    def _reports_drill_down(self, db: Database, params: dict) -> list:
        return reports.drill_down(
            db, params["accountId"], params["startDate"], params["endDate"],
        )

    def _import_csv(self, db: Database, params: dict) -> dict:
        return import_engine.import_csv(
            db, params["content"], params.get("filename"),
        )

    def _import_ofx(self, db: Database, params: dict) -> dict:
        return import_engine.import_ofx(db, params["content"], params.get("filename"))

    def _import_qif(self, db: Database, params: dict) -> dict:
        return import_engine.import_qif(db, params["content"], params.get("filename"))

    def _import_batch(self, db: Database, params: dict) -> dict:
        return import_engine.get_batch(db, params["batchId"])

    def _import_approve(self, db: Database, params: dict) -> dict:
        return import_engine.approve_transactions(
            db, params["transactionIds"], params["bankAccountId"],
        )

    def _import_skip(self, db: Database, params: dict) -> dict:
        return import_engine.skip_transactions(db, params["transactionIds"])

    def _rules_list(self, db: Database, params: dict) -> list:
        return import_engine.list_rules(db)

    def _rules_create(self, db: Database, params: dict) -> dict:
        return import_engine.create_rule(
            db, params["name"], params["criteria"], params["action"],
            params.get("priority", 0),
        )

    def _rules_delete(self, db: Database, params: dict) -> dict:
        return import_engine.delete_rule(db, params["id"])

    def _reconciliation_start(self, db: Database, params: dict) -> dict:
        return reconciliation.start_session(
            db, params["accountId"], params["statementDate"],
            params["statementBalance"],
        )

    def _reconciliation_get(self, db: Database, params: dict) -> dict | None:
        return reconciliation.get_session(db, params["sessionId"])

    def _reconciliation_toggle(self, db: Database, params: dict) -> dict:
        return reconciliation.toggle_cleared(db, params["itemId"], params["isCleared"])

    def _reconciliation_complete(self, db: Database, params: dict) -> dict:
        return reconciliation.complete_session(db, params["sessionId"])

    def _inventory_list(self, db: Database, params: dict) -> list:
        return inventory.list_items(db)

    def _inventory_create(self, db: Database, params: dict) -> dict:
        return inventory.create_item(
            db, params["name"], params.get("sku"),
            params.get("costPerUnit", 0), params.get("quantityOnHand", 0),
            params.get("salePrice"),
        )

    def _inventory_adjust(self, db: Database, params: dict) -> dict:
        return inventory.adjust_quantity(
            db, params["itemId"], params["quantityChange"],
            params["date"], params.get("memo"),
        )

    def _inventory_sale(self, db: Database, params: dict) -> dict:
        return inventory.record_sale(
            db, params["itemId"], params["quantity"],
            params["salePrice"], params["date"], params["depositAccountId"],
        )

    def _payroll_employees(self, db: Database, params: dict) -> list:
        return payroll.list_employees(db)

    def _payroll_create_employee(self, db: Database, params: dict) -> dict:
        return payroll.create_employee(
            db, params["name"], params["payRate"], params.get("payType", "hourly"),
        )

    def _payroll_calculate(self, db: Database, params: dict) -> dict:
        return payroll.calculate_payroll(
            db, params["payDate"], params["periodStart"],
            params["periodEnd"], params["entries"],
            params.get("taxRates"),
        )

    def _payroll_post(self, db: Database, params: dict) -> dict:
        return payroll.post_payroll(db, params["runId"], params["paymentAccountId"])

    def _license_info(self, db: Database, params: dict) -> dict:
        return licensing.get_license_info()

    def _license_activate(self, db: Database, params: dict) -> dict:
        return licensing.activate_license(params["key"])

    def _license_check_feature(self, db: Database, params: dict) -> dict:
        return {"allowed": licensing.check_feature(params["feature"])}

    def _export_create(self, db: Database, params: dict) -> dict:
        return accountant_export.create_export(
            db, params["destPath"], params["password"],
            params.get("periodStart"), params.get("periodEnd"),
        )

    def _export_open(self, db: Database, params: dict) -> dict:
        return accountant_export.open_export(params["path"], params["password"])

    def _sync_start(self, db: Database, params: dict) -> dict:
        info = db.get_company_info()
        return lan_sync.start_sync(db.path or "", info["name"])

    def _sync_stop(self, db: Database, params: dict) -> dict:
        return lan_sync.stop_sync()

    def _sync_discover(self, db: Database, params: dict) -> list:
        return lan_sync.discover_peers()

    def _dev_seed_status(self, db: Database, params: dict) -> dict:
        return seed.get_seed_status(db)

    def _dev_seed_demo(self, db: Database, params: dict) -> dict:
        return seed.seed_demo_data(db)

    def _dev_clear_demo(self, db: Database, params: dict) -> dict:
        return seed.clear_demo_data(db)
