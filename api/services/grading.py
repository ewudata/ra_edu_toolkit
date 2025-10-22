from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

import pandas as pd

from . import queries, relalg
from .exceptions import ServiceError


@dataclass
class ComparisonDiff:
    matches: bool
    schema_equal: bool
    student_schema: List[str]
    solution_schema: List[str]
    missing_rows: List[Dict[str, object]]
    extra_rows: List[Dict[str, object]]


@dataclass
class GradingResult:
    student: relalg.EvaluationResult
    solution: relalg.EvaluationResult
    diff: ComparisonDiff

    @property
    def is_correct(self) -> bool:
        return self.diff.matches


def _normalize(df: pd.DataFrame) -> pd.DataFrame:
    schema = [c for c in df.columns if c != "_prov"]
    trimmed = df[schema].copy()
    trimmed = trimmed.where(pd.notnull(trimmed), None)
    return trimmed


def _rows_set(df: pd.DataFrame, schema: List[str]) -> set[tuple]:
    tuples = []
    for _, row in df[schema].iterrows():
        tuples.append(tuple(row[col] for col in schema))
    return set(tuples)


def compare_results(student: relalg.EvaluationResult, solution: relalg.EvaluationResult) -> ComparisonDiff:
    student_df = _normalize(student.dataframe)
    solution_df = _normalize(solution.dataframe)

    student_schema = list(student_df.columns)
    solution_schema = list(solution_df.columns)
    schema_equal = student_schema == solution_schema

    if not schema_equal:
        return ComparisonDiff(
            matches=False,
            schema_equal=False,
            student_schema=student_schema,
            solution_schema=solution_schema,
            missing_rows=[],
            extra_rows=[],
        )

    # Ensure duplicates removed for comparison purposes
    student_unique = student_df.drop_duplicates().reset_index(drop=True)
    solution_unique = solution_df.drop_duplicates().reset_index(drop=True)

    student_set = _rows_set(student_unique, student_schema)
    solution_set = _rows_set(solution_unique, solution_schema)

    missing = solution_set - student_set
    extra = student_set - solution_set

    def tuples_to_dicts(items: set[tuple]) -> List[Dict[str, object]]:
        return [dict(zip(solution_schema, values)) for values in items]

    matches = not missing and not extra

    return ComparisonDiff(
        matches=matches,
        schema_equal=True,
        student_schema=student_schema,
        solution_schema=solution_schema,
        missing_rows=tuples_to_dicts(missing),
        extra_rows=tuples_to_dicts(extra),
    )


def grade_submission(database: str, query_id: str, expression: str) -> GradingResult:
    query = queries.get_query(database, query_id)
    if not query.solution.relational_algebra:
        raise ServiceError(
            f"Query '{query_id}' for database '{database}' does not have a canonical relational algebra solution."
        )

    solution_result = relalg.evaluate_expression(query.solution.relational_algebra, database)
    student_result = relalg.evaluate_expression(expression, database)

    diff = compare_results(student_result, solution_result)
    return GradingResult(student=student_result, solution=solution_result, diff=diff)
