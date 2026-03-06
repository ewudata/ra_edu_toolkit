# Operator Tag Styling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restyle selected operator tags in the relational algebra exercises page to use a white background with dark text.

**Architecture:** Keep the existing Streamlit multiselect and inject a page-local CSS override for the selected tag elements. Validate the change with a focused source-level regression test plus the existing operator filtering frontend tests.

**Tech Stack:** Python, Streamlit, pytest

---

### Task 1: Lock the CSS hook into a failing test

**Files:**
- Modify: `tests/test_frontend/test_operator_based_query_filtering.py`
- Test: `tests/test_frontend/test_operator_based_query_filtering.py`

**Step 1: Write the failing test**

```python
def test_operator_multiselect_selected_tags_use_light_pill_styling():
    page_source = Path(
        "frontend/pages/2_🧮_Relational_Algebra_Exercises.py"
    ).read_text(encoding="utf-8")

    assert '[data-baseweb="tag"]' in page_source
    assert "background-color: #ffffff" in page_source
    assert "color: #0f172a" in page_source
```

**Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_operator_based_query_filtering.py`
Expected: FAIL because the page does not yet include the selected-tag CSS override.

**Step 3: Write minimal implementation**

```python
st.markdown(
    """
    <style>
    [data-baseweb="tag"] {
        background-color: #ffffff !important;
        color: #0f172a !important;
        border: 1px solid rgba(148, 163, 184, 0.6) !important;
    }
    </style>
    """,
    unsafe_allow_html=True,
)
```

**Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_operator_based_query_filtering.py`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/test_frontend/test_operator_based_query_filtering.py frontend/pages/2_🧮_Relational_Algebra_Exercises.py
git commit -m "style: restyle operator filter selected tags"
```

### Task 2: Verify focused frontend regressions

**Files:**
- Modify: `frontend/pages/2_🧮_Relational_Algebra_Exercises.py`
- Test: `tests/test_frontend/test_operator_based_query_filtering.py`
- Test: `tests/test_frontend/test_query_difficulty.py`

**Step 1: Run the focused test suite**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_operator_based_query_filtering.py tests/test_frontend/test_query_difficulty.py`
Expected: PASS

**Step 2: Make only minimal follow-up adjustments if needed**

```python
# Refine the CSS selector or color values only if the focused suite exposes a regression.
```

**Step 3: Re-run the focused test suite**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_operator_based_query_filtering.py tests/test_frontend/test_query_difficulty.py`
Expected: PASS

**Step 4: Commit**

```bash
git add frontend/pages/2_🧮_Relational_Algebra_Exercises.py tests/test_frontend/test_operator_based_query_filtering.py docs/plans/2026-03-06-operator-tag-styling-design.md docs/plans/2026-03-06-operator-tag-styling-implementation-plan.md
git commit -m "docs: capture operator tag styling change"
```
