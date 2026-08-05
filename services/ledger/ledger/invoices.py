"""Invoice and payment operations."""

from __future__ import annotations

import uuid
from typing import Any

from . import accounts, journal
from .database import Database


def list_invoices(db: Database, customer_id: str | None = None) -> list[dict[str, Any]]:
    sql = "SELECT * FROM invoices"
    params: list[Any] = []
    if customer_id:
        sql += " WHERE customer_id = ?"
        params.append(customer_id)
    sql += " ORDER BY date DESC"
    return [get_invoice(db, row["id"]) for row in db.execute(sql, tuple(params)).fetchall()]


def get_invoice(db: Database, invoice_id: str) -> dict[str, Any] | None:
    row = db.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,)).fetchone()
    if not row:
        return None
    lines = db.execute(
        "SELECT * FROM invoice_lines WHERE invoice_id = ?", (invoice_id,)
    ).fetchall()
    return {
        "id": row["id"],
        "customerId": row["customer_id"],
        "invoiceNumber": row["invoice_number"],
        "date": row["date"],
        "dueDate": row["due_date"],
        "status": row["status"],
        "subtotal": row["subtotal"],
        "taxAmount": row["tax_amount"],
        "total": row["total"],
        "amountPaid": row["amount_paid"],
        "lines": [
            {
                "id": l["id"],
                "description": l["description"],
                "quantity": l["quantity"],
                "unitPrice": l["unit_price"],
                "amount": l["amount"],
                "accountId": l["account_id"],
            }
            for l in lines
        ],
    }


def create_invoice(
    db: Database,
    customer_id: str,
    invoice_number: str,
    date: str,
    lines: list[dict[str, Any]],
    due_date: str | None = None,
    tax_amount: float = 0,
) -> dict[str, Any]:
    invoice_id = str(uuid.uuid4())
    subtotal = sum(l.get("quantity", 1) * l.get("unitPrice", 0) for l in lines)
    total = subtotal + tax_amount

    db.execute(
        "INSERT INTO invoices (id, customer_id, invoice_number, date, due_date, status, subtotal, tax_amount, total, amount_paid) VALUES (?, ?, ?, ?, ?, 'sent', ?, ?, ?, 0)",
        (invoice_id, customer_id, invoice_number, date, due_date, subtotal, tax_amount, total),
    )
    for line in lines:
        line_id = str(uuid.uuid4())
        amount = line.get("quantity", 1) * line.get("unitPrice", 0)
        db.execute(
            "INSERT INTO invoice_lines (id, invoice_id, description, quantity, unit_price, amount, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                line_id,
                invoice_id,
                line["description"],
                line.get("quantity", 1),
                line.get("unitPrice", 0),
                amount,
                line.get("accountId"),
            ),
        )

    ar_account = accounts.find_account_by_subtype(db, "accounts_receivable")
    income_account = accounts.find_account_by_subtype(db, "income")
    if ar_account and total > 0:
        credits_by_account: dict[str, float] = {}
        for line in lines:
            acct_id = line.get("accountId") or (income_account["id"] if income_account else None)
            if not acct_id:
                continue
            amount = line.get("quantity", 1) * line.get("unitPrice", 0)
            credits_by_account[acct_id] = credits_by_account.get(acct_id, 0) + amount

        journal_lines = [{"accountId": ar_account["id"], "debit": total, "credit": 0}]
        for acct_id, credit_amount in credits_by_account.items():
            journal_lines.append({"accountId": acct_id, "debit": 0, "credit": credit_amount})

        if tax_amount > 0:
            tax_account = accounts.find_account_by_subtype(db, "other_current_liability")
            if not tax_account:
                tax_account = accounts.find_account_by_subtype(db, "accounts_payable")
            if tax_account:
                journal_lines.append(
                    {"accountId": tax_account["id"], "debit": 0, "credit": tax_amount}
                )

        journal.post_entry(
            db,
            date=date,
            lines=journal_lines,
            memo=f"Invoice {invoice_number}",
            source_type="invoice",
            source_id=invoice_id,
        )

    db.commit()
    return get_invoice(db, invoice_id)


def record_payment(
    db: Database,
    invoice_id: str,
    date: str,
    amount: float,
    deposit_account_id: str,
    reference: str | None = None,
) -> dict[str, Any]:
    invoice = get_invoice(db, invoice_id)
    if not invoice:
        raise ValueError(f"Invoice not found: {invoice_id}")

    payment_id = str(uuid.uuid4())
    db.execute(
        "INSERT INTO invoice_payments (id, invoice_id, date, amount, deposit_account_id, reference) VALUES (?, ?, ?, ?, ?, ?)",
        (payment_id, invoice_id, date, amount, deposit_account_id, reference),
    )

    new_paid = invoice["amountPaid"] + amount
    new_status = "paid" if new_paid >= invoice["total"] else invoice["status"]
    db.execute(
        "UPDATE invoices SET amount_paid = ?, status = ? WHERE id = ?",
        (new_paid, new_status, invoice_id),
    )

    ar_account = accounts.find_account_by_subtype(db, "accounts_receivable")
    if ar_account:
        journal.post_entry(
            db,
            date=date,
            lines=[
                {"accountId": deposit_account_id, "debit": amount, "credit": 0},
                {"accountId": ar_account["id"], "debit": 0, "credit": amount},
            ],
            memo=f"Payment for invoice {invoice['invoiceNumber']}",
            source_type="invoice_payment",
            source_id=payment_id,
        )

    db.commit()
    return {"id": payment_id, "invoiceId": invoice_id, "amount": amount, "date": date}


def batch_create_invoices(
    db: Database,
    invoices: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    results = []
    for inv in invoices:
        result = create_invoice(
            db,
            customer_id=inv["customerId"],
            invoice_number=inv["invoiceNumber"],
            date=inv["date"],
            lines=inv["lines"],
            due_date=inv.get("dueDate"),
            tax_amount=inv.get("taxAmount", 0),
        )
        results.append(result)
    return results
