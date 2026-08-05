"""Feature gate middleware for tier-based access control."""

from __future__ import annotations

from .licensing import check_feature, get_license_info

FEATURE_MAP = {
    "inventory.list": "inventory",
    "inventory.create": "inventory",
    "inventory.adjust": "inventory",
    "inventory.sale": "inventory",
    "payroll.employees": "payroll_calc",
    "payroll.createEmployee": "payroll_calc",
    "payroll.calculate": "payroll_calc",
    "payroll.post": "payroll_calc",
    "invoices.batch": "batch_invoicing",
    "import.ofx": "ofx_import",
    "import.qif": "ofx_import",
    "reconciliation.start": "reconciliation",
    "reconciliation.get": "reconciliation",
    "reconciliation.toggle": "reconciliation",
    "reconciliation.complete": "reconciliation",
    "sync.start": "lan_sync",
    "sync.stop": "lan_sync",
    "sync.discover": "lan_sync",
    "reports.drillDown": "advanced_reporting",
}


def check_method_access(method: str) -> bool:
    feature = FEATURE_MAP.get(method)
    if not feature:
        return True
    return check_feature(feature)


def get_tier_info() -> dict:
    return get_license_info()
