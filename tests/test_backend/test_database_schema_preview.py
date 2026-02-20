import pandas as pd

from backend.services import datasets


class _Location:
    bucket = "bucket"
    prefix = "prefix"


def test_get_database_schema_reads_preview_rows_only(monkeypatch):
    read_csv_nrows = []

    def fake_resolve_location(_database, _user_id):
        return _Location()

    def fake_list_objects(_bucket, _prefix):
        return ["students.csv"]

    def fake_download_object(_bucket, _object_path):
        return b"id,name\n1,A\n2,B\n3,C\n"

    def fake_read_csv(_raw, *args, **kwargs):
        # Capture the contract we care about: preview reads must be bounded.
        read_csv_nrows.append(kwargs.get("nrows"))
        if kwargs.get("nrows") == 2:
            return pd.DataFrame({"id": [1, 2], "name": ["A", "B"]})
        return pd.DataFrame({"id": [1, 2, 3], "name": ["A", "B", "C"]})

    monkeypatch.setattr(datasets, "_resolve_location", fake_resolve_location)
    monkeypatch.setattr(datasets, "storage_list_objects", fake_list_objects)
    monkeypatch.setattr(datasets, "storage_download_object", fake_download_object)
    monkeypatch.setattr(pd, "read_csv", fake_read_csv)

    schema = datasets.get_database_schema("TestDB", sample_rows=2, user_id="u1")

    assert schema.name == "TestDB"
    assert schema.tables[0].name == "students"
    assert read_csv_nrows == [2]


def test_get_database_schema_preview_sample_size_respected(monkeypatch):
    def fake_resolve_location(_database, _user_id):
        return _Location()

    def fake_list_objects(_bucket, _prefix):
        return ["students.csv"]

    def fake_download_object(_bucket, _object_path):
        return b"id,name\n1,A\n2,B\n3,C\n"

    monkeypatch.setattr(datasets, "_resolve_location", fake_resolve_location)
    monkeypatch.setattr(datasets, "storage_list_objects", fake_list_objects)
    monkeypatch.setattr(datasets, "storage_download_object", fake_download_object)

    schema = datasets.get_database_schema("TestDB", sample_rows=1, user_id="u1")

    assert len(schema.tables[0].sample_rows) == 1


def test_get_database_schema_uses_cache(monkeypatch):
    download_calls = {"count": 0}

    def fake_resolve_location(_database, _user_id):
        return _Location()

    def fake_list_objects(_bucket, _prefix):
        return ["students.csv"]

    def fake_download_object(_bucket, _object_path):
        download_calls["count"] += 1
        return b"id,name\n1,A\n2,B\n"

    datasets.clear_schema_preview_cache()
    monkeypatch.setattr(datasets, "_resolve_location", fake_resolve_location)
    monkeypatch.setattr(datasets, "storage_list_objects", fake_list_objects)
    monkeypatch.setattr(datasets, "storage_download_object", fake_download_object)

    datasets.get_database_schema("TestDB", sample_rows=2, user_id="u1")
    datasets.get_database_schema("TestDB", sample_rows=2, user_id="u1")

    assert download_calls["count"] == 1
