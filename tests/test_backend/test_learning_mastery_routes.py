from types import SimpleNamespace

import pandas as pd
from fastapi.testclient import TestClient

from backend.main import app
from backend.routes import evaluation, queries
from backend.services.auth import require_current_user


def _client_with_user():
    app.dependency_overrides[require_current_user] = lambda: {"id": "u1"}
    return TestClient(app)


def test_list_mastered_queries_returns_ids_for_current_user(monkeypatch):
    client = _client_with_user()
    monkeypatch.setattr(
        queries,
        "list_mastered_query_ids",
        lambda user_id, database_name: {"q3", "q1"},
        raising=False,
    )

    response = client.get("/databases/TestDB/queries/mastery")

    assert response.status_code == 200
    assert response.json() == {"query_ids": ["q1", "q3"]}
    app.dependency_overrides.clear()


def test_correct_query_evaluation_records_mastery(monkeypatch):
    client = _client_with_user()
    recorded = {}

    monkeypatch.setattr(
        evaluation.queries_service,
        "get_query",
        lambda database, query_id, user_id=None: SimpleNamespace(
            expected_schema=["id"],
            expected_rows=[{"id": 1}],
            solution=SimpleNamespace(relational_algebra="pi id (students)", sql=None),
        ),
    )

    monkeypatch.setattr(
        evaluation.relalg_service,
        "evaluate_expression",
        lambda expression, database, user_id=None: SimpleNamespace(
            schema=["id"],
            rows=[{"id": 1}],
            dataframe=pd.DataFrame([{"id": 1}]),
            trace=[],
        ),
    )
    monkeypatch.setattr(
        evaluation.grading_service,
        "compare_results",
        lambda student, solution: SimpleNamespace(matches=True),
        raising=False,
    )
    monkeypatch.setattr(
        evaluation,
        "upsert_query_mastery",
        lambda **kwargs: recorded.update(kwargs),
        raising=False,
    )

    response = client.post(
        "/databases/TestDB/queries/q1/evaluate",
        json={"expression": "pi id (students)"},
    )

    assert response.status_code == 200
    assert recorded == {
        "user_id": "u1",
        "database_name": "TestDB",
        "query_id": "q1",
    }
    app.dependency_overrides.clear()


def test_incorrect_query_evaluation_does_not_record_mastery(monkeypatch):
    client = _client_with_user()
    recorded = {"called": False}

    monkeypatch.setattr(
        evaluation.queries_service,
        "get_query",
        lambda database, query_id, user_id=None: SimpleNamespace(
            expected_schema=["id"],
            expected_rows=[{"id": 1}],
            solution=SimpleNamespace(relational_algebra="pi id (students)", sql=None),
        ),
    )
    monkeypatch.setattr(
        evaluation.relalg_service,
        "evaluate_expression",
        lambda expression, database, user_id=None: SimpleNamespace(
            schema=["id"],
            rows=[{"id": 2}],
            dataframe=pd.DataFrame([{"id": 2}]),
            trace=[],
        ),
    )
    monkeypatch.setattr(
        evaluation.grading_service,
        "compare_results",
        lambda student, solution: SimpleNamespace(matches=False),
        raising=False,
    )
    monkeypatch.setattr(
        evaluation,
        "upsert_query_mastery",
        lambda **kwargs: recorded.update(called=True),
        raising=False,
    )

    response = client.post(
        "/databases/TestDB/queries/q1/evaluate",
        json={"expression": "pi id (students)"},
    )

    assert response.status_code == 200
    assert recorded == {"called": False}
    app.dependency_overrides.clear()
