# Auth Return-To-Origin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Return users to the protected Streamlit page they originally requested after successful Google login instead of always sending them to Home.

**Architecture:** Capture the current frontend URL in `frontend/utils/auth.py` when rendering the Google login link and send it through the existing OAuth start endpoint as `frontend_redirect`. In the backend callback, merge auth query parameters onto that stored URL so path and existing query parameters are preserved.

**Tech Stack:** Python, Streamlit, FastAPI, pytest

---

### Task 1: Add backend redirect composition tests

**Files:**
- Modify: `tests/test_backend/test_learning_routes.py` or create a dedicated auth route test file if no auth route coverage exists
- Modify: `backend/routes/auth.py`

**Step 1: Write the failing test**

```python
def test_google_callback_redirects_back_to_original_page(client, monkeypatch):
    monkeypatch.setattr(
        "backend.routes.auth.exchange_google_oauth_code",
        lambda code, ctx: (
            {"access_token": "token-123", "user": {"email": "user@example.com"}},
            "http://localhost:8501/Database_Manager?foo=bar",
        ),
    )

    response = client.get("/auth/google/callback?code=abc&ctx=xyz", follow_redirects=False)

    assert response.status_code == 302
    assert response.headers["location"].startswith(
        "http://localhost:8501/Database_Manager?foo=bar&auth_token=token-123"
    )
```

**Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_backend/<auth_test_file>.py -k original_page`
Expected: FAIL because callback currently rewrites the destination as `.../?auth_token=...`

**Step 3: Write minimal implementation**

```python
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def _append_query_params(url: str, params: dict[str, str]) -> str:
    split = urlsplit(url)
    merged = dict(parse_qsl(split.query, keep_blank_values=True))
    merged.update(params)
    return urlunsplit(
        (split.scheme, split.netloc, split.path, urlencode(merged), split.fragment)
    )
```

Use that helper in `google_callback(...)` when building the success redirect target.

**Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_backend/<auth_test_file>.py -k original_page`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/routes/auth.py tests/test_backend/<auth_test_file>.py
git commit -m "test: preserve original frontend path in auth callback"
```

### Task 2: Add frontend login-target tests

**Files:**
- Create or modify: `tests/test_frontend/test_auth_redirect_return_path.py`
- Modify: `frontend/utils/auth.py`

**Step 1: Write the failing test**

```python
def test_login_uses_current_page_url(monkeypatch):
    captured = {}

    class StubClient:
        def get_google_login_url(self, frontend_redirect):
            captured["frontend_redirect"] = frontend_redirect
            return "http://backend/auth"

        def set_auth_token(self, token):
            return None

        def clear_auth_token(self):
            return None

    # patch the auth module's Streamlit URL source so it returns a non-root page
    ...

    require_authentication(StubClient())

    assert captured["frontend_redirect"] == "http://localhost:8501/Database_Manager"
```

**Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_auth_redirect_return_path.py`
Expected: FAIL because `require_authentication(...)` currently always uses `FRONTEND_BASE_URL`

**Step 3: Write minimal implementation**

```python
def _current_frontend_url() -> str:
    params = st.query_params
    ...
    return computed_current_url
```

Use `_current_frontend_url()` inside `require_authentication(...)` instead of the fixed root URL.

**Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_auth_redirect_return_path.py`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/utils/auth.py tests/test_frontend/test_auth_redirect_return_path.py
git commit -m "feat: return to original page after login"
```

### Task 3: Add regression coverage for root-page login

**Files:**
- Modify: `tests/test_backend/<auth_test_file>.py`
- Modify: `tests/test_frontend/test_auth_redirect_return_path.py`

**Step 1: Write the failing test**

```python
def test_google_callback_root_redirect_still_targets_root(...):
    ...

def test_login_falls_back_to_frontend_base_url_for_root_page(...):
    ...
```

**Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_backend/<auth_test_file>.py tests/test_frontend/test_auth_redirect_return_path.py`
Expected: FAIL if root handling regresses during implementation

**Step 3: Write minimal implementation**

Keep fallback behavior for root or missing page path, and avoid changing current token/error consumption behavior.

**Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_backend/<auth_test_file>.py tests/test_frontend/test_auth_redirect_return_path.py`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/routes/auth.py frontend/utils/auth.py tests/test_backend/<auth_test_file>.py tests/test_frontend/test_auth_redirect_return_path.py
git commit -m "test: cover root auth redirect behavior"
```

### Task 4: Run targeted verification

**Files:**
- Modify: none

**Step 1: Run the auth-focused test set**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_backend/<auth_test_file>.py tests/test_frontend/test_auth_google_login_button.py tests/test_frontend/test_auth_redirect_return_path.py`
Expected: PASS

**Step 2: Run any related broader frontend/backend auth-adjacent tests**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_database_manager_lazy_preview.py -k protects_default_dataset_actions`
Expected: PASS

**Step 3: Review diff**

Run: `git diff -- backend/routes/auth.py frontend/utils/auth.py tests/test_backend/<auth_test_file>.py tests/test_frontend/test_auth_redirect_return_path.py`
Expected: Only the planned redirect-path and test changes appear

**Step 4: Commit**

```bash
git add backend/routes/auth.py frontend/utils/auth.py tests/test_backend/<auth_test_file>.py tests/test_frontend/test_auth_redirect_return_path.py
git commit -m "feat: preserve requested page across login"
```
