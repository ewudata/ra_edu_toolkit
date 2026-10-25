from __future__ import annotations

import sqlite3
import time
import os
from contextlib import closing
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

    with closing(sqlite3.connect(":memory:")) as conn:
        for relation_name, df in env.items():
            relation_df = df.drop(columns=["_prov"], errors="ignore").copy()
            relation_df.to_sql(relation_name, conn, index=False, if_exists="replace")
        return conn.serialize()


def _connection_from_snapshot(snapshot: bytes) -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.deserialize(snapshot)
    conn.execute("PRAGMA query_only = ON")
    allowed = {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION, sqlite3.SQLITE_RECURSIVE}
    def authorize(action, arg1, arg2, database, trigger):
        if action not in allowed or (action == sqlite3.SQLITE_FUNCTION and str(arg2).lower() == "load_extension"):
            return sqlite3.SQLITE_DENY
        return sqlite3.SQLITE_OK
    conn.set_authorizer(authorize)
    deadline = time.monotonic() + float(os.getenv("RA_EVALUATION_TIMEOUT_SECONDS", "5"))
    conn.set_progress_handler(lambda: int(time.monotonic() > deadline), 1000)
    conn.setlimit(sqlite3.SQLITE_LIMIT_LENGTH, 1000000)
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
        with closing(_connection_from_snapshot(snapshot)) as conn:
            cursor = conn.execute(sql)
            if cursor.description is None:
                raise EvaluationError("Only read-only queries are allowed.")
            records = []
            result_bytes = 0
            for row in cursor:
                result_bytes += sum(len(str(value)) for value in row)
                if len(records) >= 50000 or result_bytes > 8 * 1024 * 1024:
                    raise EvaluationError("Result exceeds the size limit. Narrow the query first.")
                records.append(row)
            result_df = pd.DataFrame.from_records(records, columns=[item[0] for item in cursor.description])
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
