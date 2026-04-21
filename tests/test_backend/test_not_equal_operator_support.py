from pathlib import Path

import pandas as pd

from backend.core import evaluator, stepper
from backend.services import sql as sql_service


def _load_university_env():
    root = Path(__file__).resolve().parents[2] / "datasets" / "University"
    env = {}
    for csv_path in root.glob("*.csv"):
        relation = csv_path.stem.lower()
        df = pd.read_csv(csv_path).copy()
        df.columns = [c.lower() for c in df.columns]
        df["_prov"] = [[(relation, int(i))] for i in range(len(df))]
        env[relation] = df
    return env


def _evaluate_ra(expression: str) -> list[dict[str, object]]:
    ast = stepper.parse(expression)
    result = evaluator.eval(ast, _load_university_env(), [])
    visible = [c for c in result.columns if c != "_prov"]
    return result[visible].to_dict(orient="records")


def test_relational_algebra_accepts_bang_equals_and_angle_brackets_as_not_equal():
    bang_equals = _evaluate_ra(
        "pi{id}(sigma{dept_name != 'Comp. Sci.'}(student))"
    )
    angle_brackets = _evaluate_ra(
        "pi{id}(sigma{dept_name <> 'Comp. Sci.'}(student))"
    )

    assert bang_equals == angle_brackets
    assert bang_equals


def test_sql_accepts_bang_equals_and_angle_brackets_as_not_equal(monkeypatch):
    monkeypatch.setattr(sql_service.datasets, "load_database_env", lambda database, user_id=None: _load_university_env())

    bang_equals = sql_service.evaluate_sql(
        "SELECT id FROM student WHERE dept_name != 'Comp. Sci.' ORDER BY id",
        "University",
    )
    angle_brackets = sql_service.evaluate_sql(
        "SELECT id FROM student WHERE dept_name <> 'Comp. Sci.' ORDER BY id",
        "University",
    )

    assert bang_equals.rows == angle_brackets.rows
    assert bang_equals.rows
