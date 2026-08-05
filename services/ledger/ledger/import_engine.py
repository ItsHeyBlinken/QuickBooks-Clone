"""Bank import pipeline — rules, fuzzy match, ML categorization."""

from __future__ import annotations

import csv
import json
import re
import uuid
from datetime import datetime, timezone
from io import StringIO
from typing import Any

from . import accounts, journal
from .database import Database

try:
    from sklearn.feature_extraction.text import CountVectorizer
    from sklearn.naive_bayes import MultinomialNB
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False


def normalize_description(desc: str) -> str:
    desc = desc.upper().strip()
    desc = re.sub(r"\d{4,}", "", desc)
    desc = re.sub(r"[^A-Z0-9\s]", " ", desc)
    desc = re.sub(r"\s+", " ", desc).strip()
    return desc


def list_rules(db: Database) -> list[dict[str, Any]]:
    rows = db.execute(
        "SELECT * FROM import_rules WHERE is_active = 1 ORDER BY priority DESC"
    ).fetchall()
    return [_row_to_rule(row) for row in rows]


def create_rule(
    db: Database,
    name: str,
    criteria: dict[str, Any],
    action: dict[str, Any],
    priority: int = 0,
) -> dict[str, Any]:
    rule_id = str(uuid.uuid4())
    db.execute(
        "INSERT INTO import_rules (id, name, criteria_json, action_json, is_active, priority) VALUES (?, ?, ?, ?, 1, ?)",
        (rule_id, name, json.dumps(criteria), json.dumps(action), priority),
    )
    db.commit()
    row = db.execute("SELECT * FROM import_rules WHERE id = ?", (rule_id,)).fetchone()
    return _row_to_rule(row)


def delete_rule(db: Database, rule_id: str) -> dict[str, str]:
    db.execute("UPDATE import_rules SET is_active = 0 WHERE id = ?", (rule_id,))
    db.commit()
    return {"status": "ok"}


def import_csv(
    db: Database,
    csv_content: str,
    filename: str | None = None,
    date_col: str = "Date",
    desc_col: str = "Description",
    amount_col: str = "Amount",
) -> dict[str, Any]:
    batch_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        "INSERT INTO import_batches (id, filename, imported_at, status) VALUES (?, ?, ?, 'pending')",
        (batch_id, filename, now),
    )

    reader = csv.DictReader(StringIO(csv_content))
    rules = list_rules(db)
    transactions = []

    for row in reader:
        date_val = row.get(date_col, row.get("date", ""))
        desc = row.get(desc_col, row.get("description", ""))
        amount_str = row.get(amount_col, row.get("amount", "0"))
        amount = float(amount_str.replace(",", "").replace("$", ""))

        normalized = normalize_description(desc)
        match = _apply_rules(rules, normalized, amount)
        confidence = "none"
        suggested_account_id = None
        suggested_vendor = None
        rule_id = None

        if match:
            confidence = "rule"
            suggested_account_id = match["action"].get("categoryId") or match["action"].get("category_id")
            suggested_vendor = match["action"].get("vendorName") or match["action"].get("vendor_name")
            rule_id = match["id"]
        else:
            fuzzy = _fuzzy_match(db, normalized)
            if fuzzy:
                confidence = "fuzzy"
                suggested_account_id = fuzzy["category_id"]
                suggested_vendor = fuzzy.get("vendor_name")
            else:
                ml = _ml_suggest(db, normalized)
                if ml:
                    confidence = "ml"
                    suggested_account_id = ml

        txn_id = str(uuid.uuid4())
        db.execute(
            "INSERT INTO import_transactions (id, batch_id, date, description, amount, suggested_account_id, suggested_vendor_name, confidence, status, rule_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
            (txn_id, batch_id, date_val, desc, amount, suggested_account_id, suggested_vendor, confidence, rule_id),
        )
        transactions.append({
            "id": txn_id,
            "date": date_val,
            "description": desc,
            "amount": amount,
            "suggestedAccountId": suggested_account_id,
            "suggestedVendorName": suggested_vendor,
            "confidence": confidence,
            "status": "pending",
            "ruleId": rule_id,
        })

    db.commit()
    return {"batchId": batch_id, "transactions": transactions, "count": len(transactions)}


def import_ofx(db: Database, ofx_content: str, filename: str | None = None) -> dict[str, Any]:
    try:
        from ofxparse import OfxParser
    except ImportError:
        raise RuntimeError("ofxparse not installed")

    ofx = OfxParser.parse(StringIO(ofx_content))
    csv_lines = ["Date,Description,Amount"]
    for account in ofx.accounts:
        for txn in account.statement.transactions:
            csv_lines.append(f"{txn.date},{txn.payee or txn.memo},{txn.amount}")
    return import_csv(db, "\n".join(csv_lines), filename)


def import_qif(db: Database, qif_content: str, filename: str | None = None) -> dict[str, Any]:
    try:
        import quiffen
    except ImportError:
        raise RuntimeError("quiffen not installed")

    qif = quiffen.parse(qif_content)
    csv_lines = ["Date,Description,Amount"]
    for account in qif.accounts:
        for txn in account.transactions:
            csv_lines.append(f"{txn.date},{txn.payee or txn.memo},{txn.amount}")
    return import_csv(db, "\n".join(csv_lines), filename)


def get_batch(db: Database, batch_id: str) -> dict[str, Any]:
    rows = db.execute(
        "SELECT * FROM import_transactions WHERE batch_id = ? ORDER BY date",
        (batch_id,),
    ).fetchall()
    return {
        "batchId": batch_id,
        "transactions": [_row_to_txn(row) for row in rows],
    }


def approve_transactions(
    db: Database,
    transaction_ids: list[str],
    bank_account_id: str,
) -> dict[str, Any]:
    approved = []
    for txn_id in transaction_ids:
        row = db.execute(
            "SELECT * FROM import_transactions WHERE id = ?", (txn_id,)
        ).fetchone()
        if not row or row["status"] != "pending":
            continue

        account_id = row["suggested_account_id"]
        if not account_id:
            expense = accounts.find_account_by_subtype(db, "expense")
            account_id = expense["id"] if expense else None
        if not account_id:
            continue

        amount = abs(row["amount"])
        if row["amount"] < 0:
            lines = [
                {"accountId": account_id, "debit": amount, "credit": 0},
                {"accountId": bank_account_id, "debit": 0, "credit": amount},
            ]
        else:
            income = accounts.find_account_by_subtype(db, "income")
            income_id = account_id if account_id else (income["id"] if income else None)
            lines = [
                {"accountId": bank_account_id, "debit": amount, "credit": 0},
                {"accountId": income_id, "debit": 0, "credit": amount},
            ]

        entry = journal.post_entry(
            db,
            date=row["date"],
            lines=lines,
            memo=row["description"],
            source_type="import",
            source_id=txn_id,
        )
        db.execute(
            "UPDATE import_transactions SET status = 'approved', posted_entry_id = ? WHERE id = ?",
            (entry["id"], txn_id),
        )
        _record_vendor_history(db, row["description"], account_id, row["suggested_vendor_name"])
        approved.append(txn_id)

    db.commit()
    _retrain_ml(db)
    return {"approved": approved, "count": len(approved)}


def skip_transactions(db: Database, transaction_ids: list[str]) -> dict[str, Any]:
    for txn_id in transaction_ids:
        db.execute(
            "UPDATE import_transactions SET status = 'skipped' WHERE id = ?",
            (txn_id,),
        )
    db.commit()
    return {"skipped": transaction_ids}


def _apply_rules(rules: list[dict], description: str, amount: float) -> dict | None:
    for rule in rules:
        criteria = rule["criteria"]
        if criteria.get("descriptionContains") or criteria.get("description_contains"):
            needle = (criteria.get("descriptionContains") or criteria.get("description_contains", "")).upper()
            if needle not in description:
                continue
        if "amountMin" in criteria or "amount_min" in criteria:
            if amount < (criteria.get("amountMin") or criteria.get("amount_min", float("-inf"))):
                continue
        if "amountMax" in criteria or "amount_max" in criteria:
            if amount > (criteria.get("amountMax") or criteria.get("amount_max", float("inf"))):
                continue
        return rule
    return None


def _fuzzy_match(db: Database, description: str) -> dict | None:
    try:
        rows = db.execute(
            "SELECT category_id, vendor_name FROM vendor_history_fts WHERE vendor_history_fts MATCH ? LIMIT 1",
            (description,),
        ).fetchall()
        if rows:
            return {"category_id": rows[0][0], "vendor_name": rows[0][1]}
    except Exception:
        pass
    row = db.execute(
        "SELECT category_id, vendor_name FROM vendor_history WHERE description LIKE ? LIMIT 1",
        (f"%{description[:20]}%",),
    ).fetchone()
    if row:
        return {"category_id": row["category_id"], "vendor_name": row["vendor_name"]}
    return None


def _ml_suggest(db: Database, description: str) -> str | None:
    if not HAS_SKLEARN:
        return None
    rows = db.execute(
        "SELECT description, category_id FROM vendor_history LIMIT 500"
    ).fetchall()
    if len(rows) < 5:
        return None
    texts = [r["description"] for r in rows]
    labels = [r["category_id"] for r in rows]
    try:
        vectorizer = CountVectorizer()
        X = vectorizer.fit_transform(texts)
        model = MultinomialNB()
        model.fit(X, labels)
        pred = model.predict(vectorizer.transform([description]))
        return pred[0]
    except Exception:
        return None


def _record_vendor_history(
    db: Database,
    description: str,
    category_id: str,
    vendor_name: str | None,
) -> None:
    hist_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        "INSERT INTO vendor_history (id, description, category_id, vendor_name, created_at) VALUES (?, ?, ?, ?, ?)",
        (hist_id, normalize_description(description), category_id, vendor_name, now),
    )
    try:
        db.execute(
            "INSERT INTO vendor_history_fts (description, category_id, vendor_name) VALUES (?, ?, ?)",
            (normalize_description(description), category_id, vendor_name),
        )
    except Exception:
        pass


def _retrain_ml(db: Database) -> None:
    pass


def _row_to_rule(row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "criteria": json.loads(row["criteria_json"]),
        "action": json.loads(row["action_json"]),
        "isActive": bool(row["is_active"]),
        "priority": row["priority"],
    }


def _row_to_txn(row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "date": row["date"],
        "description": row["description"],
        "amount": row["amount"],
        "suggestedAccountId": row["suggested_account_id"],
        "suggestedVendorName": row["suggested_vendor_name"],
        "confidence": row["confidence"],
        "status": row["status"],
        "ruleId": row["rule_id"],
    }
