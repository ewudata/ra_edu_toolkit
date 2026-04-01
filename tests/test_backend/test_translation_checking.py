from types import SimpleNamespace

import pandas as pd
from fastapi.testclient import TestClient

from backend.main import app
from backend.routes import evaluation
from backend.services.auth import require_current_user
from backend.services.grading import compare_results


def _client_with_user():
    app.dependency_overrides[require_current_user] = lambda: {"id": "u1"}
    return TestClient(app)


def test_compare_results_accepts_same_columns_in_different_order():
    student = SimpleNamespace(dataframe=pd.DataFrame([{"name": "Ada", "id": 1}]))
    solution = SimpleNamespace(dataframe=pd.DataFrame([{"id": 1, "name": "Ada"}]))

    diff = compare_results(student, solution)

    assert diff.matches is True
    assert diff.schema_equal is True
    assert diff.student_schema == ["id", "name"]
    assert diff.solution_schema == ["id", "name"]


def test_check_translation_ra_to_sql_uses_semantic_comparison(monkeypatch):
    client = _client_with_user()

    monkeypatch.setattr(
        evaluation.queries_service,
        "get_query",
        lambda database, query_id, user_id=None: SimpleNamespace(
            solution=SimpleNamespace(
                relational_algebra="pi{id}(students)",
                sql="SELECT id FROM students",
            ),
        ),
    )
    monkeypatch.setattr(
        evaluation.sql_service,
        "evaluate_sql",
        lambda sql, database, user_id=None: SimpleNamespace(
            dataframe=pd.DataFrame([{"id": 1}]),
        ),
        raising=False,
    )

    response = client.post(
        "/databases/TestDB/queries/q1/check-translation",
        json={"direction": "ra-to-sql", "answer": "select id from students;"},
    )

    assert response.status_code == 200
    assert response.json()["is_correct"] is True
    app.dependency_overrides.clear()


def test_check_translation_sql_to_ra_compares_ra_against_sql_solution(monkeypatch):
    client = _client_with_user()

    monkeypatch.setattr(
        evaluation.queries_service,
        "get_query",
        lambda database, query_id, user_id=None: SimpleNamespace(
            solution=SimpleNamespace(
                relational_algebra="pi{id}(students)",
                sql="SELECT id FROM students",
            ),
        ),
    )
    monkeypatch.setattr(
        evaluation.relalg_service,
        "evaluate_expression",
        lambda expression, database, user_id=None: SimpleNamespace(
            dataframe=pd.DataFrame([{"id": 1}]),
        ),
        raising=False,
    )
    monkeypatch.setattr(
        evaluation.sql_service,
        "evaluate_sql",
        lambda sql, database, user_id=None: SimpleNamespace(
            dataframe=pd.DataFrame([{"id": 1}]),
        ),
        raising=False,
    )

    response = client.post(
        "/databases/TestDB/queries/q1/check-translation",
        json={"direction": "sql-to-ra", "answer": "pi{id}(students)"},
    )

    assert response.status_code == 200
    assert response.json()["is_correct"] is True
    app.dependency_overrides.clear()
