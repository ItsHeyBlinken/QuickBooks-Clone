"""Chart of accounts operations."""

from __future__ import annotations

import sqlite3
import uuid
from typing import Any

from .database import Database


def list_accounts(db: Database, active_only: bool = True) -> list[dict[str, Any]]:
    sql = "SELECT * FROM accounts"
    if active_only:
        sql += " WHERE is_active = 1"
    sql += " ORDER BY code"
    rows = db.execute(sql).fetchall()
    return [_row_to_account(db, row) for row in rows]


def get_account(db: Database, account_id: str) -> dict[str, Any] | None:
    row = db.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
    return _row_to_account(db, row) if row else None


def create_account(
    db: Database,
    code: str,
    name: str,
    acct_type: str,
    subtype: str,
    parent_id: str | None = None,
) -> dict[str, Any]:
    account_id = str(uuid.uuid4())
    try:
        db.execute(
            "INSERT INTO accounts (id, code, name, type, subtype, parent_id, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)",
            (account_id, code, name, acct_type, subtype, parent_id),
        )
    except sqlite3.IntegrityError as exc:
        if "code" in str(exc).lower() or "unique" in str(exc).lower():
            raise ValueError(f"Account code {code} already exists") from exc
        raise
    db.commit()
    return get_account(db, account_id)


def update_account(
    db: Database,
    account_id: str,
    name: str | None = None,
    is_active: bool | None = None,
) -> dict[str, Any]:
    if name is not None:
        db.execute("UPDATE accounts SET name = ? WHERE id = ?", (name, account_id))
    if is_active is not None:
        db.execute(
            "UPDATE accounts SET is_active = ? WHERE id = ?",
            (1 if is_active else 0, account_id),
        )
    db.commit()
    return get_account(db, account_id)


def _row_to_account(db: Database, row) -> dict[str, Any]:
    balance = _get_account_balance(db, row["id"])
    return {
        "id": row["id"],
        "code": row["code"],
        "name": row["name"],
        "type": row["type"],
        "subtype": row["subtype"],
        "parentId": row["parent_id"],
        "isActive": bool(row["is_active"]),
        "balance": balance,
    }


def _get_account_balance(db: Database, account_id: str) -> float:
    row = db.execute(
        """
        SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0) AS balance
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.entry_id
        WHERE jl.account_id = ? AND je.is_void = 0
        """,
        (account_id,),
    ).fetchone()
    return round(row["balance"], 2) if row else 0.0


def find_account_by_subtype(db: Database, subtype: str) -> dict[str, Any] | None:
    row = db.execute(
        "SELECT * FROM accounts WHERE subtype = ? AND is_active = 1 LIMIT 1",
        (subtype,),
    ).fetchone()
    return _row_to_account(db, row) if row else None
