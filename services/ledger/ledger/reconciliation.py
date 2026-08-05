"""Bank reconciliation workflow."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from .database import Database


def start_session(
    db: Database,
    account_id: str,
    statement_date: str,
    statement_balance: float,
) -> dict[str, Any]:
    session_id = str(uuid.uuid4())
    db.execute(
        "INSERT INTO reconciliation_sessions (id, account_id, statement_date, statement_balance, status) VALUES (?, ?, ?, ?, 'in_progress')",
        (session_id, account_id, statement_date, statement_balance),
    )

    lines = db.execute(
        """
        SELECT jl.id, je.date, je.memo, jl.debit, jl.credit
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.entry_id
        WHERE jl.account_id = ? AND je.date <= ? AND je.is_void = 0
        ORDER BY je.date
        """,
        (account_id, statement_date),
    ).fetchall()

    for line in lines:
        item_id = str(uuid.uuid4())
        db.execute(
            "INSERT INTO reconciliation_items (id, session_id, journal_line_id, is_cleared) VALUES (?, ?, ?, 0)",
            (item_id, session_id, line["id"]),
        )

    db.commit()
    return get_session(db, session_id)


def get_session(db: Database, session_id: str) -> dict[str, Any] | None:
    row = db.execute(
        "SELECT * FROM reconciliation_sessions WHERE id = ?", (session_id,)
    ).fetchone()
    if not row:
        return None

    items = db.execute(
        """
        SELECT ri.id, ri.journal_line_id, ri.is_cleared, je.date, je.memo, jl.debit, jl.credit
        FROM reconciliation_items ri
        JOIN journal_lines jl ON jl.id = ri.journal_line_id
        JOIN journal_entries je ON je.id = jl.entry_id
        WHERE ri.session_id = ?
        ORDER BY je.date
        """,
        (session_id,),
    ).fetchall()

    cleared_balance = sum(
        (i["debit"] - i["credit"]) for i in items if i["is_cleared"]
    )

    return {
        "id": row["id"],
        "accountId": row["account_id"],
        "statementDate": row["statement_date"],
        "statementBalance": row["statement_balance"],
        "status": row["status"],
        "clearedBalance": round(cleared_balance, 2),
        "difference": round(row["statement_balance"] - cleared_balance, 2),
        "items": [
            {
                "id": i["id"],
                "journalLineId": i["journal_line_id"],
                "isCleared": bool(i["is_cleared"]),
                "date": i["date"],
                "memo": i["memo"],
                "debit": i["debit"],
                "credit": i["credit"],
            }
            for i in items
        ],
    }


def toggle_cleared(db: Database, item_id: str, is_cleared: bool) -> dict[str, Any]:
    db.execute(
        "UPDATE reconciliation_items SET is_cleared = ? WHERE id = ?",
        (1 if is_cleared else 0, item_id),
    )
    db.commit()
    row = db.execute(
        "SELECT session_id FROM reconciliation_items WHERE id = ?", (item_id,)
    ).fetchone()
    return get_session(db, row["session_id"])


def complete_session(db: Database, session_id: str) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        "UPDATE reconciliation_sessions SET status = 'completed', completed_at = ? WHERE id = ?",
        (now, session_id),
    )
    db.commit()
    return get_session(db, session_id)
