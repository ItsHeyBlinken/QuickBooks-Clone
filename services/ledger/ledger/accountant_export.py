"""Encrypted accountant export package (Phase 3)."""

from __future__ import annotations

import base64
import json
import os
import shutil
import sqlite3
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .database import Database


def create_export(
    db: Database,
    dest_path: str,
    password: str,
    include_period_start: str | None = None,
    include_period_end: str | None = None,
) -> dict[str, Any]:
    if not db.path:
        raise RuntimeError("No company file open")

    export_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    with tempfile.NamedTemporaryFile(suffix=".ledger", delete=False) as tmp:
        tmp_path = tmp.name

    shutil.copy2(db.path, tmp_path)

    export_conn = sqlite3.connect(tmp_path)
    export_conn.execute(
        "CREATE TABLE IF NOT EXISTS export_meta (id TEXT, created_at TEXT, is_readonly INTEGER DEFAULT 1)"
    )
    export_conn.execute(
        "INSERT INTO export_meta (id, created_at, is_readonly) VALUES (?, ?, 1)",
        (export_id, now),
    )
    export_conn.commit()
    export_conn.close()

    encrypted = _encrypt_file(tmp_path, password)
    Path(dest_path).write_bytes(encrypted)
    os.unlink(tmp_path)

    return {
        "exportId": export_id,
        "path": dest_path,
        "createdAt": now,
        "status": "ok",
    }


def open_export(export_path: str, password: str) -> dict[str, Any]:
    if not os.path.exists(export_path):
        raise FileNotFoundError(f"Export not found: {export_path}")

    data = Path(export_path).read_bytes()
    decrypted_path = _decrypt_to_temp(data, password)

    conn = sqlite3.connect(decrypted_path)
    conn.row_factory = sqlite3.Row
    company = conn.execute("SELECT * FROM company LIMIT 1").fetchone()
    meta = conn.execute("SELECT * FROM export_meta LIMIT 1").fetchone()
    conn.close()

    return {
        "path": decrypted_path,
        "companyName": company["name"] if company else "Unknown",
        "exportId": meta["id"] if meta else None,
        "isReadOnly": True,
    }


def _encrypt_file(file_path: str, password: str) -> bytes:
    try:
        from cryptography.fernet import Fernet
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

        salt = os.urandom(16)
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100_000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(password.encode()))
        fernet = Fernet(key)

        data = Path(file_path).read_bytes()
        encrypted = fernet.encrypt(data)
        return salt + encrypted
    except ImportError:
        data = Path(file_path).read_bytes()
        encoded = base64.b64encode(data)
        header = f"LLX1:{password[:4]}:".encode()
        return header + encoded


def _decrypt_to_temp(data: bytes, password: str) -> str:
    try:
        from cryptography.fernet import Fernet
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

        salt = data[:16]
        encrypted = data[16:]
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100_000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(password.encode()))
        fernet = Fernet(key)
        decrypted = fernet.decrypt(encrypted)

        tmp = tempfile.NamedTemporaryFile(suffix=".ledger", delete=False)
        tmp.write(decrypted)
        tmp.close()
        return tmp.name
    except ImportError:
        if data.startswith(b"LLX1:"):
            decoded = base64.b64decode(data.split(b":", 2)[2])
            tmp = tempfile.NamedTemporaryFile(suffix=".ledger", delete=False)
            tmp.write(decoded)
            tmp.close()
            return tmp.name
        raise RuntimeError("Cannot decrypt export")
