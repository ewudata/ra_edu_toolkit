from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from ..services import queries as queries_service, relalg as relalg_service
from ..services.exceptions import (
    DatabaseNotFound,
    EvaluationError,
    ParseError,
    QueryNotFound,
)

router = APIRouter(
    prefix="/databases/{database}/queries/{query_id}", tags=["evaluation"]
)

# Custom query evaluation router (without query_id)
custom_router = APIRouter(prefix="/databases/{database}", tags=["evaluation"])


class QueryEvaluationRequest(BaseModel):
    expression: str = Field(..., min_length=1, strip_whitespace=True)


class QueryEvaluationResponse(BaseModel):
    database: str
    query_id: str
    expression: str
    schema_eval: List[str]
    rows: List[Dict[str, Any]]
    row_count: int
    trace: List[Dict[str, Any]]
    expected_schema: Optional[List[str]] = None
    expected_rows: Optional[List[Dict[str, Any]]] = None
    solution_relational_algebra: Optional[str] = None
    solution_sql: Optional[str] = None


@router.post("/evaluate", response_model=QueryEvaluationResponse)
def evaluate_query_expression(
    database: str, query_id: str, payload: QueryEvaluationRequest
) -> QueryEvaluationResponse:
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

    try:
        evaluation = relalg_service.evaluate_expression(payload.expression, database)
    except ParseError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": exc.message,
                "line": exc.line,
                "column": exc.column,
                "context": exc.context,
            },
        ) from exc
    except EvaluationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    return QueryEvaluationResponse(
        database=database,
        query_id=query_id,
        expression=payload.expression,
        schema_eval=evaluation.schema,
        rows=evaluation.rows,
        row_count=len(evaluation.dataframe),
        trace=evaluation.trace,
        expected_schema=detail.expected_schema,
        expected_rows=detail.expected_rows,
        solution_relational_algebra=detail.solution.relational_algebra,
        solution_sql=detail.solution.sql,
    )


@custom_router.post("/evaluate", response_model=QueryEvaluationResponse)
def evaluate_custom_query(
    database: str, payload: QueryEvaluationRequest
) -> QueryEvaluationResponse:
    """Evaluate a custom relational algebra expression without requiring a query_id"""
    try:
        evaluation = relalg_service.evaluate_expression(payload.expression, database)
    except ParseError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": exc.message,
                "line": exc.line,
                "column": exc.column,
                "context": exc.context,
            },
        ) from exc
    except EvaluationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    return QueryEvaluationResponse(
        database=database,
        query_id="custom",
        expression=payload.expression,
        schema_eval=evaluation.schema,
        rows=evaluation.rows,
        row_count=len(evaluation.dataframe),
        trace=evaluation.trace,
        expected_schema=None,
        expected_rows=None,
        solution_relational_algebra=None,
        solution_sql=None,
    )
