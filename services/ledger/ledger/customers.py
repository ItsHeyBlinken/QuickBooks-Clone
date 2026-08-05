"""Customer management."""

from __future__ import annotations

import uuid
from typing import Any

from .database import Database


def list_customers(db: Database, active_only: bool = True) -> list[dict[str, Any]]:
    sql = "SELECT * FROM customers"
    if active_only:
        sql += " WHERE is_active = 1"
    sql += " ORDER BY name"
    return [_row_to_customer(row) for row in db.execute(sql).fetchall()]


def get_customer(db: Database, customer_id: str) -> dict[str, Any] | None:
    row = db.execute("SELECT * FROM customers WHERE id = ?", (customer_id,)).fetchone()
    return _row_to_customer(row) if row else None


def create_customer(
    db: Database,
    name: str,
    email: str | None = None,
    phone: str | None = None,
    address: str | None = None,
) -> dict[str, Any]:
    cid = str(uuid.uuid4())
    db.execute(
        "INSERT INTO customers (id, name, email, phone, address, is_active) VALUES (?, ?, ?, ?, ?, 1)",
        (cid, name, email, phone, address),
    )
    db.commit()
    return get_customer(db, cid)


def update_customer(db: Database, customer_id: str, **kwargs) -> dict[str, Any]:
    fields = {"name": "name", "email": "email", "phone": "phone", "address": "address"}
    for key, col in fields.items():
        if key in kwargs and kwargs[key] is not None:
            db.execute(f"UPDATE customers SET {col} = ? WHERE id = ?", (kwargs[key], customer_id))
    if "isActive" in kwargs:
        db.execute(
            "UPDATE customers SET is_active = ? WHERE id = ?",
            (1 if kwargs["isActive"] else 0, customer_id),
        )
    db.commit()
    return get_customer(db, customer_id)


def _row_to_customer(row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "phone": row["phone"],
        "address": row["address"],
        "isActive": bool(row["is_active"]),
    }
