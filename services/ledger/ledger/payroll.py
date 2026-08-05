"""Simplified payroll calculator (Phase 3) — journal entries only, no tax filing."""

from __future__ import annotations

import uuid
from typing import Any

from . import accounts, journal
from .database import Database


def list_employees(db: Database) -> list[dict[str, Any]]:
    rows = db.execute(
        "SELECT * FROM payroll_employees WHERE is_active = 1 ORDER BY name"
    ).fetchall()
    return [_row_to_employee(row) for row in rows]


def create_employee(
    db: Database,
    name: str,
    pay_rate: float,
    pay_type: str = "hourly",
) -> dict[str, Any]:
    emp_id = str(uuid.uuid4())
    db.execute(
        "INSERT INTO payroll_employees (id, name, pay_rate, pay_type, is_active) VALUES (?, ?, ?, ?, 1)",
        (emp_id, name, pay_rate, pay_type),
    )
    db.commit()
    return get_employee(db, emp_id)


def get_employee(db: Database, employee_id: str) -> dict[str, Any] | None:
    row = db.execute(
        "SELECT * FROM payroll_employees WHERE id = ?", (employee_id,)
    ).fetchone()
    return _row_to_employee(row) if row else None


def calculate_payroll(
    db: Database,
    pay_date: str,
    period_start: str,
    period_end: str,
    entries: list[dict[str, Any]],
    tax_rates: dict[str, float] | None = None,
) -> dict[str, Any]:
    tax_rates = tax_rates or {
        "federal_income": 0.12,
        "social_security": 0.062,
        "medicare": 0.0145,
        "state_income": 0.05,
    }

    run_id = str(uuid.uuid4())
    total_gross = 0.0
    total_deductions = 0.0
    line_details = []

    for entry in entries:
        emp = get_employee(db, entry["employeeId"])
        if not emp:
            continue
        hours = entry.get("hours", 0)
        if emp["payType"] == "hourly":
            gross = hours * emp["payRate"]
        else:
            gross = emp["payRate"]

        deductions = {}
        for tax_name, rate in tax_rates.items():
            deductions[tax_name] = round(gross * rate, 2)
        total_ded = sum(deductions.values())
        net = gross - total_ded

        total_gross += gross
        total_deductions += total_ded
        line_details.append({
            "employeeId": emp["id"],
            "employeeName": emp["name"],
            "gross": gross,
            "deductions": deductions,
            "net": net,
        })

    total_net = total_gross - total_deductions

    db.execute(
        "INSERT INTO payroll_runs (id, pay_date, period_start, period_end, status, total_gross, total_net) VALUES (?, ?, ?, ?, 'calculated', ?, ?)",
        (run_id, pay_date, period_start, period_end, total_gross, total_net),
    )
    db.commit()

    return {
        "id": run_id,
        "payDate": pay_date,
        "periodStart": period_start,
        "periodEnd": period_end,
        "status": "calculated",
        "totalGross": round(total_gross, 2),
        "totalNet": round(total_net, 2),
        "totalDeductions": round(total_deductions, 2),
        "lines": line_details,
    }


def post_payroll(
    db: Database,
    run_id: str,
    payment_account_id: str,
) -> dict[str, Any]:
    row = db.execute(
        "SELECT * FROM payroll_runs WHERE id = ?", (run_id,)
    ).fetchone()
    if not row:
        raise ValueError(f"Payroll run not found: {run_id}")

    payroll_expense = accounts.find_account_by_subtype(db, "expense")
    if not payroll_expense:
        payroll_expense = db.execute(
            "SELECT * FROM accounts WHERE code = '6500'"
        ).fetchone()
        payroll_id = payroll_expense["id"] if payroll_expense else None
    else:
        payroll_id = payroll_expense["id"]

    entry = journal.post_entry(
        db,
        date=row["pay_date"],
        lines=[
            {"accountId": payroll_id, "debit": row["total_gross"], "credit": 0},
            {"accountId": payment_account_id, "debit": 0, "credit": row["total_net"]},
        ],
        memo=f"Payroll {row['period_start']} to {row['period_end']}",
        source_type="payroll",
        source_id=run_id,
    )

    db.execute(
        "UPDATE payroll_runs SET status = 'posted', journal_entry_id = ? WHERE id = ?",
        (entry["id"], run_id),
    )
    db.commit()
    return {"runId": run_id, "entry": entry}


def _row_to_employee(row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "payRate": row["pay_rate"],
        "payType": row["pay_type"],
        "isActive": bool(row["is_active"]),
    }
