from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator

from ..services import (
    datasets as datasets_service,
    grading as grading_service,
    llm as llm_service,
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

router = APIRouter(prefix="/databases/{database}/queries/{query_id}/llm", tags=["llm"])
database_router = APIRouter(prefix="/databases/{database}/llm", tags=["llm"])

RA_GRAMMAR_HELP = "\n".join(
    [
        "Projection: π{attr1, attr2}(Relation) or pi{attr1, attr2}(Relation)",
        "Selection: σ{condition}(Relation) or sigma{condition}(Relation)",
        "Rename: ρ{old->new}(Relation), rho{old->new}(Relation), or rho alias(Relation)",
        "Natural join: R ⋈ S; accepted aliases: ⋈, natural_join, natjoin, njoin",
        "Theta join: R ⋈{left_attr = right_attr} S",
        "Set operations: R ∪ S, R - S, R ∩ S",
        "Conditions use attributes, comparison operators, quoted strings, AND/OR, IS NULL, and IS NOT NULL.",
        "Operator arguments use braces; relation inputs use parentheses.",
    ]
)


def _sample_rows(rows: List[Dict[str, Any]], limit: int = 3) -> List[Dict[str, Any]]:
    return rows[:limit]


class HintRequest(BaseModel):
    expression: Optional[str] = None
    error: Optional[str] = None
    direction: Optional[Literal["ra-to-sql", "sql-to-ra"]] = None

    @field_validator("expression", "error", mode="before")
    @classmethod
    def _strip_optional_text(cls, value: Any) -> Any:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value


class HintResponse(BaseModel):
    hint: str
    model: str


class ErrorExplanationRequest(BaseModel):
    expression: str

    @field_validator("expression", mode="before")
    @classmethod
    def _strip_expression(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip()
        return value


class ErrorExplanationResponse(BaseModel):
    explanation: str
    hint: str
    model: str


def _schema_context(database: str, user_id: str) -> List[Dict[str, Any]]:
    schema = datasets_service.get_database_schema(database, sample_rows=0, user_id=user_id)
    return [
        {
            "name": table.name,
            "columns": [
                {"name": column.name, "type": column.dtype}
                for column in table.columns
            ],
        }
        for table in schema.tables
    ]


def _evaluation_context(
    *,
    database: str,
    expression: Optional[str],
    solution_expression: Optional[str],
    user_id: str,
    request_error: Optional[str],
) -> Dict[str, Any]:
    context: Dict[str, Any] = {
        "status": "not_attempted",
        "request_error": request_error,
    }
    if not expression:
        return context

    try:
        student_result = relalg_service.evaluate_expression(
            expression,
            database,
            user_id=user_id,
        )
    except ParseError as exc:
        return {
            "status": "parse_error",
            "message": exc.message,
            "line": exc.line,
            "column": exc.column,
            "context": exc.context,
            "request_error": request_error,
        }
    except EvaluationError as exc:
        return {
            "status": "evaluation_error",
            "message": str(exc),
            "request_error": request_error,
        }

    context = {
        "status": "evaluated",
        "student_schema": student_result.schema,
        "student_row_count": len(student_result.dataframe),
        "student_rows_sample": _sample_rows(student_result.rows),
        "trace_ops": [str(step.get("op", "")) for step in student_result.trace],
        "request_error": request_error,
    }

    if solution_expression:
        solution_result = relalg_service.evaluate_expression(
            solution_expression,
            database,
            user_id=user_id,
        )
        comparison = grading_service.compare_results(student_result, solution_result)
        context.update(
            {
                "matches_expected": comparison.matches,
                "schema_equal": comparison.schema_equal,
                "expected_schema": comparison.solution_schema,
                "expected_row_count": len(solution_result.dataframe),
                "missing_row_count": len(comparison.missing_rows),
                "extra_row_count": len(comparison.extra_rows),
                "missing_rows_sample": _sample_rows(comparison.missing_rows),
                "extra_rows_sample": _sample_rows(comparison.extra_rows),
            }
        )

    return context


def _translation_context(
    *,
    database: str,
    direction: Literal["ra-to-sql", "sql-to-ra"],
    answer: Optional[str],
    solution_ra: Optional[str],
    solution_sql: Optional[str],
    user_id: str,
    request_error: Optional[str],
) -> Dict[str, Any]:
    context: Dict[str, Any] = {
        "status": "not_attempted",
        "task": "translation_check",
        "direction": direction,
        "request_error": request_error,
        "source_language": "relational_algebra" if direction == "ra-to-sql" else "sql",
        "target_language": "sql" if direction == "ra-to-sql" else "relational_algebra",
        "source_expression": solution_ra if direction == "ra-to-sql" else solution_sql,
        "canonical_target_expression": solution_sql if direction == "ra-to-sql" else solution_ra,
    }
    if not answer:
        return context

    try:
        if direction == "ra-to-sql":
            if not solution_sql:
                return {
                    **context,
                    "status": "missing_solution",
                    "message": "This query does not have a canonical SQL solution.",
                }
            student_result = sql_service.evaluate_sql(answer, database, user_id=user_id)
            expected_result = sql_service.evaluate_sql(solution_sql, database, user_id=user_id)
        else:
            if not solution_sql:
                return {
                    **context,
                    "status": "missing_solution",
                    "message": "This query does not have a canonical SQL solution.",
                }
            if not solution_ra:
                return {
                    **context,
                    "status": "missing_solution",
                    "message": "This query does not have a canonical relational algebra solution.",
                }
            student_result = relalg_service.evaluate_expression(answer, database, user_id=user_id)
            expected_result = sql_service.evaluate_sql(solution_sql, database, user_id=user_id)
    except ParseError as exc:
        return {
            **context,
            "status": "parse_error",
            "message": exc.message,
            "line": exc.line,
            "column": exc.column,
            "context": exc.context,
        }
    except EvaluationError as exc:
        return {
            **context,
            "status": "evaluation_error",
            "message": str(exc),
        }

    comparison = grading_service.compare_results(student_result, expected_result)
    return {
        **context,
        "status": "evaluated",
        "student_schema": list(student_result.dataframe.columns),
        "student_row_count": len(student_result.dataframe),
        "matches_expected": comparison.matches,
        "schema_equal": comparison.schema_equal,
        "expected_schema": comparison.solution_schema,
        "expected_row_count": len(expected_result.dataframe),
        "missing_row_count": len(comparison.missing_rows),
        "extra_row_count": len(comparison.extra_rows),
        "missing_rows_sample": _sample_rows(comparison.missing_rows),
        "extra_rows_sample": _sample_rows(comparison.extra_rows),
    }


@router.post("/hint", response_model=HintResponse)
def generate_hint(
    database: str,
    query_id: str,
    payload: HintRequest,
    user: Dict[str, Any] = Depends(require_current_user),
) -> HintResponse:
    try:
        detail = queries_service.get_query(database, query_id, user_id=user["id"])
        schema = _schema_context(database, user["id"])
        if payload.direction:
            context = _translation_context(
                database=database,
                direction=payload.direction,
                answer=payload.expression,
                solution_ra=detail.solution.relational_algebra,
                solution_sql=detail.solution.sql,
                user_id=user["id"],
                request_error=payload.error,
            )
        else:
            context = _evaluation_context(
                database=database,
                expression=payload.expression,
                solution_expression=detail.solution.relational_algebra,
                user_id=user["id"],
                request_error=payload.error,
            )
        response = llm_service.generate_ra_hint(
            database=database,
            prompt=detail.prompt,
            difficulty=detail.difficulty,
            expected_operators=detail.hints,
            schema=schema,
            student_expression=payload.expression,
            evaluation_context=context,
        )
    except DatabaseNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except QueryNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except llm_service.LlmConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    except llm_service.LlmProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)
        ) from exc
    except EvaluationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    return HintResponse(hint=response.hint, model=response.model)


@database_router.post("/explain-error", response_model=ErrorExplanationResponse)
def explain_error(
    database: str,
    payload: ErrorExplanationRequest,
    user: Dict[str, Any] = Depends(require_current_user),
) -> ErrorExplanationResponse:
    if not payload.expression:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Expression must be provided.",
        )

    try:
        schema = _schema_context(database, user["id"])
        try:
            relalg_service.evaluate_expression(
                payload.expression,
                database,
                user_id=user["id"],
            )
        except ParseError as exc:
            error_context = {
                "type": "parse_error",
                "message": exc.message,
                "line": exc.line,
                "column": exc.column,
                "context": exc.context,
            }
        except EvaluationError as exc:
            error_context = {
                "type": "evaluation_error",
                "message": str(exc),
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Expression evaluates successfully; there is no RA error to explain.",
            )

        response = llm_service.explain_ra_error(
            database=database,
            expression=payload.expression,
            error_context=error_context,
            schema=schema,
            grammar_help=RA_GRAMMAR_HELP,
        )
    except DatabaseNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except llm_service.LlmConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    except llm_service.LlmProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)
        ) from exc

    return ErrorExplanationResponse(
        explanation=response.explanation,
        hint=response.hint,
        model=response.model,
    )
