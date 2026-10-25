from __future__ import annotations

import logging

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.routes import evaluation
from backend.services import auth, datasets, llm, sql, queries
from backend.services.exceptions import EvaluationError
from backend.services.supabase import SupabaseAuthError, SupabaseConfigError


@pytest.fixture
def client(monkeypatch, tmp_path):
    app.dependency_overrides.clear()
    queries.clear_catalog_cache()
    monkeypatch.setenv("RA_RATE_LIMIT_DB", str(tmp_path / "limits.sqlite3"))
    monkeypatch.setenv("RA_GUEST_REQUESTS_PER_MINUTE", "100")
    monkeypatch.setenv("LLM_PRIVACY_REVIEWED", "false")
    default_rows_cache = datasets._default_rows_by_name
    default_rows_cache.cache_clear()
    datasets.clear_database_env_cache()
    datasets.clear_schema_preview_cache()
    sql.clear_sqlite_cache()
    with TestClient(app) as instance:
        yield instance
    app.dependency_overrides.clear()
    queries.clear_catalog_cache()
    default_rows_cache.cache_clear()
    datasets.clear_database_env_cache()
    datasets.clear_schema_preview_cache()
    sql.clear_sqlite_cache()


def forbid(*args, **kwargs):
    pytest.fail("Guest request accessed account data or persisted progress")


def test_guest_default_browsing_never_looks_up_account_data(client, monkeypatch):
    monkeypatch.setattr(datasets, "_user_rows_by_name", forbid)
    monkeypatch.setattr(auth, "verify_access_token", forbid)
    assert {row["name"] for row in client.get("/databases/").json()} == {"Sales", "University"}
    assert client.get("/databases/University/schema").status_code == 200
    catalog = client.get("/databases/University/queries/").json()
    assert catalog
    assert client.get(f'/databases/University/queries/{catalog[0]["id"]}').status_code == 200


def test_guest_checks_correct_incorrect_and_malformed_answers_without_writes(client, monkeypatch):
    monkeypatch.setattr(evaluation, "record_query_attempt", forbid)
    monkeypatch.setattr(evaluation, "upsert_query_mastery", forbid)
    monkeypatch.setattr(datasets, "_user_rows_by_name", forbid)
    catalog = client.get("/databases/University/queries/").json()
    detail = client.get(f'/databases/University/queries/{catalog[0]["id"]}').json()
    endpoint = f'/databases/University/queries/{catalog[0]["id"]}/evaluate'
    correct = client.post(endpoint, json={"expression": detail["solution"]["relational_algebra"]})
    assert correct.status_code == 200, correct.text
    assert correct.json()["is_correct"] is True
    incorrect = client.post(endpoint, json={"expression": "student"})
    assert incorrect.status_code == 200
    assert incorrect.json()["is_correct"] is False
    malformed = client.post(endpoint, json={"expression": "pi{"})
    assert malformed.status_code == 400
    assert "message" in malformed.json()["detail"]


def test_guest_custom_evaluation_and_translation(client, monkeypatch):
    monkeypatch.setattr(evaluation, "record_query_attempt", forbid)
    monkeypatch.setattr(evaluation, "upsert_query_mastery", forbid)
    assert client.post("/databases/University/evaluate", json={"expression": "student"}).status_code == 200
    assert client.post("/databases/University/evaluate-sql", json={"sql": "SELECT * FROM student"}).status_code == 200
    catalog = client.get("/databases/University/queries/").json()
    detail = client.get(f'/databases/University/queries/{catalog[0]["id"]}').json()
    for direction, answer in [("ra-to-sql", detail["solution"]["sql"]), ("sql-to-ra", detail["solution"]["relational_algebra"])]:
        response = client.post(f'/databases/University/queries/{catalog[0]["id"]}/check-translation', json={"direction": direction, "answer": answer})
        assert response.status_code == 200, response.text
        assert response.json()["is_correct"]


@pytest.mark.parametrize("method,path,body", [
    ("post", "/databases/import/sql", None),
    ("post", "/databases/import/zip", None),
    ("delete", "/databases/University", None),
    ("get", "/databases/University/queries/mastery", None),
    ("get", "/databases/University/queries/operator-progress", None),
    ("post", "/databases/University/queries/q1/llm/hint", {}),
    ("post", "/databases/University/queries/q1/llm/walkthrough", None),
    ("post", "/databases/University/llm/explain-error", {"expression": "student"}),
    ("post", "/databases/University/llm/explain-sql-error", {"sql": "select 1"}),
    ("get", "/ai/privacy", None),
])
def test_account_and_ai_routes_reject_guests(client, method, path, body):
    assert client.request(method, path, json=body).status_code == 401


@pytest.mark.parametrize("suffix,method,body", [
    ("schema", "get", None), ("queries/", "get", None),
    ("queries/q1", "get", None), ("evaluate", "post", {"expression": "student"}),
    ("evaluate-sql", "post", {"sql": "SELECT 1"}),
    ("queries/q1/evaluate", "post", {"expression": "student"}),
    ("queries/q1/check-translation", "post", {"direction": "ra-to-sql", "answer": "select 1"}),
])
def test_private_dataset_names_are_not_available_to_guests(client, monkeypatch, suffix, method, body):
    monkeypatch.setattr(datasets, "_user_rows_by_name", forbid)
    assert client.request(method, f"/databases/PrivateCoursework/{suffix}", json=body).status_code == 404


@pytest.mark.parametrize("header", ["", "Basic x", "Bearer ", "Bearer expired"])
def test_supplied_invalid_credentials_do_not_downgrade_to_guest(client, monkeypatch, header):
    def invalid(token):
        raise SupabaseAuthError("Invalid token")
    monkeypatch.setattr(auth, "verify_access_token", invalid)
    assert client.get("/databases/", headers={"Authorization": header}).status_code == 401


def test_auth_configuration_failure_does_not_downgrade(client, monkeypatch):
    def unavailable(token):
        raise SupabaseConfigError("Unavailable")
    monkeypatch.setattr(auth, "verify_access_token", unavailable)
    assert client.get("/databases/", headers={"Authorization": "Bearer valid"}).status_code == 500


def test_rate_limit_is_shared_and_rejects_oversize_requests(client, monkeypatch):
    monkeypatch.setenv("RA_GUEST_REQUESTS_PER_MINUTE", "1")
    assert client.post("/databases/University/evaluate-sql", json={"sql": "select 1"}).status_code == 200
    from backend.services.public_access import check_guest_rate
    assert not check_guest_rate("testclient")
    response = client.post("/databases/University/evaluate-sql", json={"sql": "select 1"})
    assert response.status_code == 429
    assert response.headers["retry-after"] == "60"
    assert client.post("/databases/University/evaluate-sql", content=b"x" * 65537).status_code == 413


@pytest.mark.parametrize("statement", ["ATTACH DATABASE '/tmp/forbidden-ralt.db' AS private", "PRAGMA database_list", "DELETE FROM student", "SELECT load_extension('anything')"])
def test_sql_execution_is_read_only_and_cannot_access_files(client, statement):
    response = client.post("/databases/University/evaluate-sql", json={"sql": statement})
    assert response.status_code == 400


def test_sql_execution_timeout(client, monkeypatch):
    monkeypatch.setenv("RA_EVALUATION_TIMEOUT_SECONDS", "0")
    response = client.post("/databases/University/evaluate-sql", json={"sql": "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<10000000) SELECT sum(x) FROM n"})
    assert response.status_code == 400


def test_ra_worker_can_be_stopped(client, monkeypatch):
    monkeypatch.setenv("RA_EVALUATION_TIMEOUT_SECONDS", "0")
    response = client.post("/databases/University/evaluate", json={"expression": "student"})
    assert response.status_code == 400
    assert "timed out" in response.json()["detail"]


def test_ai_requires_current_disclosure_even_for_members(client, monkeypatch):
    monkeypatch.setattr(auth, "verify_access_token", lambda token: {"id": "member", "email": "private@example.test"})
    headers = {"Authorization": "Bearer member"}
    endpoint = "/databases/University/queries/q1/llm/hint"
    assert client.post(endpoint, headers=headers, json={}).status_code == 503
    monkeypatch.setenv("LLM_PRIVACY_REVIEWED", "true")
    monkeypatch.setenv("LLM_SERVICE_NAME", "School-operated model")
    monkeypatch.setenv("LLM_DATA_POLICY", "Requests are processed on our server. No prompt retention is configured.")
    details = client.get("/ai/privacy", headers=headers).json()
    assert details["available"]
    assert client.post(endpoint, headers=headers, json={}).status_code == 428
    version = details["version"]
    monkeypatch.setenv("LLM_MODEL", "new-model")
    assert client.post(endpoint, headers={**headers, "X-AI-Disclosure": version}, json={}).status_code == 428


def test_ai_payload_minimizes_context_and_does_not_log_answers(monkeypatch, caplog):
    monkeypatch.setenv("LLM_BASE_URL", "http://model.test/v1")
    monkeypatch.setenv("LLM_API_KEY", "secret-key")
    captured = {}
    def completion(**kwargs):
        captured.update(kwargs)
        return {"choices": [{"message": {"content": "Try a projection."}}]}
    monkeypatch.setattr(llm, "_chat_completion", completion)
    with caplog.at_level(logging.INFO):
        llm.generate_ra_hint(database="private-owner-name", prompt="Project ids", difficulty=None, expected_operators=[], schema=[], student_expression="ANSWER_SENTINEL", evaluation_context={"status": "evaluated", "student_row_count": 1, "student_rows_sample": [{"email": "ROW_SENTINEL"}], "email": "ACCOUNT_SENTINEL", "user_id": "USER_SENTINEL", "request_error": "ERROR_SENTINEL"})
    prompt = captured["user_prompt"]
    assert "ANSWER_SENTINEL" in prompt
    for secret in ["ROW_SENTINEL", "ACCOUNT_SENTINEL", "USER_SENTINEL", "ERROR_SENTINEL", "private-owner-name"]:
        assert secret not in prompt
    assert "ANSWER_SENTINEL" not in caplog.text


def test_ai_provider_errors_do_not_expose_request_details(monkeypatch):
    import requests
    def failure(*args, **kwargs):
        raise requests.RequestException("ANSWER_SENTINEL API_KEY_SENTINEL")
    monkeypatch.setattr(llm.requests, "post", failure)
    with pytest.raises(llm.LlmProviderError) as error:
        llm._chat_completion(base_url="http://model.test", api_key="key", model="model", system_prompt="", user_prompt="ANSWER_SENTINEL")
    assert "SENTINEL" not in str(error.value)


@pytest.mark.parametrize("member_first", [True, False])
def test_sql_snapshot_cache_does_not_mix_guest_and_member_data(client, monkeypatch, member_first):
    import pandas as pd
    def data(database, *, user_id=None):
        return {"example": pd.DataFrame([{"value": "private" if user_id else "shared"}])}
    monkeypatch.setattr(datasets, "load_database_env", data)
    order = ["member", None] if member_first else [None, "member"]
    for identity in order:
        result = sql.evaluate_sql("SELECT value FROM example", "University", user_id=identity)
        assert result.rows == [{"value": "private" if identity else "shared"}]


@pytest.mark.parametrize("order", [("member", None), (None, "member")])
def test_same_named_catalogs_and_schema_caches_are_isolated(client, monkeypatch, order):
    import json
    from backend.services.supabase import DefaultDatasetRow, UserDatasetRow
    monkeypatch.setattr(datasets, "_default_rows_by_name", lambda: {"Shared": DefaultDatasetRow("Shared", "defaults", "shared", True)})
    monkeypatch.setattr(datasets, "_user_rows_by_name", lambda user: {"Shared": UserDatasetRow("Shared", "user", "users", "private", False, False)})
    monkeypatch.setattr(datasets, "storage_list_objects", lambda bucket, prefix: ["example.csv", "catalog.json"])
    def download(bucket, object_path):
        identity = "private" if bucket == "users" else "shared"
        if object_path.endswith("catalog.json"):
            return json.dumps({"questions": [{"id": "q1", "prompt": identity}]}).encode()
        return f"value\n{identity}\n".encode()
    monkeypatch.setattr(datasets, "storage_download_object", download)
    monkeypatch.setattr(auth, "verify_access_token", lambda token: {"id": "member"})
    for identity in order:
        headers = {"Authorization": "Bearer member"} if identity else {}
        expected = "private" if identity else "shared"
        schema = client.get("/databases/Shared/schema", headers=headers)
        assert schema.status_code == 200, schema.text
        assert schema.json()["tables"][0]["sample_rows"] == [{"value": expected}]
        catalog = client.get("/databases/Shared/queries/", headers=headers)
        assert catalog.json()[0]["prompt"] == expected
        env = datasets.load_database_env("Shared", user_id=identity)
        assert env["example"].iloc[0]["value"] == expected


def test_preview_truncation_does_not_change_grading(client, monkeypatch):
    from types import SimpleNamespace
    full = "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1000) SELECT x FROM n"
    short = "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<500) SELECT x FROM n"
    preview = client.post("/databases/University/evaluate-sql", json={"sql": full})
    assert preview.status_code == 200
    assert preview.json()["row_count"] == 1000
    assert len(preview.json()["rows"]) == 500
    monkeypatch.setattr(evaluation.queries_service, "get_query", lambda *args, **kwargs: SimpleNamespace(solution=SimpleNamespace(sql=full)))
    checked = client.post("/databases/University/queries/q1/check-translation", json={"direction": "ra-to-sql", "answer": short})
    assert checked.status_code == 200
    assert checked.json()["is_correct"] is False


def test_ai_walkthrough_and_errors_never_log_prompt_content(monkeypatch, caplog):
    monkeypatch.setenv("LLM_BASE_URL", "http://model.test/v1")
    monkeypatch.setenv("LLM_API_KEY", "key")
    calls = []
    def completion(**kwargs):
        calls.append(kwargs)
        return {"choices": [{"message": {"content": '{"explanation":"Use valid syntax.","hint":"Check brackets."}'}}]}
    monkeypatch.setattr(llm, "_chat_completion", completion)
    with caplog.at_level(logging.INFO):
        llm.explain_ra_error(database="OWNER_SENTINEL", expression="RA_ANSWER_SENTINEL", error_context={"type": "parse_error", "context": "RAW_ERROR_SENTINEL", "message": "RAW_ERROR_SENTINEL"}, schema=[], grammar_help="Use braces")
        llm.explain_sql_error(database="OWNER_SENTINEL", sql="SQL_ANSWER_SENTINEL", error_context={"type": "evaluation_error", "message": "RAW_ERROR_SENTINEL"}, schema=[])
        llm.generate_solution_walkthrough(database="OWNER_SENTINEL", prompt="Exercise", difficulty=None, expected_operators=[], canonical_ra="CANONICAL_SENTINEL", canonical_sql=None, schema=[])
    for call in calls:
        assert "OWNER_SENTINEL" not in call["user_prompt"]
        assert "RAW_ERROR_SENTINEL" not in call["user_prompt"]
    assert "RA_ANSWER_SENTINEL" in calls[0]["user_prompt"]
    assert "SQL_ANSWER_SENTINEL" in calls[1]["user_prompt"]
    assert "RA_ANSWER_SENTINEL" not in calls[2]["user_prompt"]
    assert "SENTINEL" not in caplog.text


def test_ai_privacy_uses_verified_account_id_without_changing_policy_version(client, monkeypatch):
    monkeypatch.setattr(auth, "verify_access_token", lambda token: {"id": token, "email": "not-for-the-disclosure@example.test"})
    monkeypatch.setenv("LLM_PRIVACY_REVIEWED", "true")
    monkeypatch.setenv("LLM_SERVICE_NAME", "School model")
    monkeypatch.setenv("LLM_DATA_POLICY", "Test data policy")
    response = client.get("/ai/privacy", headers={"Authorization": "Bearer member-one"})
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["vary"] == "Authorization"
    first = response.json()
    second = client.get("/ai/privacy", headers={"Authorization": "Bearer member-two"}).json()
    assert first["account_id"] == "member-one"
    assert second["account_id"] == "member-two"
    assert first["version"] == second["version"]
    assert "email" not in first
