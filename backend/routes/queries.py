from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..services import queries as queries_service
from ..services.auth import require_current_user
from ..services.exceptions import DatabaseNotFound, QueryNotFound
from ..services.learning_progress import list_attempted_query_ids, list_mastered_query_ids
from ..services.queries import QueryDetail, QuerySummary

_HINT_NORMALIZE: Dict[str, str] = {
    "project": "projection",
    "pi": "projection",
    "π": "projection",
    "select": "selection",
    "sigma": "selection",
    "σ": "selection",
    "intersect": "intersection",
    "renaming": "rename",
    "rho": "rename",
    "ρ": "rename",
    "join": "natural join",
    "product": "cartesian product",
    "cross product": "cartesian product",
    "set union": "union",
    "set difference": "difference",
    "set intersection": "intersection",
    "div": "division",
}


def _normalize_hint(hint: str) -> str:
    key = hint.strip().lower()
    return _HINT_NORMALIZE.get(key, key)

router = APIRouter(prefix="/databases/{database}/queries", tags=["queries"])


class SolutionSpecResponse(BaseModel):
    relational_algebra: Optional[str] = None
    sql: Optional[str] = None


class QuerySummaryResponse(BaseModel):
    id: str
    prompt: str
    difficulty: Optional[str] = None
    hints: List[str] = Field(default_factory=list)

    @classmethod
    def from_summary(cls, summary: QuerySummary) -> "QuerySummaryResponse":
        return cls(
            id=summary.id,
            prompt=summary.prompt,
            difficulty=summary.difficulty,
            hints=summary.hints or [],
        )


class QueryDetailResponse(QuerySummaryResponse):
    solution: SolutionSpecResponse
    expected_schema: Optional[List[str]] = None
    expected_rows: Optional[List[Dict[str, Any]]] = None

    @classmethod
    def from_detail(cls, detail: QueryDetail) -> "QueryDetailResponse":
        return cls(
            id=detail.id,
            difficulty=detail.difficulty,
            prompt=detail.prompt,
            hints=detail.hints or [],
            solution=SolutionSpecResponse(
                relational_algebra=detail.solution.relational_algebra,
                sql=detail.solution.sql,
            ),
            expected_schema=detail.expected_schema,
            expected_rows=detail.expected_rows,
        )


class QueryMasteryResponse(BaseModel):
    query_ids: List[str] = Field(default_factory=list)


class OperatorProgressItem(BaseModel):
    operator: str
    total: int
    mastered: int
    attempted: int


class OperatorProgressResponse(BaseModel):
    items: List[OperatorProgressItem] = Field(default_factory=list)
    total_queries: int = 0
    attempted_queries: int = 0
    mastered_queries: int = 0


@router.get("/", response_model=List[QuerySummaryResponse])
def list_queries_for_database(
    database: str,
    user: Dict[str, Any] = Depends(require_current_user),
) -> List[QuerySummaryResponse]:
    try:
        summaries = queries_service.list_queries(database, user_id=user["id"])
    except DatabaseNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except QueryNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    return [QuerySummaryResponse.from_summary(summary) for summary in summaries]


@router.get("/mastery", response_model=QueryMasteryResponse)
def get_query_mastery(
    database: str,
    user: Dict[str, Any] = Depends(require_current_user),
) -> QueryMasteryResponse:
    query_ids = sorted(
        list_mastered_query_ids(user_id=user["id"], database_name=database)
    )
    return QueryMasteryResponse(query_ids=query_ids)


@router.get("/operator-progress", response_model=OperatorProgressResponse)
def get_operator_progress(
    database: str,
    user: Dict[str, Any] = Depends(require_current_user),
) -> OperatorProgressResponse:
    try:
        queries = queries_service.list_queries(database, user_id=user["id"])
    except (DatabaseNotFound, QueryNotFound) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    mastered = list_mastered_query_ids(user_id=user["id"], database_name=database)
    attempted = list_attempted_query_ids(user_id=user["id"], database_name=database)

    op_total: Dict[str, set] = defaultdict(set)
    op_mastered: Dict[str, set] = defaultdict(set)
    op_attempted: Dict[str, set] = defaultdict(set)
    for q in queries:
        for hint in q.hints:
            op = _normalize_hint(hint)
            op_total[op].add(q.id)
            if q.id in mastered:
                op_mastered[op].add(q.id)
            if q.id in attempted:
                op_attempted[op].add(q.id)

    items = sorted(
        [
            OperatorProgressItem(
                operator=op,
                total=len(op_total[op]),
                mastered=len(op_mastered[op]),
                attempted=len(op_attempted[op]),
            )
            for op in op_total
        ],
        key=lambda x: x.operator,
    )
    return OperatorProgressResponse(
        items=items,
        total_queries=len(queries),
        attempted_queries=len(attempted),
        mastered_queries=len(mastered),
    )


@router.get("/{query_id}", response_model=QueryDetailResponse)
def get_query_detail(
    database: str,
    query_id: str,
    user: Dict[str, Any] = Depends(require_current_user),
) -> QueryDetailResponse:
    try:
        detail = queries_service.get_query(database, query_id, user_id=user["id"])
    except DatabaseNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except QueryNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    return QueryDetailResponse.from_detail(detail)
