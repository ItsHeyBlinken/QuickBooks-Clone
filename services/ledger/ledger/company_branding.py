"""Company branding — logo upload and management."""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Any

from .database import Database

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}


def _logo_dest_path(ledger_path: str, source_path: str) -> Path:
    ext = Path(source_path).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError("Logo must be PNG, JPG, GIF, or WebP")
    return Path(ledger_path).with_suffix(f".logo{ext}")


def _remove_logo_file(path: str | None) -> None:
    if path and os.path.exists(path):
        os.unlink(path)


def set_company_logo(db: Database, source_path: str) -> dict[str, Any]:
    if not db.path:
        raise RuntimeError("No company file open")
    if not os.path.exists(source_path):
        raise FileNotFoundError(f"Logo file not found: {source_path}")

    dest = _logo_dest_path(db.path, source_path)
    info = db.get_company_info()
    old_path = info.get("logoPath")

    if old_path and Path(old_path) != dest:
        _remove_logo_file(old_path)

    shutil.copy2(source_path, dest)
    db.execute("UPDATE company SET logo_path = ?", (str(dest),))
    db.commit()
    return db.get_company_info()


def remove_company_logo(db: Database) -> dict[str, Any]:
    if not db.path:
        raise RuntimeError("No company file open")

    info = db.get_company_info()
    _remove_logo_file(info.get("logoPath"))
    db.execute("UPDATE company SET logo_path = NULL")
    db.commit()
    return db.get_company_info()
