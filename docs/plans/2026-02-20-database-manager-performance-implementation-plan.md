# Database Manager Performance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Database Manager interactions fast by removing eager all-database schema loads and using lightweight, cached preview fetches.

**Architecture:** Keep `/databases` for lightweight list rendering, lazy-load per-database previews only when requested, and replace full CSV parsing in preview paths with limited-row reads. Add explicit cache invalidation after import/delete so reruns reuse cached metadata safely.

**Tech Stack:** Python, FastAPI, Streamlit, pandas, pytest, requests

---

### Task 1: Add backend failing tests for lightweight schema preview

**Files:**
- Create: `tests/test_backend/test_database_schema_preview.py`
- Modify: `backend/services/datasets.py`
- Modify: `backend/routes/databases.py`

**Step 1: Write the failing test**

```python
import io

import pandas as pd

from backend.services import datasets


def test_get_database_schema_preview_reads_only_nrows(monkeypatch):
    calls = []

    def fake_list_objects(bucket, prefix):
        return ["students.csv"]

    def fake_download(bucket, object_path):
        return b"id,name\n1,A\n2,B\n3,C\n"

    def fake_read_csv(*args, **kwargs):
        calls.append(kwargs.get("nrows"))
        return pd.DataFrame({"id": [1, 2], "name": ["A", "B"]})

    monkeypatch.setattr(datasets, "_resolve_location", lambda *_args, **_kwargs: type("L", (), {"bucket": "b", "prefix": "p"})())
    monkeypatch.setattr(datasets, "storage_list_objects", fake_list_objects)
    monkeypatch.setattr(datasets, "storage_download_object", fake_download)
    monkeypatch.setattr(pd, "read_csv", fake_read_csv)

    schema = datasets.get_database_schema("TestDB", sample_rows=2, user_id="u1")

    assert schema.tables[0].name == "students"
    assert calls == [2]
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_backend/test_database_schema_preview.py::test_get_database_schema_preview_reads_only_nrows -v`
Expected: FAIL because `get_database_schema` currently performs full parse without strict preview-only behavior.

**Step 3: Write minimal implementation**

```python
# inside get_database_schema
preview_df = pd.read_csv(io.BytesIO(raw), nrows=sample_rows)
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/test_backend/test_database_schema_preview.py::test_get_database_schema_preview_reads_only_nrows -v`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/test_backend/test_database_schema_preview.py backend/services/datasets.py backend/routes/databases.py
git commit -m "test: lock preview schema to limited-row reads"
```

### Task 2: Implement backend lightweight preview + row count strategy

**Files:**
- Modify: `backend/services/datasets.py`
- Modify: `backend/routes/databases.py`
- Modify: `frontend/utils/api_client.py`

**Step 1: Write the failing test**

```python
def test_schema_preview_response_has_sample_rows_and_columns_only(monkeypatch, client, auth_header):
    resp = client.get("/databases/TestDB/schema?sample_rows=5", headers=auth_header)
    assert resp.status_code == 200
    payload = resp.json()
    assert "tables" in payload
    assert "sample_rows" in payload["tables"][0]
    assert "columns" in payload["tables"][0]
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_backend/test_database_schema_preview.py::test_schema_preview_response_has_sample_rows_and_columns_only -v`
Expected: FAIL if response shape/loader path still assumes full parse behavior.

**Step 3: Write minimal implementation**

```python
# datasets.py
# For preview: read only header + nrows and compute row_count cheaply.
# Example cheap count approach:
row_count = max(sum(1 for _ in io.StringIO(raw.decode("utf-8", errors="ignore"))) - 1, 0)
```

```python
# api_client.py
# Keep same method, but treat endpoint as preview metadata fetch.
def get_database_schema(self, database: str, sample_rows: int = 5) -> Dict[str, Any]:
    return self._make_request("GET", f"/databases/{database}/schema", params={"sample_rows": sample_rows})
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/test_backend/test_database_schema_preview.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/services/datasets.py backend/routes/databases.py frontend/utils/api_client.py tests/test_backend/test_database_schema_preview.py
git commit -m "feat: optimize schema preview loading for database manager"
```

### Task 3: Add backend cache for schema preview with invalidation hooks

**Files:**
- Modify: `backend/services/datasets.py`
- Modify: `backend/routes/databases.py`

**Step 1: Write the failing test**

```python
def test_schema_preview_cache_reuses_downloads(monkeypatch):
    hit_count = {"download": 0}

    def fake_download(*_args, **_kwargs):
        hit_count["download"] += 1
        return b"id,name\n1,A\n"

    # invoke schema twice with same args and assert one download
    # (after cache is added)
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_backend/test_database_schema_preview.py::test_schema_preview_cache_reuses_downloads -v`
Expected: FAIL (currently re-downloads every call).

**Step 3: Write minimal implementation**

```python
# datasets.py module-level cache
_SCHEMA_PREVIEW_CACHE = {}

# key: (user_id, database, sample_rows)
# invalidate on create/delete operations
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/test_backend/test_database_schema_preview.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/services/datasets.py tests/test_backend/test_database_schema_preview.py backend/routes/databases.py
git commit -m "feat: add schema preview cache with invalidation"
```

### Task 4: Refactor frontend Database Manager to lazy-load previews per database

**Files:**
- Modify: `frontend/pages/1_🗄️_Database_Manager.py`
- Create: `tests/test_frontend/test_database_manager_lazy_preview.py`

**Step 1: Write the failing test**

```python
def test_page_does_not_fetch_schema_for_all_databases_on_initial_render(monkeypatch):
    calls = {"schema": 0}

    class FakeAPI:
        def health_check(self):
            return {}
        def get_databases(self):
            return [{"name": "a", "table_count": 1, "tables": ["t1"], "is_default": False}]
        def get_database_schema(self, *_args, **_kwargs):
            calls["schema"] += 1
            return {"tables": []}

    # render page module main with monkeypatched API client
    # assert calls["schema"] == 0 before user loads preview
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_frontend/test_database_manager_lazy_preview.py::test_page_does_not_fetch_schema_for_all_databases_on_initial_render -v`
Expected: FAIL because current page fetches schema inside loop on render.

**Step 3: Write minimal implementation**

```python
# Database_Manager.py
# Use session cache key like: preview_cache[db_name]
# Add explicit button: "Load table previews" per DB expander.
# Only call api_client.get_database_schema when button pressed or cache miss after explicit load.
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/test_frontend/test_database_manager_lazy_preview.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/pages/1_🗄️_Database_Manager.py tests/test_frontend/test_database_manager_lazy_preview.py
git commit -m "feat: lazy-load database previews in manager page"
```

### Task 5: Add frontend cache invalidation after import/delete and validate rerun behavior

**Files:**
- Modify: `frontend/pages/1_🗄️_Database_Manager.py`
- Modify: `tests/test_frontend/test_database_manager_lazy_preview.py`

**Step 1: Write the failing test**

```python
def test_import_or_delete_clears_preview_cache(monkeypatch):
    state = {"preview_cache": {"TestDB": {"tables": []}}}
    # simulate successful delete/import callback
    # assert preview_cache is cleared for affected db (or fully invalidated)
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_frontend/test_database_manager_lazy_preview.py::test_import_or_delete_clears_preview_cache -v`
Expected: FAIL before invalidation logic is added.

**Step 3: Write minimal implementation**

```python
# on successful import/delete:
st.session_state.pop("db_preview_cache", None)
# or remove only st.session_state["db_preview_cache"].pop(db_name, None)
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/test_frontend/test_database_manager_lazy_preview.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/pages/1_🗄️_Database_Manager.py tests/test_frontend/test_database_manager_lazy_preview.py
git commit -m "fix: invalidate database preview cache on data changes"
```

### Task 6: Full verification and documentation alignment

**Files:**
- Modify: `README.md`
- Modify: `docs/plans/2026-02-20-database-manager-performance-design.md`

**Step 1: Write the failing test/check**

```python
# N/A doc-only; replace with command-level acceptance checks.
```

**Step 2: Run validation commands**

Run: `pytest tests/test_backend/test_database_schema_preview.py -v`
Expected: PASS

Run: `pytest tests/test_frontend/test_database_manager_lazy_preview.py -v`
Expected: PASS

Run: `pytest -q`
Expected: PASS (or clearly documented unrelated existing failures)

**Step 3: Write minimal implementation**

```markdown
Update README performance notes for Database Manager lazy loading behavior.
```

**Step 4: Re-run checks**

Run: `pytest -q`
Expected: PASS

**Step 5: Commit**

```bash
git add README.md docs/plans/2026-02-20-database-manager-performance-design.md
git commit -m "docs: document database manager preview loading behavior"
```
