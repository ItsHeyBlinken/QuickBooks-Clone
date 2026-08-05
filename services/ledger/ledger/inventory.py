"""Basic inventory management (Phase 3)."""

from __future__ import annotations

import uuid
from typing import Any

from . import accounts, journal
from .database import Database


def list_items(db: Database) -> list[dict[str, Any]]:
    rows = db.execute("SELECT * FROM inventory_items ORDER BY name").fetchall()
    return [_row_to_item(row) for row in rows]


def create_item(
    db: Database,
    name: str,
    sku: str | None = None,
    cost_per_unit: float = 0,
    quantity_on_hand: float = 0,
    sale_price: float | None = None,
) -> dict[str, Any]:
    item_id = str(uuid.uuid4())
    income = accounts.find_account_by_subtype(db, "income")
    asset = accounts.find_account_by_subtype(db, "other_current_asset")
    cogs = accounts.find_account_by_subtype(db, "cost_of_goods_sold")
    resolved_sale_price = sale_price if sale_price is not None else cost_per_unit

    db.execute(
        "INSERT INTO inventory_items (id, name, sku, quantity_on_hand, cost_per_unit, sale_price, income_account_id, asset_account_id, cogs_account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            item_id, name, sku, quantity_on_hand, cost_per_unit, resolved_sale_price,
            income["id"] if income else None,
            asset["id"] if asset else None,
            cogs["id"] if cogs else None,
        ),
    )
    db.commit()
    return get_item(db, item_id)


def get_item(db: Database, item_id: str) -> dict[str, Any] | None:
    row = db.execute("SELECT * FROM inventory_items WHERE id = ?", (item_id,)).fetchone()
    return _row_to_item(row) if row else None


def adjust_quantity(
    db: Database,
    item_id: str,
    quantity_change: float,
    date: str,
    memo: str | None = None,
) -> dict[str, Any]:
    item = get_item(db, item_id)
    if not item:
        raise ValueError(f"Item not found: {item_id}")

    new_qty = item["quantityOnHand"] + quantity_change
    db.execute(
        "UPDATE inventory_items SET quantity_on_hand = ? WHERE id = ?",
        (new_qty, item_id),
    )

    if quantity_change > 0 and item["assetAccountId"]:
        cost = quantity_change * item["costPerUnit"]
        journal.post_entry(
            db,
            date=date,
            lines=[
                {"accountId": item["assetAccountId"], "debit": cost, "credit": 0},
                {"accountId": item["assetAccountId"], "debit": 0, "credit": 0},
            ],
            memo=memo or f"Inventory adjustment: {item['name']}",
            source_type="inventory",
            source_id=item_id,
        )

    db.commit()
    return get_item(db, item_id)


def record_sale(
    db: Database,
    item_id: str,
    quantity: float,
    sale_price: float,
    date: str,
    deposit_account_id: str,
) -> dict[str, Any]:
    item = get_item(db, item_id)
    if not item:
        raise ValueError(f"Item not found: {item_id}")

    revenue = quantity * sale_price
    cogs_amount = quantity * item["costPerUnit"]

    lines = [
        {"accountId": deposit_account_id, "debit": revenue, "credit": 0},
        {"accountId": item["incomeAccountId"], "debit": 0, "credit": revenue},
    ]
    if item["cogsAccountId"] and item["assetAccountId"] and cogs_amount > 0:
        lines.extend([
            {"accountId": item["cogsAccountId"], "debit": cogs_amount, "credit": 0},
            {"accountId": item["assetAccountId"], "debit": 0, "credit": cogs_amount},
        ])

    entry = journal.post_entry(
        db,
        date=date,
        lines=lines,
        memo=f"Sale: {item['name']} x {quantity}",
        source_type="inventory_sale",
        source_id=item_id,
    )

    new_qty = item["quantityOnHand"] - quantity
    db.execute(
        "UPDATE inventory_items SET quantity_on_hand = ? WHERE id = ?",
        (new_qty, item_id),
    )
    db.commit()
    return {"entry": entry, "item": get_item(db, item_id)}


def _row_to_item(row) -> dict[str, Any]:
    keys = row.keys()
    sale_price = row["sale_price"] if "sale_price" in keys else row["cost_per_unit"]
    return {
        "id": row["id"],
        "name": row["name"],
        "sku": row["sku"],
        "quantityOnHand": row["quantity_on_hand"],
        "costPerUnit": row["cost_per_unit"],
        "salePrice": sale_price,
        "incomeAccountId": row["income_account_id"],
        "assetAccountId": row["asset_account_id"],
        "cogsAccountId": row["cogs_account_id"],
    }
