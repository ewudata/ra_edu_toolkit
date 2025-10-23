from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from .services import datasets
from .services import queries as queries_service
from .services import relalg as relalg_service
from .services.datasets import DatabaseSummary
from .services.exceptions import (
    DatabaseNotFound,
    EvaluationError,
    ParseError,
    QueryNotFound,
)
from .services.queries import QueryDetail, QuerySummary

app = FastAPI(title="RA Education Toolkit API")


class DatabaseSummaryResponse(BaseModel):
    name: str
    tables: List[str]
    table_count: int

    @classmethod
    def from_summary(cls, summary: DatabaseSummary) -> "DatabaseSummaryResponse":
        return cls(name=summary.name, tables=summary.tables, table_count=summary.table_count)


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


class QueryEvaluationRequest(BaseModel):
    expression: str = Field(..., min_length=1, strip_whitespace=True)


class QueryEvaluationResponse(BaseModel):
    database: str
    query_id: str
    expression: str
    schema: List[str]
    rows: List[Dict[str, Any]]
    row_count: int
    trace: List[Dict[str, Any]]
    expected_schema: Optional[List[str]] = None
    expected_rows: Optional[List[Dict[str, Any]]] = None
    solution_relational_algebra: Optional[str] = None
    solution_sql: Optional[str] = None


@app.get("/databases", response_model=List[DatabaseSummaryResponse])
def list_available_databases() -> List[DatabaseSummaryResponse]:
    """Expose the catalog of sample databases bundled with the toolkit."""

    try:
        databases: List[DatabaseSummary] = datasets.list_databases()
    except FileNotFoundError as exc:  # pragma: no cover - infrastructure issue
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return [DatabaseSummaryResponse.from_summary(db) for db in databases]


@app.post(
    "/databases/import/zip",
    response_model=DatabaseSummaryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def import_database_from_zip(
    name: str = Form(...),
    file: UploadFile = File(...),
) -> DatabaseSummaryResponse:
    """Create a new database from an uploaded ZIP archive of CSV files."""

    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Expected a .zip upload")
    try:
        content = await file.read()
        summary = datasets.create_database_from_zip(name, content)
    except FileExistsError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return DatabaseSummaryResponse.from_summary(summary)


@app.post(
    "/databases/import/sql",
    response_model=DatabaseSummaryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def import_database_from_sql(
    name: str = Form(...),
    file: UploadFile = File(...),
) -> DatabaseSummaryResponse:
    """Create a new database from an uploaded SQL script."""

    if not file.filename or not file.filename.lower().endswith(".sql"):
        raise HTTPException(status_code=400, detail="Expected a .sql upload")
    try:
        raw = await file.read()
        try:
            sql_script = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise HTTPException(status_code=400, detail="SQL script must be UTF-8 encoded") from exc
        summary = datasets.create_database_from_sql(name, sql_script)
    except FileExistsError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return DatabaseSummaryResponse.from_summary(summary)


@app.get(
    "/databases/{database}/queries",
    response_model=List[QuerySummaryResponse],
)
def list_queries_for_database(database: str) -> List[QuerySummaryResponse]:
    try:
        summaries = queries_service.list_queries(database)
    except DatabaseNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except QueryNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return [QuerySummaryResponse.from_summary(summary) for summary in summaries]


@app.get(
    "/databases/{database}/queries/{query_id}",
    response_model=QueryDetailResponse,
)
def get_query_detail(database: str, query_id: str) -> QueryDetailResponse:
    try:
        detail = queries_service.get_query(database, query_id)
    except DatabaseNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except QueryNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return QueryDetailResponse.from_detail(detail)


@app.post(
    "/databases/{database}/queries/{query_id}/evaluate",
    response_model=QueryEvaluationResponse,
)
def evaluate_query_expression(
    database: str, query_id: str, payload: QueryEvaluationRequest
) -> QueryEvaluationResponse:
    try:
        detail = queries_service.get_query(database, query_id)
    except DatabaseNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except QueryNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return QueryEvaluationResponse(
        database=database,
        query_id=query_id,
        expression=payload.expression,
        schema=evaluation.schema,
        rows=evaluation.rows,
        row_count=len(evaluation.dataframe),
        trace=evaluation.trace,
        expected_schema=detail.expected_schema,
        expected_rows=detail.expected_rows,
        solution_relational_algebra=detail.solution.relational_algebra,
        solution_sql=detail.solution.sql,
    )
