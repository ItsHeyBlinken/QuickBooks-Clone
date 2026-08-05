"""Tests for the ledger service."""

import os
import tempfile
import pytest

from ledger.database import Database
from ledger import accounts, journal, customers, invoices, reports, import_engine


@pytest.fixture
def db():
    with tempfile.NamedTemporaryFile(suffix=".ledger", delete=False) as f:
        path = f.name
    database = Database()
    database.create_company(path, "Test Company")
    yield database
    database.close()
    os.unlink(path)


def test_health():
    from ledger import __version__
    assert __version__ == "0.1.0"


def test_create_company(db):
    info = db.get_company_info()
    assert info["name"] == "Test Company"
    assert info["defaultBasis"] == "cash"


def test_chart_of_accounts(db):
    accts = accounts.list_accounts(db)
    assert len(accts) >= 15
    codes = [a["code"] for a in accts]
    assert "1000" in codes
    assert "4000" in codes


def test_journal_entry_balances(db):
    accts = accounts.list_accounts(db)
    cash = next(a for a in accts if a["code"] == "1000")
    income = next(a for a in accts if a["code"] == "4000")

    entry = journal.post_entry(
        db,
        date="2026-01-15",
        lines=[
            {"accountId": cash["id"], "debit": 500, "credit": 0},
            {"accountId": income["id"], "debit": 0, "credit": 500},
        ],
        memo="Test sale",
    )
    assert entry["id"]
    assert len(entry["lines"]) == 2


def test_journal_must_balance(db):
    accts = accounts.list_accounts(db)
    cash = next(a for a in accts if a["code"] == "1000")
    with pytest.raises(journal.JournalError):
        journal.post_entry(
            db,
            date="2026-01-15",
            lines=[
                {"accountId": cash["id"], "debit": 500, "credit": 0},
                {"accountId": cash["id"], "debit": 0, "credit": 400},
            ],
        )


def test_invoice_and_payment(db):
    customer = customers.create_customer(db, "Acme Corp", "acme@test.com")
    income = accounts.find_account_by_subtype(db, "income")
    bank = accounts.find_account_by_subtype(db, "bank")

    inv = invoices.create_invoice(
        db,
        customer_id=customer["id"],
        invoice_number="INV-001",
        date="2026-01-10",
        lines=[{"description": "Consulting", "quantity": 1, "unitPrice": 1000, "accountId": income["id"]}],
    )
    assert inv["total"] == 1000
    assert inv["status"] == "sent"

    payment = invoices.record_payment(
        db, inv["id"], "2026-01-20", 1000, bank["id"]
    )
    assert payment["amount"] == 1000

    updated = invoices.get_invoice(db, inv["id"])
    assert updated["status"] == "paid"


def test_profit_and_loss(db):
    customer = customers.create_customer(db, "Client")
    income = accounts.find_account_by_subtype(db, "income")
    bank = accounts.find_account_by_subtype(db, "bank")

    inv = invoices.create_invoice(
        db, customer["id"], "INV-002", "2026-02-01",
        [{"description": "Service", "quantity": 1, "unitPrice": 500, "accountId": income["id"]}],
    )
    invoices.record_payment(db, inv["id"], "2026-02-15", 500, bank["id"])

    pnl = reports.profit_and_loss(db, "2026-01-01", "2026-12-31", "cash")
    assert pnl["netIncome"] > 0


def test_csv_import(db):
    csv_content = "Date,Description,Amount\n2026-03-01,STARBUCKS COFFEE,-5.50\n2026-03-02,CLIENT PAYMENT,1000.00"
    result = import_engine.import_csv(db, csv_content, "test.csv")
    assert result["count"] == 2
    assert len(result["transactions"]) == 2


def test_import_rule(db):
    expense = accounts.find_account_by_subtype(db, "expense")
    rule = import_engine.create_rule(
        db,
        name="Starbucks",
        criteria={"descriptionContains": "STARBUCKS"},
        action={"categoryId": expense["id"], "vendorName": "Starbucks"},
    )
    assert rule["id"]

    csv_content = "Date,Description,Amount\n2026-03-01,STARBUCKS #1234,-4.75"
    result = import_engine.import_csv(db, csv_content)
    assert result["transactions"][0]["confidence"] == "rule"


def test_company_settings_defaults(db):
    from ledger import company_settings

    info = company_settings.update_company_settings(db, default_tax_rate=8.25, default_invoice_due_days=30)
    assert info["defaultTaxRate"] == 8.25
    assert info["defaultInvoiceDueDays"] == 30

    info = company_settings.update_company_settings(db, default_invoice_due_days=None)
    assert info["defaultInvoiceDueDays"] is None

    info = company_settings.update_company_settings(db, default_invoice_due_days=0)
    assert info["defaultInvoiceDueDays"] == 0


def test_company_settings_applies_pending_migrations(db):
    from ledger import company_settings

    db.conn.execute("DELETE FROM meta WHERE key = 'schema_version'")
    db.conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '5')"
    )
    db.conn.commit()
    db.conn.execute("ALTER TABLE company DROP COLUMN default_invoice_due_days")
    db.conn.commit()

    info = company_settings.update_company_settings(db, default_invoice_due_days=15)
    assert info["defaultInvoiceDueDays"] == 15
