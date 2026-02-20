from __future__ import annotations

import io
import os
import re
import sqlite3
import zipfile
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Dict, List, Optional, Tuple

import pandas as pd

from .supabase import (
    DefaultDatasetRow,
    SupabaseDatasetError,
    SupabaseStorageError,
    UserDatasetRow,
    delete_user_dataset as delete_user_dataset_row,
    list_default_datasets,
    list_user_datasets,
    storage_delete_prefix,
    storage_download_object,
    storage_list_objects,
    storage_upload_object,
    upsert_user_dataset,
)


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
    is_default: bool = False

    @property
    def table_count(self) -> int:
        return len(self.tables)


@dataclass
class DatabaseSchema:
    name: str
    tables: List[TableSchema]


@dataclass
class DatasetLocation:
    name: str
    bucket: str
    prefix: str
    is_default: bool
    source_type: str
    hidden: bool


_SCHEMA_PREVIEW_CACHE: Dict[Tuple[str, str, int], "DatabaseSchema"] = {}


class SqlImportError(ValueError):
    """Raised when SQL import fails with additional context."""

    def __init__(
        self,
        message: str,
        *,
        line: Optional[int] = None,
        statement: Optional[str] = None,
    ):
        super().__init__(message)
        self.line = line
        self.statement = statement


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


def _normalise_user_id(user_id: str) -> str:
    candidate = user_id.strip()
    if not candidate:
        raise ValueError("User id must be a non-empty string")
    return re.sub(r"[^A-Za-z0-9_-]", "_", candidate)


def _join_prefix(prefix: str, name: str) -> str:
    p = prefix.strip("/")
    n = name.strip("/")
    if not p:
        return n
    if not n:
        return p
    return f"{p}/{n}"


def _schema_cache_key(
    database: str,
    sample_rows: int,
    user_id: Optional[str],
) -> Tuple[str, str, int]:
    cache_user = user_id or ""
    cache_db = _normalise_database_name(database)
    cache_rows = max(sample_rows, 0)
    return cache_user, cache_db, cache_rows


def clear_schema_preview_cache(database: Optional[str] = None) -> None:
    if database is None:
        _SCHEMA_PREVIEW_CACHE.clear()
        return

    normalised = _normalise_database_name(database)
    stale_keys = [key for key in _SCHEMA_PREVIEW_CACHE if key[1] == normalised]
    for key in stale_keys:
        _SCHEMA_PREVIEW_CACHE.pop(key, None)


def _approximate_csv_row_count(raw: bytes) -> int:
    if not raw:
        return 0
    text = raw.decode("utf-8", errors="ignore")
    if not text.strip():
        return 0
    line_count = len(text.splitlines())
    return max(line_count - 1, 0)


def _default_rows_by_name() -> Dict[str, DefaultDatasetRow]:
    try:
        rows = list_default_datasets()
    except SupabaseDatasetError as exc:
        raise FileNotFoundError(str(exc)) from exc
    return {row.dataset_name: row for row in rows if row.enabled}


def _user_rows_by_name(user_id: str) -> Dict[str, UserDatasetRow]:
    try:
        rows = list_user_datasets(user_id)
    except SupabaseDatasetError as exc:
        raise FileNotFoundError(str(exc)) from exc
    return {row.database_name: row for row in rows}


def _list_table_names(bucket: str, prefix: str) -> List[str]:
    try:
        names = storage_list_objects(bucket, prefix)
    except SupabaseStorageError as exc:
        raise FileNotFoundError(str(exc)) from exc
    tables: List[str] = []
    for name in names:
        p = PurePosixPath(name)
        if p.suffix.lower() != ".csv":
            continue
        tables.append(p.stem.lower())
    return sorted(set(tables))


def _build_location_from_default(row: DefaultDatasetRow) -> DatasetLocation:
    return DatasetLocation(
        name=row.dataset_name,
        bucket=row.bucket_name,
        prefix=row.object_prefix,
        is_default=True,
        source_type="default",
        hidden=False,
    )


def _build_location_from_user(row: UserDatasetRow) -> DatasetLocation:
    return DatasetLocation(
        name=row.database_name,
        bucket=row.bucket_name,
        prefix=row.object_prefix,
        is_default=row.is_default,
        source_type=row.source_type,
        hidden=row.hidden,
    )


def _resolve_location(database: str, user_id: Optional[str]) -> DatasetLocation:
    name = _normalise_database_name(database)
    default_rows = _default_rows_by_name()
    default_row = default_rows.get(name)

    user_row: Optional[UserDatasetRow] = None
    if user_id:
        user_row = _user_rows_by_name(user_id).get(name)

    if user_row and user_row.source_type == "user" and not user_row.hidden:
        return _build_location_from_user(user_row)

    if default_row:
        if user_row and user_row.source_type == "default" and user_row.hidden:
            raise FileNotFoundError(f"Database '{name}' is hidden for this user.")
        return _build_location_from_default(default_row)

    raise FileNotFoundError(f"Database '{name}' not found.")


def list_databases(user_id: Optional[str] = None) -> List[DatabaseSummary]:
    default_rows = _default_rows_by_name()
    user_rows = _user_rows_by_name(user_id) if user_id else {}

    hidden_defaults = {
        name
        for name, row in user_rows.items()
        if row.source_type == "default" and row.hidden
    }

    summaries: Dict[str, DatabaseSummary] = {}

    for name, row in default_rows.items():
        if name in hidden_defaults:
            continue
        tables = _list_table_names(row.bucket_name, row.object_prefix)
        summaries[name] = DatabaseSummary(name=name, tables=tables, is_default=True)

    for name, row in user_rows.items():
        if row.source_type != "user" or row.hidden:
            continue
        tables = _list_table_names(row.bucket_name, row.object_prefix)
        summaries[name] = DatabaseSummary(name=name, tables=tables, is_default=False)

    return [summaries[name] for name in sorted(summaries.keys())]


def _upload_csv_map(
    *,
    bucket: str,
    prefix: str,
    csv_map: Dict[str, bytes],
) -> None:
    for filename, content in csv_map.items():
        object_path = _join_prefix(prefix, filename)
        storage_upload_object(
            bucket=bucket,
            object_path=object_path,
            content=content,
            content_type="text/csv",
            upsert=False,
        )


def _extract_csv_map_from_zip(zip_bytes: bytes) -> Dict[str, bytes]:
    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
            members = [info for info in archive.infolist() if not info.is_dir()]
            csv_map: Dict[str, bytes] = {}
            for info in members:
                rel_path = PurePosixPath(info.filename)
                if rel_path.is_absolute() or ".." in rel_path.parts:
                    raise ValueError("ZIP archive contains invalid paths")
                if rel_path.name.startswith(".") or (
                    rel_path.parts and rel_path.parts[0].startswith("__MACOSX")
                ):
                    continue
                if rel_path.suffix.lower() != ".csv":
                    continue
                table_name = _normalise_table_stem(rel_path.stem)
                filename = f"{table_name}.csv"
                if filename in csv_map:
                    raise ValueError(f"Duplicate table name '{table_name}' in ZIP")
                with archive.open(info) as src:
                    csv_map[filename] = src.read()
    except zipfile.BadZipFile as exc:
        raise ValueError("Provided file is not a valid ZIP archive") from exc

    if not csv_map:
        raise ValueError("ZIP archive does not contain any CSV files")
    return csv_map


def _filter_sqlite_unsupported(sql_script: str) -> List[Tuple[str, int]]:
    skip_prefixes = (
        "SET ",
        "LOCK TABLES",
        "UNLOCK TABLES",
        "DELIMITER ",
        "USE ",
        "CREATE DATABASE ",
        "DROP DATABASE ",
    )
    filtered: List[Tuple[str, int]] = []
    for line_no, line in enumerate(sql_script.splitlines(), start=1):
        stripped = line.strip()
        if not stripped:
            filtered.append((line, line_no))
            continue
        upper = stripped.upper()
        if upper.startswith(skip_prefixes) or stripped.startswith("/*!"):
            continue
        filtered.append((line, line_no))
    return filtered


def _execute_sql_script(conn: sqlite3.Connection, filtered: List[Tuple[str, int]]) -> None:
    cursor = conn.cursor()
    max_preview = 1000
    statement_buffer: List[str] = []
    line_numbers: List[int] = []

    def reset() -> None:
        statement_buffer.clear()
        line_numbers.clear()

    for line, line_no in filtered:
        statement_buffer.append(line)
        line_numbers.append(line_no)
        statement_text = "\n".join(statement_buffer)
        if not statement_text.strip():
            reset()
            continue
        if sqlite3.complete_statement(statement_text):
            try:
                cursor.executescript(statement_text)
            except sqlite3.Error as exc:
                snippet = "\n".join(
                    l for l in statement_buffer if l.strip()
                ).strip()
                if snippet and len(snippet) > max_preview:
                    snippet = f"{snippet[:max_preview]}..."
                raise SqlImportError(
                    exc.args[0] if exc.args else str(exc),
                    line=line_numbers[0] if line_numbers else None,
                    statement=snippet or None,
                ) from exc
            reset()

    if any(line.strip() for line in statement_buffer):
        snippet = "\n".join(l for l in statement_buffer if l.strip()).strip()
        if snippet and len(snippet) > max_preview:
            snippet = f"{snippet[:max_preview]}..."
        raise SqlImportError(
            "SQL script ends with an incomplete statement",
            line=line_numbers[0] if line_numbers else None,
            statement=snippet or None,
        )


def _extract_csv_map_from_sql(sql_script: str) -> Dict[str, bytes]:
    csv_map: Dict[str, bytes] = {}
    with sqlite3.connect(":memory:") as conn:
        filtered = _filter_sqlite_unsupported(sql_script)
        _execute_sql_script(conn, filtered)
        tables = [
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
        ]
        if not tables:
            raise ValueError("SQL script did not create any tables")

        for table in tables:
            table_name = _normalise_table_stem(table)
            df = pd.read_sql_query(f'SELECT * FROM "{table}"', conn)
            buf = io.StringIO()
            df.to_csv(buf, index=False)
            filename = f"{table_name}.csv"
            if filename in csv_map:
                raise ValueError(
                    f"Duplicate table name '{table_name}' generated during SQL import"
                )
            csv_map[filename] = buf.getvalue().encode("utf-8")
    return csv_map


def _user_dataset_prefix(user_id: str, database: str) -> str:
    safe_user = _normalise_user_id(user_id)
    safe_db = _normalise_database_name(database)
    return f"{safe_user}/{safe_db}"


def create_database_from_zip(
    database: str,
    zip_bytes: bytes,
    *,
    user_id: Optional[str] = None,
) -> DatabaseSummary:
    if not user_id:
        raise ValueError("Authenticated user id is required for dataset import.")

    name = _normalise_database_name(database)
    default_rows = _default_rows_by_name()
    if name in default_rows:
        raise ValueError(
            f"Database '{name}' is a shared default name and cannot be overwritten."
        )

    user_rows = _user_rows_by_name(user_id)
    existing = user_rows.get(name)
    if existing and existing.source_type == "user" and not existing.hidden:
        raise FileExistsError(f"Database '{name}' already exists")

    csv_map = _extract_csv_map_from_zip(zip_bytes)
    bucket = os.getenv("SUPABASE_USER_DATASETS_BUCKET", "ra-user-datasets")
    prefix = _user_dataset_prefix(user_id, name)
    if existing and existing.source_type == "user":
        storage_delete_prefix(existing.bucket_name, existing.object_prefix)
    _upload_csv_map(bucket=bucket, prefix=prefix, csv_map=csv_map)

    upsert_user_dataset(
        user_id=user_id,
        database_name=name,
        source_type="user",
        bucket_name=bucket,
        object_prefix=prefix,
        is_default=False,
        hidden=False,
    )
    clear_schema_preview_cache(name)
    return DatabaseSummary(
        name=name,
        tables=sorted(PurePosixPath(f).stem.lower() for f in csv_map.keys()),
        is_default=False,
    )


def create_database_from_sql(
    database: str,
    sql_script: str,
    *,
    user_id: Optional[str] = None,
) -> DatabaseSummary:
    if not user_id:
        raise ValueError("Authenticated user id is required for dataset import.")

    name = _normalise_database_name(database)
    default_rows = _default_rows_by_name()
    if name in default_rows:
        raise ValueError(
            f"Database '{name}' is a shared default name and cannot be overwritten."
        )

    user_rows = _user_rows_by_name(user_id)
    existing = user_rows.get(name)
    if existing and existing.source_type == "user" and not existing.hidden:
        raise FileExistsError(f"Database '{name}' already exists")

    csv_map = _extract_csv_map_from_sql(sql_script)
    bucket = os.getenv("SUPABASE_USER_DATASETS_BUCKET", "ra-user-datasets")
    prefix = _user_dataset_prefix(user_id, name)
    if existing and existing.source_type == "user":
        storage_delete_prefix(existing.bucket_name, existing.object_prefix)
    _upload_csv_map(bucket=bucket, prefix=prefix, csv_map=csv_map)

    upsert_user_dataset(
        user_id=user_id,
        database_name=name,
        source_type="user",
        bucket_name=bucket,
        object_prefix=prefix,
        is_default=False,
        hidden=False,
    )
    clear_schema_preview_cache(name)
    return DatabaseSummary(
        name=name,
        tables=sorted(PurePosixPath(f).stem.lower() for f in csv_map.keys()),
        is_default=False,
    )


def delete_database(database: str, *, user_id: Optional[str] = None) -> None:
    if not user_id:
        raise ValueError("Authenticated user id is required.")

    name = _normalise_database_name(database)
    default_rows = _default_rows_by_name()
    user_rows = _user_rows_by_name(user_id)

    if name in default_rows:
        default_row = default_rows[name]
        upsert_user_dataset(
            user_id=user_id,
            database_name=name,
            source_type="default",
            bucket_name=default_row.bucket_name,
            object_prefix=default_row.object_prefix,
            is_default=True,
            hidden=True,
        )
        clear_schema_preview_cache(name)
        return

    row = user_rows.get(name)
    if row and row.source_type == "user":
        try:
            storage_delete_prefix(row.bucket_name, row.object_prefix)
        except SupabaseStorageError as exc:
            raise FileNotFoundError(str(exc)) from exc
        delete_user_dataset_row(user_id, name)
        clear_schema_preview_cache(name)
        return

    raise FileNotFoundError(f"Database '{name}' not found")


def is_default_database(database: str) -> bool:
    name = _normalise_database_name(database)
    return name in _default_rows_by_name()


def _load_relation_dataframe(bucket: str, object_path: str, relation_name: str) -> pd.DataFrame:
    raw = storage_download_object(bucket, object_path)
    df = pd.read_csv(io.BytesIO(raw))
    df = df.copy()
    df.columns = [c.lower() for c in df.columns]
    df["_prov"] = [[(relation_name, int(i))] for i in range(len(df))]
    return df


def load_database_env(
    database: str,
    *,
    user_id: Optional[str] = None,
) -> Dict[str, pd.DataFrame]:
    location = _resolve_location(database, user_id)
    names = storage_list_objects(location.bucket, location.prefix)
    csv_names = [name for name in names if PurePosixPath(name).suffix.lower() == ".csv"]
    if not csv_names:
        raise ValueError(f"Database '{database}' does not contain any CSV files")

    env: Dict[str, pd.DataFrame] = {}
    for name in sorted(csv_names):
        relation = PurePosixPath(name).stem.lower()
        object_path = _join_prefix(location.prefix, name)
        env[relation] = _load_relation_dataframe(location.bucket, object_path, relation)
    return env


def get_database_schema(
    database: str,
    sample_rows: int = 10,
    *,
    user_id: Optional[str] = None,
) -> DatabaseSchema:
    key = _schema_cache_key(database, sample_rows, user_id)
    cached = _SCHEMA_PREVIEW_CACHE.get(key)
    if cached is not None:
        return cached

    location = _resolve_location(database, user_id)
    names = storage_list_objects(location.bucket, location.prefix)
    csv_names = [name for name in names if PurePosixPath(name).suffix.lower() == ".csv"]
    if not csv_names:
        raise ValueError(f"Database '{database}' does not contain any CSV files")

    tables: List[TableSchema] = []
    for name in sorted(csv_names):
        relation = PurePosixPath(name).stem.lower()
        object_path = _join_prefix(location.prefix, name)
        raw = storage_download_object(location.bucket, object_path)
        row_count = _approximate_csv_row_count(raw)
        preview_df = pd.read_csv(io.BytesIO(raw), nrows=max(sample_rows, 0))
        preview_df = preview_df.copy()
        preview_df.columns = [c.lower() for c in preview_df.columns]
        columns = [
            ColumnSchema(name=col, dtype=str(preview_df[col].dtype))
            for col in preview_df.columns
        ]
        preview_df = preview_df.where(pd.notnull(preview_df), None)
        sample = preview_df.to_dict(orient="records")
        tables.append(
            TableSchema(
                name=relation,
                columns=columns,
                row_count=row_count,
                sample_rows=sample,
            )
        )
    schema = DatabaseSchema(name=database, tables=tables)
    _SCHEMA_PREVIEW_CACHE[key] = schema
    return schema


def get_table_schema(
    database: str,
    relation: str,
    sample_rows: int = 10,
    *,
    user_id: Optional[str] = None,
) -> TableSchema:
    location = _resolve_location(database, user_id)
    relation_lower = relation.lower()
    object_name = f"{relation_lower}.csv"
    names = storage_list_objects(location.bucket, location.prefix)
    if object_name not in names:
        raise FileNotFoundError(
            f"Relation '{relation}' not found in database '{database}'"
        )
    object_path = _join_prefix(location.prefix, object_name)
    raw = storage_download_object(location.bucket, object_path)
    df = pd.read_csv(io.BytesIO(raw))
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


def read_database_file_bytes(
    database: str,
    filename: str,
    *,
    user_id: Optional[str] = None,
) -> bytes:
    location = _resolve_location(database, user_id)
    object_path = _join_prefix(location.prefix, filename)
    try:
        return storage_download_object(location.bucket, object_path)
    except SupabaseStorageError as exc:
        raise FileNotFoundError(str(exc)) from exc
