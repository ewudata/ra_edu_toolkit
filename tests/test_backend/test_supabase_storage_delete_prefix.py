from backend.services import supabase


def test_storage_delete_prefix_sends_object_payload(monkeypatch):
    captured = {}

    def fake_list_objects(_bucket, _prefix):
        return ["students.csv", "courses.csv"]

    def fake_request_json(method, url, **kwargs):
        captured["method"] = method
        captured["url"] = url
        captured["kwargs"] = kwargs
        return {}

    monkeypatch.setattr(supabase, "_supabase_url", lambda: "https://example.supabase.co")
    monkeypatch.setattr(supabase, "_service_headers", lambda: {"apikey": "k"})
    monkeypatch.setattr(supabase, "storage_list_objects", fake_list_objects)
    monkeypatch.setattr(supabase, "_request_json", fake_request_json)

    supabase.storage_delete_prefix("bucket", "u1/mydb")

    assert captured["method"] == "DELETE"
    assert captured["url"] == "https://example.supabase.co/storage/v1/object/bucket"
    assert captured["kwargs"]["json_body"] == {
        "prefixes": ["u1/mydb/students.csv", "u1/mydb/courses.csv"]
    }
