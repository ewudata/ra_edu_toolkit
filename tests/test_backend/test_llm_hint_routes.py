from types import SimpleNamespace

import pandas as pd
from fastapi.testclient import TestClient

from backend.main import app
from backend.routes import llm
from backend.services.auth import require_current_user
from backend.services import llm as llm_service


def _client_with_user():
    app.dependency_overrides[require_current_user] = lambda: {"id": "u1"}
    return TestClient(app)


def test_llm_text_limit_truncates_long_output():
    text = " ".join(f"word{i}" for i in range(50))

    limited = llm_service._limit_words(text, 10)

    assert limited == "word0 word1 word2 word3 word4 word5 word6 word7 word8 word9..."


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
    assert captured["evaluation_context"]["student_rows_sample"] == [{"id": 1}]
    assert captured["evaluation_context"]["missing_rows_sample"] == [{"name": "Ada"}]
    assert captured["evaluation_context"]["extra_rows_sample"] == [{"id": 1}]
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
            missing_rows=[{"name": "Ada"}],
            extra_rows=[{"id": 1}],
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
    assert captured["evaluation_context"]["source_expression"] == "pi{name}(students)"
    assert captured["evaluation_context"]["canonical_target_expression"] == "SELECT name FROM students"
    assert captured["evaluation_context"]["matches_expected"] is False
    assert captured["evaluation_context"]["schema_equal"] is False
    assert captured["evaluation_context"]["missing_rows_sample"] == [{"name": "Ada"}]
    assert captured["evaluation_context"]["extra_rows_sample"] == [{"id": 1}]
    app.dependency_overrides.clear()


def test_translation_hint_prompt_targets_single_specific_error(monkeypatch):
    captured = {}
    monkeypatch.setenv("LLM_BASE_URL", "http://llm.test")
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    monkeypatch.setenv("LLM_MODEL", "test-model")

    def fake_chat_completion(**kwargs):
        captured.update(kwargs)
        return {"choices": [{"message": {"content": "Your projection returns id, but the target needs name."}}]}

    monkeypatch.setattr(llm_service, "_chat_completion", fake_chat_completion)

    response = llm_service.generate_ra_hint(
        database="TestDB",
        prompt="List student names.",
        difficulty="beginner",
        expected_operators=["projection"],
        schema=[],
        student_expression="SELECT id FROM students",
        evaluation_context={
            "task": "translation_check",
            "direction": "ra-to-sql",
            "source_expression": "pi{name}(students)",
            "canonical_target_expression": "SELECT name FROM students",
            "matches_expected": False,
            "schema_equal": False,
            "student_schema": ["id"],
            "expected_schema": ["name"],
            "missing_rows_sample": [{"name": "Ada"}],
            "extra_rows_sample": [{"id": 1}],
        },
    )

    assert response.hint == "Your projection returns id, but the target needs name."
    assert "targeted at the student's main underlying error" in captured["system_prompt"]
    assert "Read the entire deterministic context before choosing the hint focus" in captured["system_prompt"]
    assert "Do not list multiple possible problems" in captured["system_prompt"]
    assert "Canonical target expression for diagnosis only, do not reveal it" in captured["user_prompt"]
    assert "Mention the most important concrete mismatch" in captured["user_prompt"]


def test_ra_exercise_hint_prompt_targets_main_underlying_error(monkeypatch):
    captured = {}
    monkeypatch.setenv("LLM_BASE_URL", "http://llm.test")
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    monkeypatch.setenv("LLM_MODEL", "test-model")

    def fake_chat_completion(**kwargs):
        captured.update(kwargs)
        return {"choices": [{"message": {"content": "Check whether your projection keeps the requested attribute."}}]}

    monkeypatch.setattr(llm_service, "_chat_completion", fake_chat_completion)

    response = llm_service.generate_ra_hint(
        database="TestDB",
        prompt="List student names.",
        difficulty="beginner",
        expected_operators=["projection"],
        schema=[],
        student_expression="pi{id}(students)",
        evaluation_context={
            "status": "evaluated",
            "matches_expected": False,
            "schema_equal": False,
            "student_schema": ["id"],
            "expected_schema": ["name"],
            "missing_rows_sample": [{"name": "Ada"}],
            "extra_rows_sample": [{"id": 1}],
        },
    )

    assert response.hint == "Check whether your projection keeps the requested attribute."
    assert "targeted at the student's main underlying error" in captured["system_prompt"]
    assert "Read the entire deterministic context before choosing the hint focus" in captured["system_prompt"]
    assert "Do not list multiple possible problems" in captured["system_prompt"]
    assert "Mention the most important concrete mismatch" in captured["user_prompt"]


def test_explain_error_uses_deterministic_parse_error_context(monkeypatch):
    client = _client_with_user()
    captured = {}

    monkeypatch.setattr(
        llm.datasets_service,
        "get_database_schema",
        lambda database, sample_rows=0, user_id=None: SimpleNamespace(
            tables=[
                SimpleNamespace(
                    name="students",
                    columns=[SimpleNamespace(name="id", dtype="int64")],
                )
            ]
        ),
    )
    monkeypatch.setattr(
        llm.relalg_service,
        "evaluate_expression",
        lambda expression, database, user_id=None: (_ for _ in ()).throw(
            llm.ParseError(
                message="Unexpected token",
                expression=expression,
                line=1,
                column=12,
                context="sigma condition",
            )
        ),
    )

    def fake_explain_ra_error(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(
            explanation="The selection operator is missing braces around its condition.",
            hint="Use sigma{condition}(Relation).",
            model="test-model",
        )

    monkeypatch.setattr(llm.llm_service, "explain_ra_error", fake_explain_ra_error)

    response = client.post(
        "/databases/TestDB/llm/explain-error",
        json={"expression": "sigma id = 1(students)"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "explanation": "The selection operator is missing braces around its condition.",
        "hint": "Use sigma{condition}(Relation).",
        "model": "test-model",
    }
    assert captured["expression"] == "sigma id = 1(students)"
    assert captured["error_context"]["type"] == "parse_error"
    assert captured["error_context"]["column"] == 12
    assert "Selection:" in captured["grammar_help"]
    app.dependency_overrides.clear()


def test_explain_error_rejects_expression_without_deterministic_error(monkeypatch):
    client = _client_with_user()

    monkeypatch.setattr(
        llm.datasets_service,
        "get_database_schema",
        lambda database, sample_rows=0, user_id=None: SimpleNamespace(tables=[]),
    )
    monkeypatch.setattr(
        llm.relalg_service,
        "evaluate_expression",
        lambda expression, database, user_id=None: SimpleNamespace(rows=[]),
    )

    response = client.post(
        "/databases/TestDB/llm/explain-error",
        json={"expression": "students"},
    )

    assert response.status_code == 400
    assert "evaluates successfully" in response.json()["detail"]
    app.dependency_overrides.clear()
