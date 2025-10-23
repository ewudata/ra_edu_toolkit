from __future__ import annotations

import io
import re
import shutil
import sqlite3
import zipfile
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


def _ensure_datasets_root(*, create: bool = False) -> None:
    if create:
        DATASETS_ROOT.mkdir(parents=True, exist_ok=True)
    elif not DATASETS_ROOT.exists():
        raise FileNotFoundError(f"Datasets directory not found at {DATASETS_ROOT}")


def _normalise_database_name(database: str) -> str:
    if not database:
        raise ValueError("Database name must be provided")
    candidate = database.strip()
    if not candidate:
        raise ValueError("Database name must be a non-empty string")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", candidate):
        raise ValueError(
            "Database name may only contain letters, numbers, hyphen, and underscore"
        )
    return candidate


def _normalise_table_stem(name: str) -> str:
    candidate = name.strip().replace(" ", "_").lower()
    if not candidate:
        raise ValueError("Table name resolved from source is empty")
    return candidate


def _summarise_database_dir(db_path: Path) -> DatabaseSummary:
    tables = [csv_path.stem.lower() for csv_path in _iter_csv_files(db_path)]
    return DatabaseSummary(name=db_path.name, tables=tables)


def _filter_sqlite_unsupported(sql_script: str) -> str:
    """Strip commands that SQLite cannot execute (common in MySQL dumps)."""

    skip_prefixes = (
        "SET ",
        "LOCK TABLES",
        "UNLOCK TABLES",
        "DELIMITER ",
        "USE ",
        "CREATE DATABASE ",
        "DROP DATABASE ",
    )
    filtered_lines: List[str] = []
    for line in sql_script.splitlines():
        stripped = line.strip()
        if not stripped:
            filtered_lines.append(line)
            continue
        upper = stripped.upper()
        if upper.startswith(skip_prefixes) or stripped.startswith("/*!"):
            continue
        filtered_lines.append(line)
    return "\n".join(filtered_lines)


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
        databases.append(_summarise_database_dir(db_dir))
    return databases


def _resolve_database_path(database: str) -> Path:
    normalised = _normalise_database_name(database)
    db_path = (DATASETS_ROOT / normalised).resolve()
    if not db_path.is_dir():
        available = ", ".join(db.name for db in list_databases()) or "<none>"
        raise FileNotFoundError(
            f"Database '{database}' not found under {DATASETS_ROOT}. Available: {available}"
        )
    return db_path


def _write_csv_file(destination: Path, filename: str, data: bytes) -> None:
    dest_path = destination / filename
    if dest_path.exists():
        raise ValueError(f"Duplicate table name '{dest_path.stem}' detected during import")
    with dest_path.open("wb") as handle:
        handle.write(data)


def create_database_from_zip(database: str, zip_bytes: bytes) -> DatabaseSummary:
    normalised_name = _normalise_database_name(database)
    _ensure_datasets_root(create=True)
    destination = DATASETS_ROOT / normalised_name
    if destination.exists():
        raise FileExistsError(f"Database '{normalised_name}' already exists")

    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
            members = [info for info in archive.infolist() if not info.is_dir()]
            csv_members = []
            for info in members:
                rel_path = Path(info.filename)
                if rel_path.is_absolute() or ".." in rel_path.parts:
                    raise ValueError("ZIP archive contains invalid paths")
                if rel_path.name.startswith(".") or (
                    rel_path.parts and rel_path.parts[0].startswith("__MACOSX")
                ):
                    continue
                if rel_path.suffix.lower() != ".csv":
                    continue
                csv_members.append(info)

            if not csv_members:
                raise ValueError("ZIP archive does not contain any CSV files")

            destination.mkdir(parents=True, exist_ok=False)
            try:
                for info in csv_members:
                    rel_path = Path(info.filename)
                    table_name = _normalise_table_stem(rel_path.stem)
                    file_name = f"{table_name}.csv"
                    with archive.open(info) as src:
                        _write_csv_file(destination, file_name, src.read())
            except Exception:
                shutil.rmtree(destination, ignore_errors=True)
                raise
    except zipfile.BadZipFile as exc:
        raise ValueError("Provided file is not a valid ZIP archive") from exc

    return _summarise_database_dir(destination)


def create_database_from_sql(database: str, sql_script: str) -> DatabaseSummary:
    normalised_name = _normalise_database_name(database)
    _ensure_datasets_root(create=True)
    destination = DATASETS_ROOT / normalised_name
    if destination.exists():
        raise FileExistsError(f"Database '{normalised_name}' already exists")

    destination.mkdir(parents=True, exist_ok=False)
    try:
        with sqlite3.connect(":memory:") as conn:
            cleaned_script = _filter_sqlite_unsupported(sql_script)
            conn.executescript(cleaned_script)
            tables = [
                row[0]
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
                )
            ]
            if not tables:
                raise ValueError("SQL script did not create any tables")

            for table in tables:
                normalised_table = _normalise_table_stem(table)
                df = pd.read_sql_query(f'SELECT * FROM "{table}"', conn)
                csv_path = destination / f"{normalised_table}.csv"
                if csv_path.exists():
                    raise ValueError(f"Duplicate table name '{normalised_table}' generated during SQL import")
                df.to_csv(csv_path, index=False)
    except Exception:
        shutil.rmtree(destination, ignore_errors=True)
        raise

    return _summarise_database_dir(destination)


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
