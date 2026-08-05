"""Offline licensing system (Phase 4)."""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

LICENSE_FILE = "license.json"

TIER_FEATURES = {
    "trial": [
        "core_bookkeeping", "invoicing", "basic_reporting", "csv_import",
        "inventory", "multi_company", "batch_invoicing", "payroll_calc",
    ],
    "basic": ["core_bookkeeping", "invoicing", "basic_reporting", "csv_import"],
    "pro": [
        "core_bookkeeping", "invoicing", "basic_reporting", "csv_import",
        "inventory", "multi_company", "advanced_reporting", "payroll_calc",
        "ofx_import", "reconciliation",
    ],
    "enterprise": [
        "core_bookkeeping", "invoicing", "basic_reporting", "csv_import",
        "inventory", "multi_company", "advanced_reporting", "payroll_calc",
        "ofx_import", "reconciliation", "batch_invoicing", "lan_sync",
        "accountant_export", "customization",
    ],
}

GATED_FEATURES = [
    "advanced_reporting",
    "ofx_import",
    "reconciliation",
    "lan_sync",
    "accountant_export",
    "customization",
]


def all_features() -> list[str]:
    features: set[str] = set(GATED_FEATURES)
    for tier_features in TIER_FEATURES.values():
        features.update(tier_features)
    return sorted(features)


def get_license_dir() -> Path:
    app_data = os.environ.get("APPDATA") or os.path.expanduser("~")
    license_dir = Path(app_data) / "LedgerLocal"
    license_dir.mkdir(parents=True, exist_ok=True)
    return license_dir


def get_license_info() -> dict[str, Any]:
    license_path = get_license_dir() / LICENSE_FILE
    if not license_path.exists():
        return _create_trial()

    try:
        data = json.loads(license_path.read_text(encoding="utf-8"))
        tier = data.get("tier", "trial")
        expires_at = data.get("expiresAt")

        if expires_at:
            exp = datetime.fromisoformat(expires_at)
            if datetime.now(timezone.utc) > exp:
                return {
                    "tier": tier,
                    "expiresAt": expires_at,
                    "isValid": False,
                    "features": TIER_FEATURES.get(tier, TIER_FEATURES["basic"]),
                }

        features = all_features() if tier == "trial" else TIER_FEATURES.get(tier, TIER_FEATURES["basic"])
        return {
            "tier": tier,
            "expiresAt": expires_at,
            "isValid": True,
            "features": features,
        }
    except Exception:
        return _create_trial()


def activate_license(license_key: str) -> dict[str, Any]:
    tier = _parse_license_key(license_key)
    if not tier:
        return {"success": False, "error": "Invalid license key"}

    expires_at = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
    license_data = {
        "key": license_key,
        "tier": tier,
        "activatedAt": datetime.now(timezone.utc).isoformat(),
        "expiresAt": expires_at,
    }

    license_path = get_license_dir() / LICENSE_FILE
    license_path.write_text(json.dumps(license_data, indent=2), encoding="utf-8")

    return {
        "success": True,
        "tier": tier,
        "expiresAt": expires_at,
        "features": TIER_FEATURES.get(tier, []),
    }


def check_feature(feature: str) -> bool:
    if os.environ.get("LEDGERLOCAL_DEV") == "1":
        return True

    info = get_license_info()
    if not info.get("isValid", False):
        return feature in TIER_FEATURES["basic"]
    if info.get("tier") == "trial":
        return True
    return feature in info.get("features", [])


def _create_trial() -> dict[str, Any]:
    expires_at = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    return {
        "tier": "trial",
        "expiresAt": expires_at,
        "isValid": True,
        "features": all_features(),
    }


def _parse_license_key(key: str) -> str | None:
    key = key.strip().upper()
    prefixes = {
        "LL-BASIC-": "basic",
        "LL-PRO-": "pro",
        "LL-ENT-": "enterprise",
    }
    for prefix, tier in prefixes.items():
        if key.startswith(prefix) and len(key) > len(prefix) + 8:
            return tier
    return None
