"""Vendor management."""

from __future__ import annotations

import uuid
from typing import Any

from .database import Database


def list_vendors(db: Database, active_only: bool = True) -> list[dict[str, Any]]:
    sql = "SELECT * FROM vendors"
    if active_only:
        sql += " WHERE is_active = 1"
    sql += " ORDER BY name"
    return [_row_to_vendor(row) for row in db.execute(sql).fetchall()]


def get_vendor(db: Database, vendor_id: str) -> dict[str, Any] | None:
    row = db.execute("SELECT * FROM vendors WHERE id = ?", (vendor_id,)).fetchone()
    return _row_to_vendor(row) if row else None


def create_vendor(
    db: Database,
    name: str,
    email: str | None = None,
    phone: str | None = None,
    address: str | None = None,
) -> dict[str, Any]:
    vid = str(uuid.uuid4())
    db.execute(
        "INSERT INTO vendors (id, name, email, phone, address, is_active) VALUES (?, ?, ?, ?, ?, 1)",
        (vid, name, email, phone, address),
    )
    db.commit()
    return get_vendor(db, vid)


def update_vendor(db: Database, vendor_id: str, **kwargs) -> dict[str, Any]:
    fields = {"name": "name", "email": "email", "phone": "phone", "address": "address"}
    for key, col in fields.items():
        if key in kwargs and kwargs[key] is not None:
            db.execute(f"UPDATE vendors SET {col} = ? WHERE id = ?", (kwargs[key], vendor_id))
    if "isActive" in kwargs:
        db.execute(
            "UPDATE vendors SET is_active = ? WHERE id = ?",
            (1 if kwargs["isActive"] else 0, vendor_id),
        )
    db.commit()
    return get_vendor(db, vendor_id)


def _row_to_vendor(row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "phone": row["phone"],
        "address": row["address"],
        "isActive": bool(row["is_active"]),
    }
