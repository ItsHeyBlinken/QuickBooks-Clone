"""Tests for demo seed data."""

import os
import tempfile

import pytest

from ledger.database import Database
from ledger import customers, seed


@pytest.fixture
def db():
    with tempfile.NamedTemporaryFile(suffix=".ledger", delete=False) as f:
        path = f.name
    database = Database()
    database.create_company(path, "Seed Test Company")
    yield database
    database.close()
    os.unlink(path)


def test_seed_and_clear_demo_data(db):
    assert seed.is_seeded(db) is False

    status = seed.seed_demo_data(db)
    assert status["seeded"] is True
    assert status["counts"].get("customers", 0) == 3
    assert status["counts"].get("invoices", 0) == 3
    assert status["counts"].get("inventory_items", 0) == 4
    assert status["counts"].get("payroll_employees", 0) == 3

    customers_after = customers.list_customers(db)
    assert any(c["name"] == "Acme Manufacturing" for c in customers_after)

    cleared = seed.clear_demo_data(db)
    assert cleared["seeded"] is False
    assert cleared["removed"] > 0
    assert seed.is_seeded(db) is False
    assert not any(c["name"] == "Acme Manufacturing" for c in customers.list_customers(db))


def test_seed_clear_and_reload_demo_data(db):
    seed.seed_demo_data(db)
    seed.clear_demo_data(db)

    status = seed.seed_demo_data(db)
    assert status["seeded"] is True
    assert status["counts"].get("customers", 0) == 3
    assert any(c["name"] == "Acme Manufacturing" for c in customers.list_customers(db))


def test_seed_reloads_after_leftover_artifacts(db):
    seed.seed_demo_data(db)
    db.execute("DELETE FROM meta WHERE key = 'demo_seed_active'")
    db.commit()

    assert seed.is_seeded(db) is False
    assert seed._has_seed_artifacts(db) is True

    status = seed.seed_demo_data(db)
    assert status["seeded"] is True
    assert status["counts"].get("customers", 0) == 3
