from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel

from ..services import datasets
from ..services.datasets import DatabaseSchema, DatabaseSummary, TableSchema

router = APIRouter(prefix="/databases", tags=["databases"])


class DatabaseSummaryResponse(BaseModel):
    name: str
    tables: List[str]
    table_count: int

    @classmethod
    def from_summary(cls, summary: DatabaseSummary) -> "DatabaseSummaryResponse":
        return cls(
            name=summary.name, tables=summary.tables, table_count=summary.table_count
        )


class ColumnSchemaResponse(BaseModel):
    name: str
    dtype: str


class TableSchemaResponse(BaseModel):
    name: str
    columns: List[ColumnSchemaResponse]
    row_count: int
    sample_rows: List[Dict[str, Any]]

    @classmethod
    def from_table(cls, table: TableSchema) -> "TableSchemaResponse":
        return cls(
            name=table.name,
            columns=[
                ColumnSchemaResponse(name=column.name, dtype=column.dtype)
                for column in table.columns
            ],
            row_count=table.row_count,
            sample_rows=table.sample_rows,
        )


class DatabaseSchemaResponse(BaseModel):
    name: str
    tables: List[TableSchemaResponse]

    @classmethod
    def from_schema(cls, schema: DatabaseSchema) -> "DatabaseSchemaResponse":
        return cls(
            name=schema.name,
            tables=[TableSchemaResponse.from_table(table) for table in schema.tables],
        )


@router.get("/", response_model=List[DatabaseSummaryResponse])
def list_available_databases() -> List[DatabaseSummaryResponse]:
    """Expose the catalog of sample databases bundled with the toolkit."""

    try:
        databases: List[DatabaseSummary] = datasets.list_databases()
    except FileNotFoundError as exc:  # pragma: no cover - infrastructure issue
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return [DatabaseSummaryResponse.from_summary(db) for db in databases]


@router.post(
    "/import/zip",
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
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc
    except datasets.SqlImportError as exc:
        detail = {"message": str(exc)}
        if exc.line is not None:
            detail["line"] = exc.line
        if exc.statement:
            detail["statement"] = exc.statement
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
        ) from exc
    except ValueError as exc:
        raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
    ) from exc
    return DatabaseSummaryResponse.from_summary(summary)


@router.get(
    "/{database}/schema",
    response_model=DatabaseSchemaResponse,
)
def get_database_schema(
    database: str,
    sample_rows: int = 5,
) -> DatabaseSchemaResponse:
    """Return column metadata and a row preview for each table in a database."""

    try:
        schema = datasets.get_database_schema(database, sample_rows=sample_rows)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    return DatabaseSchemaResponse.from_schema(schema)


@router.post(
    "/import/sql",
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
            raise HTTPException(
                status_code=400, detail="SQL script must be UTF-8 encoded"
            ) from exc
        summary = datasets.create_database_from_sql(name, sql_script)
    except FileExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    return DatabaseSummaryResponse.from_summary(summary)
