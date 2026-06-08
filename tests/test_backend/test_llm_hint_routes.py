from types import SimpleNamespace

import pandas as pd
from fastapi.testclient import TestClient

from backend.main import app
from backend.routes import llm
from backend.services.auth import require_current_user


def _client_with_user():
    app.dependency_overrides[require_current_user] = lambda: {"id": "u1"}
    return TestClient(app)


def test_generate_hint_passes_evaluation_context_without_solution(monkeypatch):
    client = _client_with_user()
    captured = {}

    monkeypatch.setattr(
        llm.queries_service,
        "get_query",
        lambda database, query_id, user_id=None: SimpleNamespace(
            prompt="List student names.",
            difficulty="beginner",
            hints=["selection", "projection"],
            solution=SimpleNamespace(relational_algebra="pi{name}(students)"),
        ),
    )
    monkeypatch.setattr(
        llm.datasets_service,
        "get_database_schema",
        lambda database, sample_rows=0, user_id=None: SimpleNamespace(
            tables=[
                SimpleNamespace(
                    name="students",
                    columns=[
                        SimpleNamespace(name="id", dtype="int64"),
                        SimpleNamespace(name="name", dtype="object"),
                    ],
                )
            ]
        ),
    )

    def evaluate_expression(expression, database, user_id=None):
        if expression == "pi{name}(students)":
            return SimpleNamespace(
                schema=["name"],
                rows=[{"name": "Ada"}],
                dataframe=pd.DataFrame([{"name": "Ada"}]),
                trace=[{"op": "projection"}],
            )
        return SimpleNamespace(
            schema=["id"],
            rows=[{"id": 1}],
            dataframe=pd.DataFrame([{"id": 1}]),
            trace=[{"op": "projection"}],
        )

    monkeypatch.setattr(llm.relalg_service, "evaluate_expression", evaluate_expression)
    monkeypatch.setattr(
        llm.grading_service,
        "compare_results",
        lambda student, solution: SimpleNamespace(
            matches=False,
            schema_equal=False,
            solution_schema=["name"],
            missing_rows=[{"name": "Ada"}],
            extra_rows=[{"id": 1}],
        ),
    )

    def fake_generate_ra_hint(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(hint="Check whether your projection keeps the requested attribute.", model="test-model")

    monkeypatch.setattr(llm.llm_service, "generate_ra_hint", fake_generate_ra_hint)

    response = client.post(
        "/databases/TestDB/queries/q1/llm/hint",
        json={"expression": "pi{id}(students)"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "hint": "Check whether your projection keeps the requested attribute.",
        "model": "test-model",
    }
    assert captured["prompt"] == "List student names."
    assert captured["student_expression"] == "pi{id}(students)"
    assert captured["evaluation_context"]["matches_expected"] is False
    assert captured["evaluation_context"]["missing_row_count"] == 1
    assert "pi{name}(students)" not in str(captured)
    app.dependency_overrides.clear()


def test_generate_hint_returns_503_when_llm_is_not_configured(monkeypatch):
    client = _client_with_user()

    monkeypatch.setattr(
        llm.queries_service,
        "get_query",
        lambda database, query_id, user_id=None: SimpleNamespace(
            prompt="List student names.",
            difficulty="beginner",
            hints=["projection"],
            solution=SimpleNamespace(relational_algebra=None),
        ),
    )
    monkeypatch.setattr(
        llm.datasets_service,
        "get_database_schema",
        lambda database, sample_rows=0, user_id=None: SimpleNamespace(tables=[]),
    )
    monkeypatch.setattr(
        llm.llm_service,
        "generate_ra_hint",
        lambda **kwargs: (_ for _ in ()).throw(
            llm.llm_service.LlmConfigurationError("LLM features are disabled.")
        ),
    )

    response = client.post("/databases/TestDB/queries/q1/llm/hint", json={})

    assert response.status_code == 503
    assert response.json()["detail"] == "LLM features are disabled."
    app.dependency_overrides.clear()


def test_generate_hint_can_use_translation_check_context(monkeypatch):
    client = _client_with_user()
    captured = {}

    monkeypatch.setattr(
        llm.queries_service,
        "get_query",
        lambda database, query_id, user_id=None: SimpleNamespace(
            prompt="List student names.",
            difficulty="beginner",
            hints=["projection"],
            solution=SimpleNamespace(
                relational_algebra="pi{name}(students)",
                sql="SELECT name FROM students",
            ),
        ),
    )
    monkeypatch.setattr(
        llm.datasets_service,
        "get_database_schema",
        lambda database, sample_rows=0, user_id=None: SimpleNamespace(tables=[]),
    )
    monkeypatch.setattr(
        llm.sql_service,
        "evaluate_sql",
        lambda sql, database, user_id=None: SimpleNamespace(
            dataframe=pd.DataFrame([{"id": 1}])
            if "id" in sql
            else pd.DataFrame([{"name": "Ada"}])
        ),
    )
    monkeypatch.setattr(
        llm.grading_service,
        "compare_results",
        lambda student, solution: SimpleNamespace(
            matches=False,
            schema_equal=False,
            solution_schema=["name"],
            missing_rows=[],
            extra_rows=[],
        ),
    )

    def fake_generate_ra_hint(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(hint="Project the name attribute, not the id.", model="test-model")

    monkeypatch.setattr(llm.llm_service, "generate_ra_hint", fake_generate_ra_hint)

    response = client.post(
        "/databases/TestDB/queries/q1/llm/hint",
        json={"direction": "ra-to-sql", "expression": "SELECT id FROM students"},
    )

    assert response.status_code == 200
    assert response.json()["hint"] == "Project the name attribute, not the id."
    assert captured["student_expression"] == "SELECT id FROM students"
    assert captured["evaluation_context"]["task"] == "translation_check"
    assert captured["evaluation_context"]["direction"] == "ra-to-sql"
    assert captured["evaluation_context"]["matches_expected"] is False
    assert captured["evaluation_context"]["schema_equal"] is False
    app.dependency_overrides.clear()
