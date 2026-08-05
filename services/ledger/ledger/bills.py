"""Bill and bill payment operations (Phase 2 AP)."""

from __future__ import annotations

import uuid
from typing import Any

from . import accounts, journal
from .database import Database


def list_bills(db: Database, vendor_id: str | None = None) -> list[dict[str, Any]]:
    sql = "SELECT * FROM bills"
    params: list[Any] = []
    if vendor_id:
        sql += " WHERE vendor_id = ?"
        params.append(vendor_id)
    sql += " ORDER BY date DESC"
    return [get_bill(db, row["id"]) for row in db.execute(sql, tuple(params)).fetchall()]


def get_bill(db: Database, bill_id: str) -> dict[str, Any] | None:
    row = db.execute("SELECT * FROM bills WHERE id = ?", (bill_id,)).fetchone()
    if not row:
        return None
    lines = db.execute(
        "SELECT * FROM bill_lines WHERE bill_id = ?", (bill_id,)
    ).fetchall()
    return {
        "id": row["id"],
        "vendorId": row["vendor_id"],
        "billNumber": row["bill_number"],
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


def create_bill(
    db: Database,
    vendor_id: str,
    bill_number: str,
    date: str,
    lines: list[dict[str, Any]],
    due_date: str | None = None,
    tax_amount: float = 0,
) -> dict[str, Any]:
    bill_id = str(uuid.uuid4())
    subtotal = sum(l.get("quantity", 1) * l.get("unitPrice", 0) for l in lines)
    total = subtotal + tax_amount

    db.execute(
        "INSERT INTO bills (id, vendor_id, bill_number, date, due_date, status, subtotal, tax_amount, total, amount_paid) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, 0)",
        (bill_id, vendor_id, bill_number, date, due_date, subtotal, tax_amount, total),
    )
    for line in lines:
        line_id = str(uuid.uuid4())
        amount = line.get("quantity", 1) * line.get("unitPrice", 0)
        account_id = line.get("accountId")
        if not account_id:
            expense_account = accounts.find_account_by_subtype(db, "expense")
            account_id = expense_account["id"] if expense_account else None
        db.execute(
            "INSERT INTO bill_lines (id, bill_id, description, quantity, unit_price, amount, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                line_id,
                bill_id,
                line["description"],
                line.get("quantity", 1),
                line.get("unitPrice", 0),
                amount,
                account_id,
            ),
        )

    ap_account = accounts.find_account_by_subtype(db, "accounts_payable")
    if ap_account and total > 0:
        debits_by_account: dict[str, float] = {}
        for line in lines:
            account_id = line.get("accountId")
            if not account_id:
                expense_account = accounts.find_account_by_subtype(db, "expense")
                account_id = expense_account["id"] if expense_account else None
            if not account_id:
                continue
            amount = line.get("quantity", 1) * line.get("unitPrice", 0)
            debits_by_account[account_id] = debits_by_account.get(account_id, 0) + amount

        journal_lines = [{"accountId": ap_account["id"], "debit": 0, "credit": total}]
        for account_id, debit_amount in debits_by_account.items():
            journal_lines.append({"accountId": account_id, "debit": debit_amount, "credit": 0})

        journal.post_entry(
            db,
            date=date,
            lines=journal_lines,
            memo=f"Bill {bill_number}",
            source_type="bill",
            source_id=bill_id,
        )

    db.commit()
    return get_bill(db, bill_id)


def record_bill_payment(
    db: Database,
    bill_id: str,
    date: str,
    amount: float,
    payment_account_id: str,
    reference: str | None = None,
) -> dict[str, Any]:
    bill = get_bill(db, bill_id)
    if not bill:
        raise ValueError(f"Bill not found: {bill_id}")

    payment_id = str(uuid.uuid4())
    db.execute(
        "INSERT INTO bill_payments (id, bill_id, date, amount, payment_account_id, reference) VALUES (?, ?, ?, ?, ?, ?)",
        (payment_id, bill_id, date, amount, payment_account_id, reference),
    )

    new_paid = bill["amountPaid"] + amount
    new_status = "paid" if new_paid >= bill["total"] else bill["status"]
    db.execute(
        "UPDATE bills SET amount_paid = ?, status = ? WHERE id = ?",
        (new_paid, new_status, bill_id),
    )

    ap_account = accounts.find_account_by_subtype(db, "accounts_payable")
    if ap_account:
        journal.post_entry(
            db,
            date=date,
            lines=[
                {"accountId": ap_account["id"], "debit": amount, "credit": 0},
                {"accountId": payment_account_id, "debit": 0, "credit": amount},
            ],
            memo=f"Payment for bill {bill['billNumber']}",
            source_type="bill_payment",
            source_id=payment_id,
        )

    db.commit()
    return {"id": payment_id, "billId": bill_id, "amount": amount, "date": date}


def record_expense(
    db: Database,
    date: str,
    amount: float,
    expense_account_id: str,
    payment_account_id: str,
    memo: str | None = None,
    vendor_id: str | None = None,
) -> dict[str, Any]:
    entry = journal.post_entry(
        db,
        date=date,
        lines=[
            {"accountId": expense_account_id, "debit": amount, "credit": 0},
            {"accountId": payment_account_id, "debit": 0, "credit": amount},
        ],
        memo=memo or "Expense",
        source_type="expense",
        source_id=vendor_id,
    )
    return entry
