from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATASETS_ROOT = PROJECT_ROOT / "datasets"


@dataclass
class ColumnSchema:
    name: str
    dtype: str


@dataclass
class TableSchema:
    name: str
    columns: List[ColumnSchema]
    row_count: int
    sample_rows: List[Dict[str, object]]


@dataclass
class DatabaseSummary:
    name: str
    tables: List[str]

    @property
    def table_count(self) -> int:
        return len(self.tables)


@dataclass
class DatabaseSchema:
    name: str
    tables: List[TableSchema]


def _ensure_datasets_root() -> None:
    if not DATASETS_ROOT.exists():
        raise FileNotFoundError(f"Datasets directory not found at {DATASETS_ROOT}")


def _iter_database_dirs() -> Iterable[Path]:
    _ensure_datasets_root()
    for entry in sorted(DATASETS_ROOT.iterdir()):
        if entry.is_dir():
            yield entry


def _iter_csv_files(db_path: Path) -> Iterable[Path]:
    for entry in sorted(db_path.iterdir()):
        if entry.is_file() and entry.suffix.lower() == ".csv":
            yield entry


def list_databases() -> List[DatabaseSummary]:
    """Return every database available under the datasets root."""

    databases: List[DatabaseSummary] = []
    for db_dir in _iter_database_dirs():
        tables = [csv_path.stem.lower() for csv_path in _iter_csv_files(db_dir)]
        databases.append(DatabaseSummary(name=db_dir.name, tables=tables))
    return databases


def _resolve_database_path(database: str) -> Path:
    if not database:
        raise ValueError("Database name must be a non-empty string")
    db_path = (DATASETS_ROOT / database).resolve()
    if not db_path.is_dir():
        available = ", ".join(db.name for db in list_databases()) or "<none>"
        raise FileNotFoundError(
            f"Database '{database}' not found under {DATASETS_ROOT}. Available: {available}"
        )
    return db_path


def load_database_env(database: str) -> Dict[str, pd.DataFrame]:
    """Load a database into the evaluation environment (relations keyed by lower-case name)."""

    db_path = _resolve_database_path(database)
    env: Dict[str, pd.DataFrame] = {}
    for csv_path in _iter_csv_files(db_path):
        rel_name = csv_path.stem.lower()
        df = pd.read_csv(csv_path)
        df = df.copy()
        df.columns = [c.lower() for c in df.columns]
        df["_prov"] = [[(rel_name, int(i))] for i in range(len(df))]
        env[rel_name] = df
    if not env:
        raise ValueError(f"Database '{database}' does not contain any CSV files")
    return env


def get_database_schema(database: str, sample_rows: int = 10) -> DatabaseSchema:
    """Return schema metadata (columns, row counts, previews) for a database."""

    db_path = _resolve_database_path(database)
    tables: List[TableSchema] = []
    for csv_path in _iter_csv_files(db_path):
        rel_name = csv_path.stem.lower()
        df = pd.read_csv(csv_path)
        df = df.copy()
        df.columns = [c.lower() for c in df.columns]
        columns = [ColumnSchema(name=col, dtype=str(df[col].dtype)) for col in df.columns]
        preview_df = df.head(sample_rows).copy()
        preview_df = preview_df.where(pd.notnull(preview_df), None)
        sample = preview_df.to_dict(orient="records")
        tables.append(
            TableSchema(
                name=rel_name,
                columns=columns,
                row_count=len(df),
                sample_rows=sample,
            )
        )
    if not tables:
        raise ValueError(f"Database '{database}' does not contain any CSV files")
    return DatabaseSchema(name=database, tables=tables)


def get_table_schema(database: str, relation: str, sample_rows: int = 10) -> TableSchema:
    """Return metadata for a single relation within a database."""

    db_path = _resolve_database_path(database)
    target = None
    relation_lower = relation.lower()
    for csv_path in _iter_csv_files(db_path):
        if csv_path.stem.lower() == relation_lower:
            target = csv_path
            break
    if target is None:
        raise FileNotFoundError(
            f"Relation '{relation}' not found in database '{database}'"
        )
    df = pd.read_csv(target)
    df = df.copy()
    df.columns = [c.lower() for c in df.columns]
    columns = [ColumnSchema(name=col, dtype=str(df[col].dtype)) for col in df.columns]
    preview_df = df.head(sample_rows).copy()
    preview_df = preview_df.where(pd.notnull(preview_df), None)
    sample = preview_df.to_dict(orient="records")
    return TableSchema(
        name=relation_lower,
        columns=columns,
        row_count=len(df),
        sample_rows=sample,
    )
