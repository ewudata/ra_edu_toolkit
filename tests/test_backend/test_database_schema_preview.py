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


def test_bundled_default_schema_uses_local_files(monkeypatch, tmp_path):
    root = tmp_path / "datasets"
    local_db = root / "LocalDefault"
    local_db.mkdir(parents=True)
    (local_db / "students.csv").write_text("id,name\n1,Ada\n2,Bo\n", encoding="utf-8")

    datasets.clear_schema_preview_cache()
    datasets.clear_dataset_metadata_cache()
    monkeypatch.setattr(datasets, "_DATASETS_ROOT", root)
    monkeypatch.setenv("RA_BUNDLED_DEFAULT_DATASETS", "LocalDefault")
    monkeypatch.setattr(
        datasets,
        "storage_download_object",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("storage should not be used")
        ),
    )
    monkeypatch.setattr(
        datasets,
        "storage_list_objects",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("storage should not be used")
        ),
    )
    monkeypatch.setattr(
        datasets,
        "list_default_datasets",
        lambda: (_ for _ in ()).throw(
            AssertionError("default metadata should not be used")
        ),
    )
    monkeypatch.setattr(datasets, "list_user_datasets", lambda _user_id: [])

    schema = datasets.get_database_schema("LocalDefault", sample_rows=1, user_id="u1")

    assert schema.tables[0].name == "students"
    assert schema.tables[0].sample_rows == [{"id": 1, "name": "Ada"}]
    datasets.clear_schema_preview_cache()
    datasets.clear_dataset_metadata_cache()


def test_list_databases_uses_local_bundled_defaults(monkeypatch, tmp_path):
    root = tmp_path / "datasets"
    local_db = root / "LocalDefault"
    local_db.mkdir(parents=True)
    (local_db / "students.csv").write_text("id,name\n1,Ada\n", encoding="utf-8")

    datasets.clear_dataset_metadata_cache()
    monkeypatch.setattr(datasets, "_DATASETS_ROOT", root)
    monkeypatch.setenv("RA_BUNDLED_DEFAULT_DATASETS", "LocalDefault")
    monkeypatch.setattr(
        datasets,
        "storage_list_objects",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("storage should not be used")
        ),
    )
    monkeypatch.setattr(
        datasets,
        "list_default_datasets",
        lambda: (_ for _ in ()).throw(
            AssertionError("default metadata should not be used")
        ),
    )
    monkeypatch.setattr(datasets, "list_user_datasets", lambda _user_id: [])

    summaries = datasets.list_databases(user_id="u1")

    assert [(summary.name, summary.tables, summary.is_default) for summary in summaries] == [
        ("LocalDefault", ["students"], True)
    ]
    datasets.clear_dataset_metadata_cache()


def test_bundled_default_catalog_uses_local_files(monkeypatch, tmp_path):
    root = tmp_path / "datasets"
    local_db = root / "LocalDefault"
    local_db.mkdir(parents=True)
    (local_db / "catalog.json").write_text('{"questions": []}', encoding="utf-8")

    datasets.clear_dataset_metadata_cache()
    monkeypatch.setattr(datasets, "_DATASETS_ROOT", root)
    monkeypatch.setenv("RA_BUNDLED_DEFAULT_DATASETS", "LocalDefault")
    monkeypatch.setattr(
        datasets,
        "storage_download_object",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("storage should not be used")
        ),
    )
    monkeypatch.setattr(
        datasets,
        "list_default_datasets",
        lambda: (_ for _ in ()).throw(
            AssertionError("default metadata should not be used")
        ),
    )
    monkeypatch.setattr(datasets, "list_user_datasets", lambda _user_id: [])

    raw = datasets.read_database_file_bytes("LocalDefault", "catalog.json", user_id="u1")

    assert raw == b'{"questions": []}'
    datasets.clear_dataset_metadata_cache()
