"""Guards that keep models, constants and the initial migration in sync."""

import importlib.util
from pathlib import Path

from app import constants as c
from app.models import Base

MIGRATION = next((Path(__file__).parents[1] / "alembic" / "versions").glob("*_initial_schema.py"))


def _load_migration():
    spec = importlib.util.spec_from_file_location("initial_schema", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _app_tables() -> set[str]:
    return {t.name for t in Base.metadata.sorted_tables if t.schema is None}


def test_every_table_gets_row_level_security() -> None:
    # A new model must be added to APP_TABLES so it is locked down for browser keys.
    assert set(_load_migration().APP_TABLES) == _app_tables()


def test_expected_tables_exist() -> None:
    assert len(_app_tables()) == 14


def test_inventory_categories_include_structure() -> None:
    assert "Structure" in c.INVENTORY_CATEGORIES


def test_names_are_never_unique() -> None:
    # Only ids, inventory sku and inspiration slug may be unique.
    unique_columns = {
        (table.name, column.name)
        for table in Base.metadata.sorted_tables
        for column in table.columns
        if column.unique
    }
    assert unique_columns == {("inventory_items", "sku"), ("inspirations", "slug")}


def test_money_columns_are_integers() -> None:
    for table in Base.metadata.sorted_tables:
        for column in table.columns:
            if column.name.endswith("_pkr"):
                assert column.type.python_type is int, f"{table.name}.{column.name}"
