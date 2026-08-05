"""Journal entry operations — double-entry bookkeeping core."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from .database import Database


class JournalError(Exception):
    pass


def post_entry(
    db: Database,
    date: str,
    lines: list[dict[str, Any]],
    memo: str | None = None,
    reference: str | None = None,
    source_type: str | None = None,
    source_id: str | None = None,
) -> dict[str, Any]:
    total_debit = sum(l.get("debit", 0) for l in lines)
    total_credit = sum(l.get("credit", 0) for l in lines)
    if abs(total_debit - total_credit) > 0.001:
        raise JournalError(
            f"Entry does not balance: debits={total_debit}, credits={total_credit}"
        )
    if not lines:
        raise JournalError("Entry must have at least one line")

    entry_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        "INSERT INTO journal_entries (id, date, memo, reference, source_type, source_id, is_void, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)",
        (entry_id, date, memo, reference, source_type, source_id, now),
    )
    result_lines = []
    for line in lines:
        line_id = str(uuid.uuid4())
        db.execute(
            "INSERT INTO journal_lines (id, entry_id, account_id, debit, credit, memo) VALUES (?, ?, ?, ?, ?, ?)",
            (
                line_id,
                entry_id,
                line["accountId"],
                line.get("debit", 0),
                line.get("credit", 0),
                line.get("memo"),
            ),
        )
        result_lines.append(
            {
                "id": line_id,
                "accountId": line["accountId"],
                "debit": line.get("debit", 0),
                "credit": line.get("credit", 0),
                "memo": line.get("memo"),
            }
        )
    db.commit()
    return {
        "id": entry_id,
        "date": date,
        "memo": memo,
        "reference": reference,
        "sourceType": source_type,
        "sourceId": source_id,
        "isVoid": False,
        "lines": result_lines,
    }


def void_entry(db: Database, entry_id: str) -> dict[str, Any]:
    entry = get_entry(db, entry_id)
    if not entry:
        raise JournalError(f"Entry not found: {entry_id}")
    if entry["isVoid"]:
        raise JournalError("Entry already voided")

    reversing_lines = [
        {
            "accountId": l["accountId"],
            "debit": l["credit"],
            "credit": l["debit"],
            "memo": f"Void: {l.get('memo') or ''}",
        }
        for l in entry["lines"]
    ]
    db.execute("UPDATE journal_entries SET is_void = 1 WHERE id = ?", (entry_id,))
    db.commit()
    return post_entry(
        db,
        date=entry["date"],
        lines=reversing_lines,
        memo=f"Void of entry {entry_id}",
        reference=entry.get("reference"),
        source_type="void",
        source_id=entry_id,
    )


def get_entry(db: Database, entry_id: str) -> dict[str, Any] | None:
    row = db.execute(
        "SELECT * FROM journal_entries WHERE id = ?", (entry_id,)
    ).fetchone()
    if not row:
        return None
    lines = db.execute(
        "SELECT * FROM journal_lines WHERE entry_id = ?", (entry_id,)
    ).fetchall()
    return {
        "id": row["id"],
        "date": row["date"],
        "memo": row["memo"],
        "reference": row["reference"],
        "sourceType": row["source_type"],
        "sourceId": row["source_id"],
        "isVoid": bool(row["is_void"]),
        "lines": [
            {
                "id": l["id"],
                "accountId": l["account_id"],
                "debit": l["debit"],
                "credit": l["credit"],
                "memo": l["memo"],
            }
            for l in lines
        ],
    }


def list_entries(
    db: Database,
    start_date: str | None = None,
    end_date: str | None = None,
    account_id: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    sql = "SELECT DISTINCT je.* FROM journal_entries je"
    params: list[Any] = []
    conditions = ["je.is_void = 0"]

    if account_id:
        sql += " JOIN journal_lines jl ON jl.entry_id = je.id"
        conditions.append("jl.account_id = ?")
        params.append(account_id)
    if start_date:
        conditions.append("je.date >= ?")
        params.append(start_date)
    if end_date:
        conditions.append("je.date <= ?")
        params.append(end_date)

    sql += " WHERE " + " AND ".join(conditions)
    sql += " ORDER BY je.date DESC, je.created_at DESC LIMIT ?"
    params.append(limit)

    rows = db.execute(sql, tuple(params)).fetchall()
    return [get_entry(db, row["id"]) for row in rows]
