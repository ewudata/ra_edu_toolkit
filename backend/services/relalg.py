from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

import pandas as pd
from lark import LarkError, UnexpectedInput

from ..core import evaluator as evaluator_mod
from ..core import stepper as stepper_mod
from . import datasets
from .exceptions import EvaluationError, ParseError

_EXPECTED_TOKEN_LABELS = {
    "JOIN": "⋈, natural_join, natjoin, or njoin (aliases are case-insensitive)",
    "PRODUCT": "×, x, or cross (aliases are case-insensitive)",
    "UNION": "∪ or union (case-insensitive)",
    "DIFF": "−, -, or diff (case-insensitive)",
    "INTERSECT": "∩ or intersect (case-insensitive)",
    "DIV": "÷, /, or div (case-insensitive)",
    "RPAR": ")",
    "LPAR": "(",
    "NAME": "a relation or attribute name",
    "PI": "π or pi (case-insensitive)",
    "SIGMA": "σ or sigma (case-insensitive)",
    "RHO": "ρ or rho (case-insensitive)",
}

_EXPECTED_TOKEN_ORDER = [
    "JOIN",
    "PRODUCT",
    "UNION",
    "DIFF",
    "INTERSECT",
    "DIV",
    "RPAR",
    "LPAR",
    "NAME",
    "PI",
    "SIGMA",
    "RHO",
]


def _friendly_expected_tokens(expected: object) -> str:
    if not expected:
        return ""

    expected_set = {str(token) for token in expected}
    ordered = [token for token in _EXPECTED_TOKEN_ORDER if token in expected_set]
    ordered.extend(sorted(expected_set - set(ordered)))
    labels = [_EXPECTED_TOKEN_LABELS.get(token, token.lower()) for token in ordered]
    return ", ".join(labels)


def _friendly_parse_message(exc: LarkError) -> str:
    line = getattr(exc, "line", None)
    column = getattr(exc, "column", None)
    expected = _friendly_expected_tokens(getattr(exc, "expected", None))
    token = getattr(exc, "token", None)

    if token is not None:
        value = getattr(token, "value", str(token))
        if line is not None and column is not None:
            message = f'Unexpected token "{value}" at line {line}, column {column}.'
        else:
            message = f'Unexpected token "{value}".'
        if expected:
            message += f" Expected one of: {expected}."
        if str(value).lower() == "join":
            message += " For natural join, use ⋈, natural_join, natjoin, or njoin; aliases are case-insensitive."
        return message

    message = str(exc).strip()
    for token, label in _EXPECTED_TOKEN_LABELS.items():
        message = message.replace(f"* {token}", f"* {label}")
    return message


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
    message = _friendly_parse_message(exc)
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


def evaluate_expression(
    expression: str, database: str, *, user_id: str | None = None
) -> EvaluationResult:
    """Parse and evaluate a relational algebra expression against a database."""

    env = datasets.load_database_env(database, user_id=user_id)
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
