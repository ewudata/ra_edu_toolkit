from backend.services import learning_progress


def test_upsert_query_mastery_writes_single_user_query_record(monkeypatch):
    captured = {}

    def fake_request_json(method, url, **kwargs):
        captured["method"] = method
        captured["url"] = url
        captured["kwargs"] = kwargs
        return {}

    monkeypatch.setattr(learning_progress, "_request_json", fake_request_json)
    monkeypatch.setattr(
        learning_progress, "_supabase_url", lambda: "https://example.supabase.co"
    )
    monkeypatch.setattr(learning_progress, "_service_headers", lambda: {"apikey": "k"})

    learning_progress.upsert_query_mastery(
        user_id="u1",
        database_name="University",
        query_id="q1",
    )

    assert captured["method"] == "POST"
    assert captured["url"] == "https://example.supabase.co/rest/v1/query_mastery"
    assert captured["kwargs"]["params"] == {
        "on_conflict": "user_id,database_name,query_id"
    }
    assert captured["kwargs"]["json_body"] == {
        "user_id": "u1",
        "database_name": "University",
        "query_id": "q1",
    }
    assert captured["kwargs"]["headers"]["Prefer"] == "resolution=merge-duplicates"


def test_list_mastered_query_ids_returns_query_ids_for_user_and_database(monkeypatch):
    captured = {}

    def fake_request_json(method, url, **kwargs):
        captured["method"] = method
        captured["url"] = url
        captured["kwargs"] = kwargs
        return [{"query_id": "q1"}, {"query_id": "q3"}]

    monkeypatch.setattr(learning_progress, "_request_json", fake_request_json)
    monkeypatch.setattr(
        learning_progress, "_supabase_url", lambda: "https://example.supabase.co"
    )
    monkeypatch.setattr(learning_progress, "_service_headers", lambda: {"apikey": "k"})

    query_ids = learning_progress.list_mastered_query_ids(
        user_id="u1",
        database_name="University",
    )

    assert query_ids == {"q1", "q3"}
    assert captured["method"] == "GET"
    assert captured["url"] == "https://example.supabase.co/rest/v1/query_mastery"
    assert captured["kwargs"]["params"] == {
        "select": "query_id",
        "user_id": "eq.u1",
        "database_name": "eq.University",
    }
