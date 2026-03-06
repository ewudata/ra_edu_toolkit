# Operator-Based Query Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge pre-defined query browsing into operator-based practice so catalog-backed practice uses one mode that shows all queries by default.

**Architecture:** Keep the existing catalog loading and query selector flow, but remove the separate `predefined` mode branch from the Streamlit page. Treat an empty operator multiselect as an unfiltered view of the sorted query catalog, and preserve the current operator matching logic when filters are selected.

**Tech Stack:** Python, Streamlit, pytest

---

### Task 1: Lock in empty-selection operator behavior with tests

**Files:**
- Modify: `tests/test_frontend/test_operator_based_query_filtering.py`
- Test: `tests/test_frontend/test_operator_based_query_filtering.py`

**Step 1: Write the failing test**

```python
def test_empty_operator_selection_means_show_all_queries():
    module = _load_relalg_page_module()
    queries = [
        {"id": "q1", "hints": ["selection"]},
        {"id": "q2", "hints": ["natural join"]},
    ]

    selected_ops = set()
    filtered = [
        query
        for query in queries
        if not selected_ops
        or module._query_matches_selected_operators(query, selected_ops)
    ]

    assert filtered == queries
```

**Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_operator_based_query_filtering.py`
Expected: FAIL because the current page logic treats empty selection as a blocked state instead of an unfiltered catalog view.

**Step 3: Write minimal implementation**

```python
if not selected_ops:
    filtered_queries = st.session_state.available_queries
else:
    filtered_queries = [
        query
        for query in st.session_state.available_queries
        if _query_matches_selected_operators(query, selected_ops)
    ]
```

**Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_operator_based_query_filtering.py`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/test_frontend/test_operator_based_query_filtering.py frontend/pages/2_🧮_Relational_Algebra_Exercises.py
git commit -m "test: cover default operator query catalog view"
```

### Task 2: Remove the separate predefined mode from the page

**Files:**
- Modify: `frontend/pages/2_🧮_Relational_Algebra_Exercises.py`
- Test: `tests/test_frontend/test_operator_based_query_filtering.py`

**Step 1: Write the failing test**

```python
def test_predefined_mode_is_not_exposed_in_practice_cards():
    page_source = Path("frontend/pages/2_🧮_Relational_Algebra_Exercises.py").read_text()
    assert "Practice with Pre-defined Queries" not in page_source
```

**Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_operator_based_query_filtering.py`
Expected: FAIL because the page still renders the separate pre-defined practice card and branch.

**Step 3: Write minimal implementation**

```python
# Remove the predefined card and practice_mode branch.
# Keep one catalog-backed button for operator-based browsing/filtering.
```

**Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_operator_based_query_filtering.py`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/pages/2_🧮_Relational_Algebra_Exercises.py tests/test_frontend/test_operator_based_query_filtering.py
git commit -m "feat: merge predefined queries into operator-based practice"
```

### Task 3: Verify the targeted frontend regression suite

**Files:**
- Modify: `frontend/pages/2_🧮_Relational_Algebra_Exercises.py`
- Test: `tests/test_frontend/test_operator_based_query_filtering.py`
- Test: `tests/test_frontend/test_query_difficulty.py`

**Step 1: Run the focused test suite**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_operator_based_query_filtering.py tests/test_frontend/test_query_difficulty.py`
Expected: PASS

**Step 2: Investigate any failure before further changes**

```python
# Make only the minimal page-copy or filtering adjustments needed to restore green tests.
```

**Step 3: Re-run the focused test suite**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_operator_based_query_filtering.py tests/test_frontend/test_query_difficulty.py`
Expected: PASS

**Step 4: Commit**

```bash
git add frontend/pages/2_🧮_Relational_Algebra_Exercises.py tests/test_frontend/test_operator_based_query_filtering.py docs/plans/2026-03-06-operator-based-query-mode-design.md docs/plans/2026-03-06-operator-based-query-mode-implementation-plan.md
git commit -m "docs: capture operator-based query mode consolidation"
```
