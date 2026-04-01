from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import Dict, List

import pandas as pd

from . import datasets
from .exceptions import EvaluationError


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


def evaluate_sql(
    sql: str,
    database: str,
    *,
    user_id: str | None = None,
) -> SqlEvaluationResult:
    env = datasets.load_database_env(database, user_id=user_id)

    try:
        with sqlite3.connect(":memory:") as conn:
            for relation_name, df in env.items():
                relation_df = df.drop(columns=["_prov"], errors="ignore").copy()
                relation_df.to_sql(relation_name, conn, index=False, if_exists="replace")
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
