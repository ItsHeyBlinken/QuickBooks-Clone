"""Financial report generation — cash and accrual basis."""

from __future__ import annotations

from typing import Any

from .database import Database


def profit_and_loss(
    db: Database,
    start_date: str,
    end_date: str,
    basis: str = "cash",
) -> dict[str, Any]:
    income_accounts = _get_accounts_by_type(db, "income")
    expense_accounts = _get_accounts_by_type(db, "expense")

    income_lines = []
    total_income = 0.0
    for acct in income_accounts:
        amount = _get_period_balance(db, acct["id"], start_date, end_date, basis, "income")
        if amount != 0:
            income_lines.append({
                "accountId": acct["id"],
                "accountCode": acct["code"],
                "accountName": acct["name"],
                "amount": amount,
            })
            total_income += amount

    expense_lines = []
    total_expenses = 0.0
    for acct in expense_accounts:
        amount = _get_period_balance(db, acct["id"], start_date, end_date, basis, "expense")
        if amount != 0:
            expense_lines.append({
                "accountId": acct["id"],
                "accountCode": acct["code"],
                "accountName": acct["name"],
                "amount": amount,
            })
            total_expenses += amount

    return {
        "basis": basis,
        "startDate": start_date,
        "endDate": end_date,
        "income": income_lines,
        "expenses": expense_lines,
        "netIncome": round(total_income - total_expenses, 2),
    }


def balance_sheet(
    db: Database,
    as_of_date: str,
    basis: str = "cash",
) -> dict[str, Any]:
    assets = _report_section(db, "asset", as_of_date, basis)
    liabilities = _report_section(db, "liability", as_of_date, basis)
    equity = _report_section(db, "equity", as_of_date, basis)

    total_assets = sum(a["amount"] for a in assets)
    total_liabilities = sum(l["amount"] for l in liabilities)
    total_equity = sum(e["amount"] for e in equity)

    return {
        "basis": basis,
        "asOfDate": as_of_date,
        "assets": assets,
        "liabilities": liabilities,
        "equity": equity,
        "totalAssets": round(total_assets, 2),
        "totalLiabilities": round(total_liabilities, 2),
        "totalEquity": round(total_equity, 2),
    }


def trial_balance(
    db: Database,
    as_of_date: str,
    basis: str = "cash",
) -> dict[str, Any]:
    accounts = _get_all_accounts(db)
    lines = []
    for acct in accounts:
        balance = _get_balance_as_of(db, acct["id"], as_of_date, basis)
        if balance != 0:
            if balance > 0:
                lines.append({
                    "accountId": acct["id"],
                    "accountCode": acct["code"],
                    "accountName": acct["name"],
                    "debit": balance,
                    "credit": 0,
                })
            else:
                lines.append({
                    "accountId": acct["id"],
                    "accountCode": acct["code"],
                    "accountName": acct["name"],
                    "debit": 0,
                    "credit": abs(balance),
                })
    return {"basis": basis, "asOfDate": as_of_date, "lines": lines}


def cash_flow(
    db: Database,
    start_date: str,
    end_date: str,
) -> dict[str, Any]:
    bank_accounts = db.execute(
        "SELECT * FROM accounts WHERE subtype = 'bank' AND is_active = 1"
    ).fetchall()

    operating = 0.0
    for acct in bank_accounts:
        opening = _get_balance_as_of(db, acct["id"], start_date, "cash")
        closing = _get_balance_as_of(db, acct["id"], end_date, "cash")
        operating += closing - opening

    return {
        "startDate": start_date,
        "endDate": end_date,
        "operating": round(operating, 2),
        "investing": 0.0,
        "financing": 0.0,
        "netChange": round(operating, 2),
    }


def aging_report(
    db: Database,
    report_type: str,
    as_of_date: str,
) -> dict[str, Any]:
    if report_type == "ar":
        rows = db.execute(
            """
            SELECT c.name, i.invoice_number, i.date, i.due_date, i.total, i.amount_paid,
                   (i.total - i.amount_paid) AS balance
            FROM invoices i
            JOIN customers c ON c.id = i.customer_id
            WHERE i.status != 'void' AND i.status != 'paid'
            ORDER BY i.due_date
            """
        ).fetchall()
    else:
        rows = db.execute(
            """
            SELECT v.name, b.bill_number, b.date, b.due_date, b.total, b.amount_paid,
                   (b.total - b.amount_paid) AS balance
            FROM bills b
            JOIN vendors v ON v.id = b.vendor_id
            WHERE b.status != 'void' AND b.status != 'paid'
            ORDER BY b.due_date
            """
        ).fetchall()

    items = []
    for row in rows:
        items.append({
            "name": row[0],
            "documentNumber": row[1],
            "date": row[2],
            "dueDate": row[3],
            "total": row[4],
            "amountPaid": row[5],
            "balance": row[6],
        })

    return {"type": report_type, "asOfDate": as_of_date, "items": items}


def drill_down(
    db: Database,
    account_id: str,
    start_date: str,
    end_date: str,
) -> list[dict[str, Any]]:
    rows = db.execute(
        """
        SELECT je.id, je.date, je.memo, je.reference, jl.debit, jl.credit, jl.memo AS line_memo
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.entry_id
        WHERE jl.account_id = ? AND je.date >= ? AND je.date <= ? AND je.is_void = 0
        ORDER BY je.date, je.created_at
        """,
        (account_id, start_date, end_date),
    ).fetchall()
    return [
        {
            "entryId": r["id"],
            "date": r["date"],
            "memo": r["memo"] or r["line_memo"],
            "reference": r["reference"],
            "debit": r["debit"],
            "credit": r["credit"],
        }
        for r in rows
    ]


def _get_accounts_by_type(db: Database, acct_type: str) -> list[dict]:
    rows = db.execute(
        "SELECT * FROM accounts WHERE type = ? AND is_active = 1 ORDER BY code",
        (acct_type,),
    ).fetchall()
    return [{"id": r["id"], "code": r["code"], "name": r["name"]} for r in rows]


def _get_all_accounts(db: Database) -> list[dict]:
    rows = db.execute(
        "SELECT * FROM accounts WHERE is_active = 1 ORDER BY code"
    ).fetchall()
    return [{"id": r["id"], "code": r["code"], "name": r["name"], "type": r["type"]} for r in rows]


def _report_section(db: Database, acct_type: str, as_of_date: str, basis: str) -> list[dict]:
    accounts = _get_accounts_by_type(db, acct_type)
    lines = []
    for acct in accounts:
        balance = _get_balance_as_of(db, acct["id"], as_of_date, basis)
        if balance != 0:
            lines.append({
                "accountId": acct["id"],
                "accountCode": acct["code"],
                "accountName": acct["name"],
                "amount": balance,
            })
    return lines


def _get_period_balance(
    db: Database,
    account_id: str,
    start_date: str,
    end_date: str,
    basis: str,
    acct_type: str,
) -> float:
    if basis == "cash":
        balance = _get_cash_basis_period(db, account_id, start_date, end_date, acct_type)
    else:
        balance = _get_accrual_period(db, account_id, start_date, end_date)
    return round(abs(balance), 2)


def _get_balance_as_of(db: Database, account_id: str, as_of_date: str, basis: str) -> float:
    row = db.execute(
        """
        SELECT COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) AS balance
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.entry_id
        WHERE jl.account_id = ? AND je.date <= ? AND je.is_void = 0
        """,
        (account_id, as_of_date),
    ).fetchone()
    return round(row["balance"], 2) if row else 0.0


def _get_cash_basis_period(
    db: Database,
    account_id: str,
    start_date: str,
    end_date: str,
    acct_type: str,
) -> float:
    row = db.execute(
        """
        SELECT COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) AS balance
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.entry_id
        WHERE jl.account_id = ? AND je.date >= ? AND je.date <= ? AND je.is_void = 0
        """,
        (account_id, start_date, end_date),
    ).fetchone()
    balance = row["balance"] if row else 0.0
    if acct_type in ("income", "expense"):
        return abs(balance)
    return balance


def _get_accrual_period(
    db: Database,
    account_id: str,
    start_date: str,
    end_date: str,
) -> float:
    row = db.execute(
        """
        SELECT COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) AS balance
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.entry_id
        WHERE jl.account_id = ? AND je.date >= ? AND je.date <= ? AND je.is_void = 0
        AND je.source_type IN ('invoice', 'bill', 'journal', 'expense', 'invoice_payment', 'bill_payment')
        """,
        (account_id, start_date, end_date),
    ).fetchone()
    return row["balance"] if row else 0.0
