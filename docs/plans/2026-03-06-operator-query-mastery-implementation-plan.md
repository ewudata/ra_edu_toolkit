# Operator Query Mastery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist per-user query mastery for operator-based relational algebra exercises and let users filter the catalog by mastery progress.

**Architecture:** Add a small per-user mastery storage and API on the backend, record mastery on first correct relational algebra query evaluation, and fetch mastery state alongside the existing query catalog on the frontend. Extend the operator-based filter UI with a progress filter and mastery indicators while preserving current operator filtering and difficulty ordering.

**Tech Stack:** Python, FastAPI, Streamlit, pytest, Supabase-backed storage

---

### Task 1: Lock in mastery storage behavior with backend unit tests

**Files:**
- Create: `tests/test_backend/test_learning_mastery_storage.py`
- Modify: `backend/services/supabase.py`
- Create or modify: `backend/services/learning_progress.py`

**Step 1: Write the failing test**

```python
def test_upsert_query_mastery_writes_single_user_query_record(monkeypatch):
    captured = {}

    def fake_request_json(method, url, **kwargs):
        captured["method"] = method
        captured["url"] = url
        captured["kwargs"] = kwargs
        return [{}]

    monkeypatch.setattr(progress, "_request_json", fake_request_json)

    progress.upsert_query_mastery(
        user_id="u1",
        database_name="University",
        query_id="q1",
    )

    assert captured["method"] == "POST"
    assert captured["kwargs"]["json_body"][0]["user_id"] == "u1"
    assert captured["kwargs"]["json_body"][0]["query_id"] == "q1"
```

**Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_backend/test_learning_mastery_storage.py`
Expected: FAIL because mastery storage helpers do not exist yet

**Step 3: Write minimal implementation**

```python
def upsert_query_mastery(*, user_id: str, database_name: str, query_id: str) -> None:
    payload = [{
        "user_id": user_id,
        "database_name": database_name,
        "query_id": query_id,
    }]
    _request_json(
        "POST",
        f"{_supabase_url()}/rest/v1/query_mastery",
        headers=_service_headers({"Prefer": "resolution=merge-duplicates"}),
        json_body=payload,
    )
```

Also add a `list_mastered_query_ids(...)` helper returning a set/list of query IDs for one user and database.

**Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_backend/test_learning_mastery_storage.py`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/services/learning_progress.py backend/services/supabase.py tests/test_backend/test_learning_mastery_storage.py
git commit -m "test: add query mastery storage coverage"
```

### Task 2: Add backend route/service coverage for mastery recording and reads

**Files:**
- Create: `tests/test_backend/test_learning_mastery_routes.py`
- Modify: `backend/routes/queries.py`
- Modify: `backend/services/queries.py`
- Modify: `backend/main.py`

**Step 1: Write the failing test**

```python
def test_correct_query_evaluation_records_mastery(monkeypatch, client, auth_header):
    recorded = {}

    monkeypatch.setattr(routes, "evaluate_query", lambda *args, **kwargs: {"is_correct": True})
    monkeypatch.setattr(routes, "upsert_query_mastery", lambda **kwargs: recorded.update(kwargs))

    response = client.post(
        "/databases/TestDB/queries/q1/evaluate",
        json={"expression": "pi name (students)"},
        headers=auth_header,
    )

    assert response.status_code == 200
    assert recorded["query_id"] == "q1"
```

Add a paired test asserting incorrect evaluations do not record mastery, and a list-route test like:

```python
def test_list_mastered_queries_returns_ids_for_current_user(...):
    ...
```

**Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_backend/test_learning_mastery_routes.py`
Expected: FAIL because routes do not expose mastery reads/writes yet

**Step 3: Write minimal implementation**

```python
@router.get("/mastery")
def get_query_mastery(database: str, user=Depends(require_current_user)):
    mastered_ids = list_mastered_query_ids(user_id=user["id"], database_name=database)
    return {"query_ids": sorted(mastered_ids)}
```

And in evaluation handling:

```python
if evaluation_response.is_correct:
    upsert_query_mastery(
        user_id=user["id"],
        database_name=database,
        query_id=query_id,
    )
```

**Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_backend/test_learning_mastery_routes.py`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/routes/queries.py backend/services/queries.py backend/main.py tests/test_backend/test_learning_mastery_routes.py
git commit -m "feat: persist query mastery for correct evaluations"
```

### Task 3: Add frontend filtering tests for mastery-aware operator browsing

**Files:**
- Modify: `tests/test_frontend/test_operator_based_query_filtering.py`
- Modify: `frontend/pages/2_🧮_Relational_Algebra_Exercises.py`
- Modify: `frontend/components/query_selector.py`
- Modify: `frontend/utils/api_client.py`

**Step 1: Write the failing test**

```python
def test_progress_filter_can_hide_mastered_queries():
    queries = [
        {"id": "q1", "prompt": "A", "hints": ["selection"]},
        {"id": "q2", "prompt": "B", "hints": ["selection"]},
    ]

    filtered = module._filter_queries_by_progress(
        queries,
        mastered_query_ids={"q1"},
        progress_filter="unmastered",
    )

    assert [query["id"] for query in filtered] == ["q2"]
```

Add a second test for `mastered`, and a source-level or helper-level test for mastery indicators in selector labels.

**Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_operator_based_query_filtering.py`
Expected: FAIL because progress filtering helpers and mastery indicators do not exist yet

**Step 3: Write minimal implementation**

```python
def _filter_queries_by_progress(queries, mastered_query_ids, progress_filter):
    if progress_filter == "mastered":
        return [q for q in queries if q["id"] in mastered_query_ids]
    if progress_filter == "unmastered":
        return [q for q in queries if q["id"] not in mastered_query_ids]
    return list(queries)
```

Update query labels to include a small mastery marker for mastered items.

**Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_operator_based_query_filtering.py`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/pages/2_🧮_Relational_Algebra_Exercises.py frontend/components/query_selector.py frontend/utils/api_client.py tests/test_frontend/test_operator_based_query_filtering.py
git commit -m "test: add mastery-aware operator filtering coverage"
```

### Task 4: Wire mastery loading into operator-based practice

**Files:**
- Modify: `frontend/pages/2_🧮_Relational_Algebra_Exercises.py`
- Modify: `frontend/utils/api_client.py`
- Modify: `frontend/utils/auth.py`

**Step 1: Write the failing test**

```python
def test_operator_page_defaults_to_unmastered_progress_filter():
    source = Path("frontend/pages/2_🧮_Relational_Algebra_Exercises.py").read_text()
    assert 'progress_filter = "unmastered"' in source
```

Prefer a behavioral helper test if possible, but add enough coverage to prove:
- mastery IDs are fetched for the selected database
- the default progress mode is `unmastered`
- operator and progress filters are both applied

**Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_operator_based_query_filtering.py`
Expected: FAIL because the page does not request mastery state yet

**Step 3: Write minimal implementation**

```python
mastered_query_ids = set(api_client.get_query_mastery(selected_database).get("query_ids", []))
progress_filter = st.segmented_control(
    "Progress",
    ["Unmastered", "All", "Mastered"],
    default="Unmastered",
)
```

Normalize values internally to lowercase keys and fall back safely if the mastery request fails.

**Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_operator_based_query_filtering.py`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/pages/2_🧮_Relational_Algebra_Exercises.py frontend/utils/api_client.py tests/test_frontend/test_operator_based_query_filtering.py
git commit -m "feat: add mastery-based operator practice filters"
```

### Task 5: Run targeted verification

**Files:**
- Modify: none

**Step 1: Run backend mastery tests**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_backend/test_learning_mastery_storage.py tests/test_backend/test_learning_mastery_routes.py`
Expected: PASS

**Step 2: Run frontend operator/mastery tests**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_operator_based_query_filtering.py tests/test_frontend/test_query_difficulty.py`
Expected: PASS

**Step 3: Run focused auth/regression checks if page auth code changed during implementation**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_auth_return_to_origin.py`
Expected: PASS

**Step 4: Review diff**

Run: `git diff -- backend/routes/queries.py backend/services/learning_progress.py backend/services/supabase.py frontend/pages/2_🧮_Relational_Algebra_Exercises.py frontend/components/query_selector.py frontend/utils/api_client.py tests/test_backend/test_learning_mastery_storage.py tests/test_backend/test_learning_mastery_routes.py tests/test_frontend/test_operator_based_query_filtering.py`
Expected: Only planned mastery-storage, route, and operator-filter changes appear

**Step 5: Commit**

```bash
git add backend/routes/queries.py backend/services/learning_progress.py backend/services/supabase.py frontend/pages/2_🧮_Relational_Algebra_Exercises.py frontend/components/query_selector.py frontend/utils/api_client.py tests/test_backend/test_learning_mastery_storage.py tests/test_backend/test_learning_mastery_routes.py tests/test_frontend/test_operator_based_query_filtering.py docs/plans/2026-03-06-operator-query-mastery-design.md docs/plans/2026-03-06-operator-query-mastery-implementation-plan.md
git commit -m "feat: add mastery-based operator query progress"
```
