from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from ...services import queries as queries_service
from ...services.exceptions import DatabaseNotFound, QueryNotFound
from ...services.queries import QueryDetail, QuerySummary

router = APIRouter(prefix="/databases/{database}/queries", tags=["queries"])


class SolutionSpecResponse(BaseModel):
    relational_algebra: Optional[str] = None
    sql: Optional[str] = None


class QuerySummaryResponse(BaseModel):
    id: str
    title: str
    prompt: str
    difficulty: Optional[str] = None
    tags: List[str]

    @classmethod
    def from_summary(cls, summary: QuerySummary) -> "QuerySummaryResponse":
        return cls(
            id=summary.id,
            title=summary.title,
            prompt=summary.prompt,
            difficulty=summary.difficulty,
            tags=summary.tags or [],
        )


class QueryDetailResponse(QuerySummaryResponse):
    hints: List[str]
    solution: SolutionSpecResponse
    expected_schema: Optional[List[str]] = None
    expected_rows: Optional[List[Dict[str, Any]]] = None

    @classmethod
    def from_detail(cls, detail: QueryDetail) -> "QueryDetailResponse":
        return cls(
            id=detail.id,
            title=detail.title,
            difficulty=detail.difficulty,
            tags=detail.tags or [],
            prompt=detail.prompt,
            hints=detail.hints or [],
            solution=SolutionSpecResponse(
                relational_algebra=detail.solution.relational_algebra,
                sql=detail.solution.sql,
            ),
            expected_schema=detail.expected_schema,
            expected_rows=detail.expected_rows,
        )


@router.get("/", response_model=List[QuerySummaryResponse])
def list_queries_for_database(database: str) -> List[QuerySummaryResponse]:
    try:
        summaries = queries_service.list_queries(database)
    except DatabaseNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except QueryNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    return [QuerySummaryResponse.from_summary(summary) for summary in summaries]


@router.get("/{query_id}", response_model=QueryDetailResponse)
def get_query_detail(database: str, query_id: str) -> QueryDetailResponse:
    try:
        detail = queries_service.get_query(database, query_id)
    except DatabaseNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except QueryNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    return QueryDetailResponse.from_detail(detail)
