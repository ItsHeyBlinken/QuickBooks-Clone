"""Company settings — tax rate and other business defaults."""

from __future__ import annotations

from typing import Any

from .database import Database

_UNSET = object()


def update_company_settings(
    db: Database,
    default_tax_rate: float | None = None,
    default_invoice_due_days: int | None | object = _UNSET,
) -> dict[str, Any]:
    if not db.is_connected:
        raise RuntimeError("No company file open")

    db._apply_migrations()
    updated = False

    if default_tax_rate is not None:
        if default_tax_rate < 0:
            raise ValueError("Tax rate cannot be negative")
        db.execute("UPDATE company SET default_tax_rate = ?", (default_tax_rate,))
        updated = True

    if default_invoice_due_days is not _UNSET:
        if default_invoice_due_days is not None and default_invoice_due_days < 0:
            raise ValueError("Due days cannot be negative")
        db.execute(
            "UPDATE company SET default_invoice_due_days = ?",
            (default_invoice_due_days,),
        )
        updated = True

    if updated:
        db.commit()

    return db.get_company_info()
