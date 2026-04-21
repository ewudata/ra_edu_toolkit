from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import Dict, List

import pandas as pd

from . import datasets
from .exceptions import EvaluationError

_SQLITE_DB_CACHE: Dict[tuple[str, str], bytes] = {}


@dataclass
class SqlEvaluationResult:
    database: str
    sql: str
    schema: List[str]
    rows: List[Dict[str, object]]
    dataframe: pd.DataFrame


def _rows_from_dataframe(df: pd.DataFrame) -> List[Dict[str, object]]:
    preview = df.copy()
    preview = preview.where(pd.notnull(preview), None)
    return preview.to_dict(orient="records")


def _sqlite_cache_key(database: str, user_id: str | None) -> tuple[str, str]:
    return user_id or "", database


def clear_sqlite_cache(database: str | None = None) -> None:
    if database is None:
        _SQLITE_DB_CACHE.clear()
        return

    stale_keys = [key for key in _SQLITE_DB_CACHE if key[1] == database]
    for key in stale_keys:
        _SQLITE_DB_CACHE.pop(key, None)


def _build_sqlite_snapshot(database: str, *, user_id: str | None = None) -> bytes:
    env = datasets.load_database_env(database, user_id=user_id)

    with sqlite3.connect(":memory:") as conn:
        for relation_name, df in env.items():
            relation_df = df.drop(columns=["_prov"], errors="ignore").copy()
            relation_df.to_sql(relation_name, conn, index=False, if_exists="replace")
        return conn.serialize()


def _connection_from_snapshot(snapshot: bytes) -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.deserialize(snapshot)
    return conn


def evaluate_sql(
    sql: str,
    database: str,
    *,
    user_id: str | None = None,
) -> SqlEvaluationResult:
    cache_key = _sqlite_cache_key(database, user_id)
    snapshot = _SQLITE_DB_CACHE.get(cache_key)
    if snapshot is None:
        snapshot = _build_sqlite_snapshot(database, user_id=user_id)
        _SQLITE_DB_CACHE[cache_key] = snapshot

    try:
        with _connection_from_snapshot(snapshot) as conn:
            result_df = pd.read_sql_query(sql, conn)
    except (sqlite3.Error, pd.errors.DatabaseError) as exc:
        raise EvaluationError(str(exc)) from exc

    result_df = result_df.copy()
    result_df.columns = [str(column).lower() for column in result_df.columns]
    schema = list(result_df.columns)
    rows = _rows_from_dataframe(result_df)
    return SqlEvaluationResult(
        database=database,
        sql=sql,
        schema=schema,
        rows=rows,
        dataframe=result_df,
    )
