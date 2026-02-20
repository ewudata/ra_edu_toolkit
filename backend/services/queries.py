from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from typing import List, Optional

from . import datasets
from .exceptions import DatabaseNotFound, QueryNotFound


CATALOG_FILENAME = "catalog.json"


@dataclass
class SolutionSpec:
    relational_algebra: Optional[str]
    sql: Optional[str]


@dataclass
class QuerySummary:
    id: str
    prompt: str
    difficulty: Optional[str]
    hints: List[str]


@dataclass
class QueryDetail(QuerySummary):
    solution: SolutionSpec
    expected_schema: Optional[List[str]]
    expected_rows: Optional[List[dict]]


@lru_cache(maxsize=32)
def _load_catalog(database: str, user_id: Optional[str]) -> dict:
    try:
        raw = datasets.read_database_file_bytes(
            database, CATALOG_FILENAME, user_id=user_id
        )
    except FileNotFoundError:
        raise QueryNotFound(
            f"Catalog file '{CATALOG_FILENAME}' not found for database '{database}'"
        )
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise QueryNotFound(
            f"Catalog file '{CATALOG_FILENAME}' is not valid JSON for database '{database}'"
        ) from exc


def list_queries(database: str, user_id: Optional[str] = None) -> List[QuerySummary]:
    catalog = _load_catalog(database, user_id)
    summaries: List[QuerySummary] = []
    for question in catalog.get("questions", []):
        summaries.append(
            QuerySummary(
                id=question["id"],
                prompt=question.get("prompt", ""),
                difficulty=question.get("difficulty"),
                hints=list(question.get("hints", [])),
            )
        )
    return summaries


def get_query(
    database: str, query_id: str, user_id: Optional[str] = None
) -> QueryDetail:
    catalog = _load_catalog(database, user_id)
    for question in catalog.get("questions", []):
        if question["id"] == query_id:
            solution_spec = question.get("solution", {})
            solution = SolutionSpec(
                relational_algebra=solution_spec.get("relational_algebra"),
                sql=solution_spec.get("sql"),
            )
            expected = question.get("expected_result", {})
            return QueryDetail(
                id=question["id"],
                prompt=question.get("prompt", ""),
                difficulty=question.get("difficulty"),
                hints=list(question.get("hints", [])),
                solution=solution,
                expected_schema=expected.get("schema"),
                expected_rows=expected.get("rows"),
            )
    raise QueryNotFound(f"Query '{query_id}' not found for database '{database}'")


def clear_catalog_cache() -> None:
    _load_catalog.cache_clear()
