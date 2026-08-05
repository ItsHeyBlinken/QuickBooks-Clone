"""Database connection and migration management."""

from __future__ import annotations

import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

MIGRATIONS_DIR = Path(__file__).parent.parent.parent.parent / "docs" / "migrations"

DEFAULT_CHART_OF_ACCOUNTS = [
    ("1000", "Cash - Operating", "asset", "bank"),
    ("1100", "Accounts Receivable", "asset", "accounts_receivable"),
    ("1200", "Inventory", "asset", "other_current_asset"),
    ("1500", "Equipment", "asset", "fixed_asset"),
    ("2000", "Accounts Payable", "liability", "accounts_payable"),
    ("2100", "Credit Card", "liability", "other_current_liability"),
    ("3000", "Owner's Equity", "equity", "equity"),
    ("3100", "Retained Earnings", "equity", "equity"),
    ("4000", "Sales Revenue", "income", "income"),
    ("4100", "Service Revenue", "income", "income"),
    ("5000", "Cost of Goods Sold", "expense", "cost_of_goods_sold"),
    ("6000", "Office Supplies", "expense", "expense"),
    ("6100", "Rent", "expense", "expense"),
    ("6200", "Utilities", "expense", "expense"),
    ("6300", "Meals & Entertainment", "expense", "expense"),
    ("6400", "Professional Services", "expense", "expense"),
    ("6500", "Payroll Expense", "expense", "expense"),
    ("6600", "Insurance", "expense", "expense"),
    ("6700", "Bank Fees", "expense", "expense"),
    ("6800", "Miscellaneous Expense", "expense", "expense"),
]


class Database:
    def __init__(self, path: str | None = None) -> None:
        self.path = path
        self._conn: sqlite3.Connection | None = None

    @property
    def is_connected(self) -> bool:
        return self._conn is not None

    @property
    def conn(self) -> sqlite3.Connection:
        if self._conn is None:
            raise RuntimeError("Database not connected")
        return self._conn

    def connect(self, path: str) -> None:
        self.path = path
        self._conn = sqlite3.connect(path)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.execute("PRAGMA journal_mode = WAL")

    def close(self) -> None:
        if self._conn:
            self._conn.close()
            self._conn = None

    def create_company(self, path: str, name: str) -> dict[str, Any]:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        self.connect(path)
        self._apply_migrations()
        company_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        self.conn.execute(
            "INSERT INTO company (id, name, fiscal_year_start_month, default_basis, created_at) VALUES (?, ?, 1, 'cash', ?)",
            (company_id, name, now),
        )
        self._seed_chart_of_accounts()
        self.conn.commit()
        return self.get_company_info()

    def open_company(self, path: str) -> dict[str, Any]:
        if not os.path.exists(path):
            raise FileNotFoundError(f"Company file not found: {path}")
        self.connect(path)
        self._apply_migrations()
        self._track_recent(path)
        return self.get_company_info()

    def _apply_migrations(self) -> None:
        current = self._get_schema_version()
        migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
        for mf in migration_files:
            version = int(mf.stem.split("_")[0])
            if version > current:
                sql = mf.read_text(encoding="utf-8")
                self.conn.executescript(sql)
                self.conn.execute(
                    "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)",
                    (str(version),),
                )
                self.conn.commit()

    def _get_schema_version(self) -> int:
        try:
            row = self.conn.execute(
                "SELECT value FROM meta WHERE key = 'schema_version'"
            ).fetchone()
            return int(row["value"]) if row else 0
        except sqlite3.OperationalError:
            return 0

    def _seed_chart_of_accounts(self) -> None:
        for code, name, acct_type, subtype in DEFAULT_CHART_OF_ACCOUNTS:
            self.conn.execute(
                "INSERT INTO accounts (id, code, name, type, subtype, parent_id, is_active) VALUES (?, ?, ?, ?, ?, NULL, 1)",
                (str(uuid.uuid4()), code, name, acct_type, subtype),
            )

    def _track_recent(self, path: str) -> None:
        info = self.get_company_info()
        now = datetime.now(timezone.utc).isoformat()
        self.conn.execute(
            "INSERT OR REPLACE INTO recent_companies (path, name, last_opened) VALUES (?, ?, ?)",
            (path, info["name"], now),
        )
        self.conn.commit()

    def get_company_info(self) -> dict[str, Any]:
        self._apply_migrations()
        row = self.conn.execute("SELECT * FROM company LIMIT 1").fetchone()
        if not row:
            raise RuntimeError("No company record found")
        keys = row.keys()
        logo_path = row["logo_path"] if "logo_path" in keys else None
        if logo_path and not os.path.exists(logo_path):
            logo_path = None
        default_tax_rate = row["default_tax_rate"] if "default_tax_rate" in keys else 0
        raw_due_days = row["default_invoice_due_days"] if "default_invoice_due_days" in keys else None
        default_invoice_due_days = (
            int(raw_due_days) if raw_due_days is not None else None
        )
        return {
            "id": row["id"],
            "name": row["name"],
            "fiscalYearStartMonth": row["fiscal_year_start_month"],
            "defaultBasis": row["default_basis"],
            "createdAt": row["created_at"],
            "logoPath": logo_path,
            "defaultTaxRate": default_tax_rate,
            "defaultInvoiceDueDays": default_invoice_due_days,
        }

    def backup(self, dest_path: str) -> dict[str, str]:
        if not self.path:
            raise RuntimeError("No company file open")
        import shutil
        self.conn.commit()
        shutil.copy2(self.path, dest_path)
        return {"path": dest_path, "status": "ok"}

    def restore(self, source_path: str) -> dict[str, Any]:
        if not os.path.exists(source_path):
            raise FileNotFoundError(f"Backup not found: {source_path}")
        self.close()
        import shutil
        if self.path and os.path.exists(self.path):
            backup = self.path + ".bak"
            shutil.copy2(self.path, backup)
        shutil.copy2(source_path, self.path)
        return self.open_company(self.path)

    def execute(self, sql: str, params: tuple = ()) -> sqlite3.Cursor:
        return self.conn.execute(sql, params)

    def executemany(self, sql: str, params: list) -> None:
        self.conn.executemany(sql, params)

    def commit(self) -> None:
        self.conn.commit()
