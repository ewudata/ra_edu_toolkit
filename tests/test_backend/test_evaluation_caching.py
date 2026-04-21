import pandas as pd

from backend.services import datasets, sql as sql_service


class _Location:
    bucket = "bucket"
    prefix = "prefix"


def test_load_database_env_uses_cache(monkeypatch):
    download_calls = {"count": 0}

    def fake_resolve_location(_database, _user_id):
        return _Location()

    def fake_list_objects(_bucket, _prefix):
        return ["students.csv"]

    def fake_download_object(_bucket, _object_path):
        download_calls["count"] += 1
        return b"id,name\n1,A\n2,B\n"

    datasets.clear_database_env_cache()
    monkeypatch.setattr(datasets, "_resolve_location", fake_resolve_location)
    monkeypatch.setattr(datasets, "storage_list_objects", fake_list_objects)
    monkeypatch.setattr(datasets, "storage_download_object", fake_download_object)

    first = datasets.load_database_env("TestDB", user_id="u1")
    second = datasets.load_database_env("TestDB", user_id="u1")

    assert download_calls["count"] == 1
    assert first["students"] is not second["students"]
    first["students"].loc[0, "name"] = "Changed"
    assert second["students"].loc[0, "name"] == "A"


def test_evaluate_sql_reuses_cached_sqlite_snapshot(monkeypatch):
    build_calls = {"count": 0}

    def fake_build_sqlite_snapshot(database, *, user_id=None):
        build_calls["count"] += 1
        with sql_service.sqlite3.connect(":memory:") as conn:
            pd.DataFrame([{"id": 1, "name": "Ada"}]).to_sql(
                "students", conn, index=False, if_exists="replace"
            )
            return conn.serialize()

    sql_service.clear_sqlite_cache()
    monkeypatch.setattr(sql_service, "_build_sqlite_snapshot", fake_build_sqlite_snapshot)

    first = sql_service.evaluate_sql("SELECT id, name FROM students", "TestDB", user_id="u1")
    second = sql_service.evaluate_sql("SELECT id, name FROM students", "TestDB", user_id="u1")

    assert build_calls["count"] == 1
    assert first.rows == [{"id": 1, "name": "Ada"}]
    assert second.rows == [{"id": 1, "name": "Ada"}]
