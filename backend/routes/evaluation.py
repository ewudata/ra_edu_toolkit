from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Dict, List, Optional
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..services import (
    grading as grading_service,
    queries as queries_service,
    relalg as relalg_service,
    sql as sql_service,
)
from ..services.auth import require_current_user
from ..services.exceptions import (
    DatabaseNotFound,
    EvaluationError,
    ParseError,
    QueryNotFound,
)
from ..services.learning_progress import record_query_attempt, upsert_query_mastery

router = APIRouter(
    prefix="/databases/{database}/queries/{query_id}", tags=["evaluation"]
)

# Custom query evaluation router (without query_id)
custom_router = APIRouter(prefix="/databases/{database}", tags=["evaluation"])


class QueryEvaluationRequest(BaseModel):
    expression: str = Field(..., min_length=1, strip_whitespace=True)


class SqlEvaluationRequest(BaseModel):
    sql: str = Field(..., min_length=1, strip_whitespace=True)


class QueryEvaluationResponse(BaseModel):
    database: str
    query_id: str
    expression: str
    is_correct: Optional[bool] = None
    schema_eval: List[str]
    rows: List[Dict[str, Any]]
    row_count: int
    trace: List[Dict[str, Any]]
    expected_schema: Optional[List[str]] = None
    expected_rows: Optional[List[Dict[str, Any]]] = None
    solution_relational_algebra: Optional[str] = None
    solution_sql: Optional[str] = None


class TranslationCheckRequest(BaseModel):
    direction: Literal["ra-to-sql", "sql-to-ra"]
    answer: str = Field(..., min_length=1, strip_whitespace=True)


class TranslationCheckResponse(BaseModel):
    database: str
    query_id: str
    direction: Literal["ra-to-sql", "sql-to-ra"]
    answer: str
    is_correct: bool
    schema_equal: bool
    student_schema: List[str]
    expected_schema: List[str]
    missing_rows: List[Dict[str, Any]]
    extra_rows: List[Dict[str, Any]]


@router.post("/evaluate", response_model=QueryEvaluationResponse)
def evaluate_query_expression(
    database: str,
    query_id: str,
    payload: QueryEvaluationRequest,
    user: Dict[str, Any] = Depends(require_current_user),
) -> QueryEvaluationResponse:
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

    try:
        evaluation = relalg_service.evaluate_expression(
            payload.expression,
            database,
            user_id=user["id"],
        )
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

    solution_expression = detail.solution.relational_algebra
    is_correct = None
    if solution_expression:
        solution_result = relalg_service.evaluate_expression(
            solution_expression,
            database,
            user_id=user["id"],
        )
        comparison = grading_service.compare_results(evaluation, solution_result)
        is_correct = comparison.matches
        record_query_attempt(
            user_id=user["id"],
            database_name=database,
            query_id=query_id,
            is_correct=is_correct,
        )
        if is_correct:
            upsert_query_mastery(
                user_id=user["id"],
                database_name=database,
                query_id=query_id,
            )

    return QueryEvaluationResponse(
        database=database,
        query_id=query_id,
        expression=payload.expression,
        is_correct=is_correct,
        schema_eval=evaluation.schema,
        rows=evaluation.rows,
        row_count=len(evaluation.dataframe),
        trace=evaluation.trace,
        expected_schema=detail.expected_schema,
        expected_rows=detail.expected_rows,
        solution_relational_algebra=detail.solution.relational_algebra,
        solution_sql=detail.solution.sql,
    )


@router.post("/check-translation", response_model=TranslationCheckResponse)
def check_query_translation(
    database: str,
    query_id: str,
    payload: TranslationCheckRequest,
    user: Dict[str, Any] = Depends(require_current_user),
) -> TranslationCheckResponse:
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

    try:
        if payload.direction == "ra-to-sql":
            if not detail.solution.sql:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This query does not have a canonical SQL solution.",
                )
            student_result = sql_service.evaluate_sql(
                payload.answer,
                database,
                user_id=user["id"],
            )
            expected_result = sql_service.evaluate_sql(
                detail.solution.sql,
                database,
                user_id=user["id"],
            )
        else:
            if not detail.solution.relational_algebra:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This query does not have a canonical relational algebra solution.",
                )
            if not detail.solution.sql:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This query does not have a canonical SQL solution.",
                )
            student_result = relalg_service.evaluate_expression(
                payload.answer,
                database,
                user_id=user["id"],
            )
            expected_result = sql_service.evaluate_sql(
                detail.solution.sql,
                database,
                user_id=user["id"],
            )

        comparison = grading_service.compare_results(
            SimpleNamespace(dataframe=student_result.dataframe),
            SimpleNamespace(dataframe=expected_result.dataframe),
        )
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

    return TranslationCheckResponse(
        database=database,
        query_id=query_id,
        direction=payload.direction,
        answer=payload.answer,
        is_correct=comparison.matches,
        schema_equal=comparison.schema_equal,
        student_schema=comparison.student_schema,
        expected_schema=comparison.solution_schema,
        missing_rows=comparison.missing_rows,
        extra_rows=comparison.extra_rows,
    )


@custom_router.post("/evaluate", response_model=QueryEvaluationResponse)
def evaluate_custom_query(
    database: str,
    payload: QueryEvaluationRequest,
    user: Dict[str, Any] = Depends(require_current_user),
) -> QueryEvaluationResponse:
    """Evaluate a custom relational algebra expression without requiring a query_id"""
    try:
        evaluation = relalg_service.evaluate_expression(
            payload.expression,
            database,
            user_id=user["id"],
        )
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


@custom_router.post("/evaluate-sql", response_model=QueryEvaluationResponse)
def evaluate_custom_sql_query(
    database: str,
    payload: SqlEvaluationRequest,
    user: Dict[str, Any] = Depends(require_current_user),
) -> QueryEvaluationResponse:
    """Evaluate a custom SQL statement without requiring a query_id"""
    try:
        evaluation = sql_service.evaluate_sql(
            payload.sql,
            database,
            user_id=user["id"],
        )
    except EvaluationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    return QueryEvaluationResponse(
        database=database,
        query_id="custom-sql",
        expression=payload.sql,
        schema_eval=evaluation.schema,
        rows=evaluation.rows,
        row_count=len(evaluation.dataframe),
        trace=[],
        expected_schema=None,
        expected_rows=None,
        solution_relational_algebra=None,
        solution_sql=None,
    )
