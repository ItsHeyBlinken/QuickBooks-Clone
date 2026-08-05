"""Demo seed data for development testing — fully removable before release."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from . import accounts, bills, customers, import_engine, inventory, invoices, payroll, vendors
from .database import Database

SEED_META_KEY = "demo_seed_manifest"
SEED_FLAG_KEY = "demo_seed_active"
SEED_AT_KEY = "demo_seed_at"

DELETE_ORDER = [
    "reconciliation_items",
    "import_transactions",
    "invoice_payments",
    "invoice_lines",
    "bill_payments",
    "bill_lines",
    "journal_lines",
    "reconciliation_sessions",
    "import_batches",
    "import_rules",
    "journal_entries",
    "invoices",
    "bills",
    "payroll_runs",
    "payroll_employees",
    "inventory_items",
    "customers",
    "vendors",
]

SEED_CUSTOMERS = ("Acme Manufacturing", "Bright Bakery", "Cedar Consulting")
SEED_VENDORS = ("Office Depot", "CloudHost Inc")
SEED_EMPLOYEES = ("Alex Rivera", "Jordan Lee", "Sam Patel")
SEED_INVENTORY_SKUS = ("WDG-001", "SVC-100", "SUP-HR", "BDL-START")
SEED_EXPENSE_MEMOS = ("Office supplies", "Team lunch")


class SeedManifest:
    def __init__(self) -> None:
        self.items: list[dict[str, str]] = []

    def add(self, table: str, entity_id: str) -> None:
        self.items.append({"table": table, "id": entity_id})

    def save(self, db: Database) -> None:
        now = datetime.now(timezone.utc).isoformat()
        db.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
            (SEED_META_KEY, json.dumps(self.items)),
        )
        db.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
            (SEED_FLAG_KEY, "1"),
        )
        db.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
            (SEED_AT_KEY, now),
        )
        db.commit()


def is_seeded(db: Database) -> bool:
    row = db.execute("SELECT value FROM meta WHERE key = ?", (SEED_FLAG_KEY,)).fetchone()
    return row is not None and row["value"] == "1"


def get_seed_status(db: Database) -> dict[str, Any]:
    if not is_seeded(db):
        return {"seeded": False, "counts": {}, "seededAt": None}

    manifest = _load_manifest(db)
    counts: dict[str, int] = defaultdict(int)
    for item in manifest:
        counts[item["table"]] += 1

    seeded_at_row = db.execute("SELECT value FROM meta WHERE key = ?", (SEED_AT_KEY,)).fetchone()
    return {
        "seeded": True,
        "counts": dict(counts),
        "seededAt": seeded_at_row["value"] if seeded_at_row else None,
    }


def seed_demo_data(db: Database) -> dict[str, Any]:
    if not db.is_connected:
        raise RuntimeError("No company file open")
    if is_seeded(db) or _has_seed_artifacts(db):
        clear_demo_data(db)

    manifest = SeedManifest()
    income = accounts.find_account_by_subtype(db, "income")
    bank = accounts.find_account_by_subtype(db, "bank")
    expense = accounts.find_account_by_subtype(db, "expense")
    if not income or not bank or not expense:
        raise RuntimeError("Default chart of accounts is missing required accounts")

    customer_acme = customers.create_customer(
        db, "Acme Manufacturing", "billing@acme.example", "555-0101", "100 Industrial Way"
    )
    manifest.add("customers", customer_acme["id"])

    customer_bakery = customers.create_customer(
        db, "Bright Bakery", "orders@brightbakery.example", "555-0102"
    )
    manifest.add("customers", customer_bakery["id"])

    customer_cedar = customers.create_customer(
        db, "Cedar Consulting", "ap@cedarconsulting.example", "555-0103"
    )
    manifest.add("customers", customer_cedar["id"])

    vendor_office = vendors.create_vendor(
        db, "Office Depot", "vendor@officedepot.example", "555-0201"
    )
    manifest.add("vendors", vendor_office["id"])

    vendor_cloud = vendors.create_vendor(
        db, "CloudHost Inc", "billing@cloudhost.example", "555-0202"
    )
    manifest.add("vendors", vendor_cloud["id"])

    inventory_specs = [
        ("Widget Pro", "WDG-001", 12.5, 24.99, 40),
        ("Service Kit", "SVC-100", 8.0, 19.5, 25),
        ("Premium Support Hour", "SUP-HR", 0, 95.0, 999),
        ("Starter Bundle", "BDL-START", 45.0, 89.0, 12),
    ]
    for name, sku, cost, sale_price, qty in inventory_specs:
        item = inventory.create_item(db, name, sku, cost, qty, sale_price)
        manifest.add("inventory_items", item["id"])

    employees = [
        ("Alex Rivera", 28.0, "hourly"),
        ("Jordan Lee", 5200.0, "salary"),
        ("Sam Patel", 32.5, "hourly"),
    ]
    seeded_employee_ids: list[str] = []
    for name, pay_rate, pay_type in employees:
        employee = payroll.create_employee(db, name, pay_rate, pay_type)
        manifest.add("payroll_employees", employee["id"])
        seeded_employee_ids.append(employee["id"])

    invoice_specs = [
        (customer_acme["id"], "INV-SEED-1001", "2026-03-01", "2026-03-15", 8.25, [
            {"description": "Widget Pro installation", "quantity": 4, "unitPrice": 24.99, "accountId": income["id"]},
            {"description": "Premium support (2 hrs)", "quantity": 2, "unitPrice": 95.0, "accountId": income["id"]},
        ], True),
        (customer_bakery["id"], "INV-SEED-1002", "2026-03-05", "2026-03-20", 8.25, [
            {"description": "Starter Bundle", "quantity": 3, "unitPrice": 89.0, "accountId": income["id"]},
        ], False),
        (customer_cedar["id"], "INV-SEED-1003", "2026-02-20", "2026-03-06", 0, [
            {"description": "Monthly retainer", "quantity": 1, "unitPrice": 2500.0, "accountId": income["id"]},
        ], True),
    ]

    for customer_id, number, date, due_date, tax_rate, lines, mark_paid in invoice_specs:
        subtotal = sum(line["quantity"] * line["unitPrice"] for line in lines)
        tax_amount = round(subtotal * (tax_rate / 100), 2)
        inv = invoices.create_invoice(
            db,
            customer_id=customer_id,
            invoice_number=number,
            date=date,
            lines=lines,
            due_date=due_date,
            tax_amount=tax_amount,
        )
        _track_invoice(db, manifest, inv)
        if mark_paid:
            payment = invoices.record_payment(db, inv["id"], due_date, inv["total"], bank["id"])
            manifest.add("invoice_payments", payment["id"])
            _track_journals_for_source(db, manifest, payment["id"])

    bill = bills.create_bill(
        db,
        vendor_id=vendor_cloud["id"],
        bill_number="BILL-SEED-2001",
        date="2026-03-02",
        due_date="2026-03-17",
        lines=[{"description": "Cloud hosting - March", "quantity": 1, "unitPrice": 149.0, "accountId": expense["id"]}],
        tax_amount=0,
    )
    _track_bill(db, manifest, bill)
    _track_journals_for_source(db, manifest, bill["id"])

    expense_specs = [
        ("2026-03-03", 86.42, "Office supplies", vendor_office["id"]),
        ("2026-03-07", 42.18, "Team lunch", None),
    ]
    for date, amount, memo, vendor_id in expense_specs:
        entry = bills.record_expense(
            db, date, amount, expense["id"], bank["id"], memo, vendor_id
        )
        _track_journal_entry(db, manifest, entry["id"])

    rule = import_engine.create_rule(
        db,
        name="Seed: Coffee Shop",
        criteria={"descriptionContains": "COFFEE"},
        action={"categoryId": expense["id"], "vendorName": "Coffee Shop"},
        priority=10,
    )
    manifest.add("import_rules", rule["id"])

    csv_content = (
        "Date,Description,Amount\n"
        "2026-03-08,COFFEE SHOP DOWNTOWN,-6.75\n"
        "2026-03-09,CLIENT DEPOSIT,0.00\n"
        "2026-03-10,OFFICE DEPOT #442,-34.20\n"
    )
    imported = import_engine.import_csv(db, csv_content, "seed-bank-import.csv")
    manifest.add("import_batches", imported["batchId"])
    for txn in imported["transactions"]:
        manifest.add("import_transactions", txn["id"])

    payroll_run = payroll.calculate_payroll(
        db,
        pay_date="2026-03-15",
        period_start="2026-03-01",
        period_end="2026-03-15",
        entries=[
            {"employeeId": seeded_employee_ids[0], "hours": 80},
            {"employeeId": seeded_employee_ids[1], "hours": 0},
        ],
    )
    manifest.add("payroll_runs", payroll_run["id"])

    manifest.save(db)
    return get_seed_status(db)


def clear_demo_data(db: Database) -> dict[str, Any]:
    if not db.is_connected:
        raise RuntimeError("No company file open")

    removed = 0
    if is_seeded(db):
        manifest = _load_manifest(db)
        ids_by_table: dict[str, set[str]] = defaultdict(set)
        for item in manifest:
            ids_by_table[item["table"]].add(item["id"])

        for table in DELETE_ORDER:
            ids = ids_by_table.get(table)
            if not ids:
                continue
            placeholders = ",".join("?" for _ in ids)
            cursor = db.execute(f"DELETE FROM {table} WHERE id IN ({placeholders})", tuple(ids))
            removed += cursor.rowcount

    removed += _sweep_seed_artifacts(db)

    for key in (SEED_META_KEY, SEED_FLAG_KEY, SEED_AT_KEY):
        db.execute("DELETE FROM meta WHERE key = ?", (key,))
    db.commit()

    return {
        "seeded": False,
        "counts": {},
        "seededAt": None,
        "removed": removed,
    }


def _load_manifest(db: Database) -> list[dict[str, str]]:
    row = db.execute("SELECT value FROM meta WHERE key = ?", (SEED_META_KEY,)).fetchone()
    if not row:
        return []
    return json.loads(row["value"])


def _has_seed_artifacts(db: Database) -> bool:
    checks = [
        ("SELECT 1 FROM invoices WHERE invoice_number LIKE 'INV-SEED-%' LIMIT 1", ()),
        ("SELECT 1 FROM bills WHERE bill_number LIKE 'BILL-SEED-%' LIMIT 1", ()),
        (
            f"SELECT 1 FROM customers WHERE name IN ({','.join('?' for _ in SEED_CUSTOMERS)}) LIMIT 1",
            SEED_CUSTOMERS,
        ),
        ("SELECT 1 FROM import_batches WHERE filename = 'seed-bank-import.csv' LIMIT 1", ()),
        ("SELECT 1 FROM import_rules WHERE name LIKE 'Seed:%' LIMIT 1", ()),
    ]
    for sql, params in checks:
        if db.execute(sql, params).fetchone():
            return True
    return False


def _delete_journals_for_sources(db: Database, source_ids: list[str]) -> int:
    if not source_ids:
        return 0
    placeholders = ",".join("?" for _ in source_ids)
    entry_rows = db.execute(
        f"SELECT id FROM journal_entries WHERE source_id IN ({placeholders})",
        tuple(source_ids),
    ).fetchall()
    removed = 0
    for row in entry_rows:
        entry_id = row["id"]
        cursor = db.execute("DELETE FROM journal_lines WHERE entry_id = ?", (entry_id,))
        removed += cursor.rowcount
        cursor = db.execute("DELETE FROM journal_entries WHERE id = ?", (entry_id,))
        removed += cursor.rowcount
    return removed


def _sweep_seed_artifacts(db: Database) -> int:
    removed = 0

    invoice_rows = db.execute(
        "SELECT id FROM invoices WHERE invoice_number LIKE 'INV-SEED-%'"
    ).fetchall()
    invoice_ids = [row["id"] for row in invoice_rows]
    if invoice_ids:
        placeholders = ",".join("?" for _ in invoice_ids)
        payment_rows = db.execute(
            f"SELECT id FROM invoice_payments WHERE invoice_id IN ({placeholders})",
            tuple(invoice_ids),
        ).fetchall()
        payment_ids = [row["id"] for row in payment_rows]
        removed += _delete_journals_for_sources(db, invoice_ids + payment_ids)
        cursor = db.execute(f"DELETE FROM invoice_payments WHERE invoice_id IN ({placeholders})", tuple(invoice_ids))
        removed += cursor.rowcount
        cursor = db.execute(f"DELETE FROM invoice_lines WHERE invoice_id IN ({placeholders})", tuple(invoice_ids))
        removed += cursor.rowcount
        cursor = db.execute(f"DELETE FROM invoices WHERE id IN ({placeholders})", tuple(invoice_ids))
        removed += cursor.rowcount

    bill_rows = db.execute(
        "SELECT id FROM bills WHERE bill_number LIKE 'BILL-SEED-%'"
    ).fetchall()
    bill_ids = [row["id"] for row in bill_rows]
    if bill_ids:
        placeholders = ",".join("?" for _ in bill_ids)
        payment_rows = db.execute(
            f"SELECT id FROM bill_payments WHERE bill_id IN ({placeholders})",
            tuple(bill_ids),
        ).fetchall()
        payment_ids = [row["id"] for row in payment_rows]
        removed += _delete_journals_for_sources(db, bill_ids + payment_ids)
        cursor = db.execute(f"DELETE FROM bill_payments WHERE bill_id IN ({placeholders})", tuple(bill_ids))
        removed += cursor.rowcount
        cursor = db.execute(f"DELETE FROM bill_lines WHERE bill_id IN ({placeholders})", tuple(bill_ids))
        removed += cursor.rowcount
        cursor = db.execute(f"DELETE FROM bills WHERE id IN ({placeholders})", tuple(bill_ids))
        removed += cursor.rowcount

    expense_rows = db.execute(
        f"""
        SELECT id FROM journal_entries
        WHERE memo IN ({','.join('?' for _ in SEED_EXPENSE_MEMOS)})
          AND date IN ('2026-03-03', '2026-03-07')
        """,
        SEED_EXPENSE_MEMOS,
    ).fetchall()
    for row in expense_rows:
        entry_id = row["id"]
        cursor = db.execute("DELETE FROM journal_lines WHERE entry_id = ?", (entry_id,))
        removed += cursor.rowcount
        cursor = db.execute("DELETE FROM journal_entries WHERE id = ?", (entry_id,))
        removed += cursor.rowcount

    batch_rows = db.execute(
        "SELECT id FROM import_batches WHERE filename = 'seed-bank-import.csv'"
    ).fetchall()
    batch_ids = [row["id"] for row in batch_rows]
    if batch_ids:
        placeholders = ",".join("?" for _ in batch_ids)
        cursor = db.execute(f"DELETE FROM import_transactions WHERE batch_id IN ({placeholders})", tuple(batch_ids))
        removed += cursor.rowcount
        cursor = db.execute(f"DELETE FROM import_batches WHERE id IN ({placeholders})", tuple(batch_ids))
        removed += cursor.rowcount

    cursor = db.execute("DELETE FROM import_rules WHERE name LIKE 'Seed:%'")
    removed += cursor.rowcount

    cursor = db.execute(
        "DELETE FROM payroll_runs WHERE period_start = '2026-03-01' AND period_end = '2026-03-15'"
    )
    removed += cursor.rowcount

    for name in SEED_EMPLOYEES:
        cursor = db.execute("DELETE FROM payroll_employees WHERE name = ?", (name,))
        removed += cursor.rowcount

    for sku in SEED_INVENTORY_SKUS:
        cursor = db.execute("DELETE FROM inventory_items WHERE sku = ?", (sku,))
        removed += cursor.rowcount

    for name in SEED_CUSTOMERS:
        cursor = db.execute("DELETE FROM customers WHERE name = ?", (name,))
        removed += cursor.rowcount

    for name in SEED_VENDORS:
        cursor = db.execute("DELETE FROM vendors WHERE name = ?", (name,))
        removed += cursor.rowcount

    return removed


def _track_invoice(db: Database, manifest: SeedManifest, invoice: dict[str, Any]) -> None:
    manifest.add("invoices", invoice["id"])
    for line in invoice["lines"]:
        manifest.add("invoice_lines", line["id"])
    _track_journals_for_source(db, manifest, invoice["id"])


def _track_bill(db: Database, manifest: SeedManifest, bill: dict[str, Any]) -> None:
    manifest.add("bills", bill["id"])
    for line in bill["lines"]:
        manifest.add("bill_lines", line["id"])


def _track_journals_for_source(db: Database, manifest: SeedManifest, source_id: str) -> None:
    rows = db.execute(
        "SELECT id FROM journal_entries WHERE source_id = ?", (source_id,)
    ).fetchall()
    for row in rows:
        _track_journal_entry(db, manifest, row["id"])


def _track_journal_entry(db: Database, manifest: SeedManifest, entry_id: str) -> None:
    manifest.add("journal_entries", entry_id)
    rows = db.execute(
        "SELECT id FROM journal_lines WHERE entry_id = ?", (entry_id,)
    ).fetchall()
    for row in rows:
        manifest.add("journal_lines", row["id"])
