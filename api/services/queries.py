from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
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
    title: str
    difficulty: Optional[str]
    tags: List[str]


@dataclass
class QueryDetail(QuerySummary):
    prompt: str
    hints: List[str]
    solution: SolutionSpec
    expected_schema: Optional[List[str]]
    expected_rows: Optional[List[dict]]


def _catalog_path(database: str) -> Path:
    for db in datasets.list_databases():
        if db.name == database:
            return datasets.DATASETS_ROOT / database / CATALOG_FILENAME
    raise DatabaseNotFound(f"Database '{database}' not found")


@lru_cache(maxsize=32)
def _load_catalog(database: str) -> dict:
    path = _catalog_path(database)
    if not path.exists():
        raise QueryNotFound(
            f"Catalog file '{CATALOG_FILENAME}' not found for database '{database}'"
        )
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def list_queries(database: str) -> List[QuerySummary]:
    catalog = _load_catalog(database)
    summaries: List[QuerySummary] = []
    for question in catalog.get("questions", []):
        summaries.append(
            QuerySummary(
                id=question["id"],
                title=question.get("title", question["id"]),
                difficulty=question.get("difficulty"),
                tags=question.get("tags", []),
            )
        )
    return summaries


def get_query(database: str, query_id: str) -> QueryDetail:
    catalog = _load_catalog(database)
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
                title=question.get("title", question["id"]),
                difficulty=question.get("difficulty"),
                tags=question.get("tags", []),
                prompt=question.get("prompt", ""),
                hints=question.get("hints", []),
                solution=solution,
                expected_schema=expected.get("schema"),
                expected_rows=expected.get("rows"),
            )
    raise QueryNotFound(f"Query '{query_id}' not found for database '{database}'")
