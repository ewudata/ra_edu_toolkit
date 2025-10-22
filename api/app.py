from __future__ import annotations

from typing import List

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .services import datasets
from .services.datasets import DatabaseSummary

app = FastAPI(title="RA Education Toolkit API")


class DatabaseSummaryResponse(BaseModel):
    name: str
    tables: List[str]
    table_count: int


@app.get("/databases", response_model=List[DatabaseSummaryResponse])
def list_available_databases() -> List[DatabaseSummaryResponse]:
    """Expose the catalog of sample databases bundled with the toolkit."""

    try:
        databases: List[DatabaseSummary] = datasets.list_databases()
    except FileNotFoundError as exc:  # pragma: no cover - infrastructure issue
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return [
        DatabaseSummaryResponse(
            name=db.name,
            tables=db.tables,
            table_count=db.table_count,
        )
        for db in databases
    ]
