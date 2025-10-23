from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

import pandas as pd
from lark import LarkError, UnexpectedInput

from ..core import evaluator as evaluator_mod
from ..core import stepper as stepper_mod
from . import datasets
from .exceptions import EvaluationError, ParseError


@dataclass
class EvaluationResult:
    """Normalized relational algebra evaluation output."""

    database: str
    expression: str
    schema: List[str]
    rows: List[Dict[str, object]]
    trace: List[Dict[str, object]]
    dataframe: pd.DataFrame  # raw result with provenance

    def to_dict(self) -> Dict[str, object]:  # pragma: no cover - convenience for JSON
        return {
            "database": self.database,
            "expression": self.expression,
            "schema": self.schema,
            "rows": self.rows,
            "trace": self.trace,
        }


def _format_parse_error(expression: str, exc: LarkError) -> ParseError:
    line = getattr(exc, "line", None)
    column = getattr(exc, "column", None)
    context = None
    if hasattr(exc, "get_context"):
        try:
            context = exc.get_context(expression)  # type: ignore[arg-type]
        except Exception:  # pragma: no cover - fallback only
            context = None
    message = str(exc).strip()
    return ParseError(
        message=message,
        expression=expression,
        line=line,
        column=column,
        context=context,
    )


def _rows_from_dataframe(df: pd.DataFrame) -> List[Dict[str, object]]:
    schema = [c for c in df.columns if c != "_prov"]
    if not schema:
        return []
    preview = df[schema].copy()
    preview = preview.where(pd.notnull(preview), None)
    return preview.to_dict(orient="records")


def evaluate_expression(expression: str, database: str) -> EvaluationResult:
    """Parse and evaluate a relational algebra expression against a database."""

    env = datasets.load_database_env(database)
    try:
        ast = stepper_mod.parse(expression)
    except UnexpectedInput as exc:
        raise _format_parse_error(expression, exc) from exc
    except LarkError as exc:
        raise _format_parse_error(expression, exc) from exc

    steps: List[Dict[str, object]] = []
    try:
        df = evaluator_mod.eval(ast, env, steps)
    except Exception as exc:  # pragma: no cover - propagate rich error upstream
        raise EvaluationError(str(exc)) from exc

    schema = [c for c in df.columns if c != "_prov"]
    rows = _rows_from_dataframe(df)
    return EvaluationResult(
        database=database,
        expression=expression,
        schema=schema,
        rows=rows,
        trace=steps,
        dataframe=df,
    )
