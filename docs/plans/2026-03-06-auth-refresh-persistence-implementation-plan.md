# Auth Refresh Persistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist frontend auth across browser refreshes by restoring the Google auth token from a browser cookie into Streamlit session state.

**Architecture:** Keep the existing OAuth backend flow unchanged. Extend `frontend/utils/auth.py` with an encrypted cookie-backed persistence layer using `streamlit-cookies-manager-ext`: restore auth from the cookie manager, write on successful OAuth callback, and clear on logout. Handle the component readiness handshake by deferring cookie writes/clears until the manager is ready. Cover the behavior with focused frontend unit tests using a fake Streamlit object and fake cookie manager.

**Tech Stack:** Python, Streamlit, pytest, streamlit-cookies-manager-ext

---

### Task 1: Add failing restore-from-cookie test

**Files:**
- Modify: `tests/test_frontend/test_auth_return_to_origin.py`
- Test: `tests/test_frontend/test_auth_return_to_origin.py`

**Step 1: Write the failing test**

```python
def test_render_sidebar_restores_auth_from_cookie(monkeypatch):
    ...
```

**Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_auth_return_to_origin.py -k restores_auth_from_cookie`
Expected: FAIL because auth restore only reads `st.session_state`.

**Step 3: Write minimal implementation**

- Add helpers in `frontend/utils/auth.py` to restore persisted auth from the encrypted cookie manager.
- Restore `auth_token` and `auth_user_email` before sidebar auth checks.

**Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_auth_return_to_origin.py -k restores_auth_from_cookie`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/utils/auth.py tests/test_frontend/test_auth_return_to_origin.py
git commit -m "test: cover auth restore after refresh"
```

### Task 2: Add failing persistence-script tests

**Files:**
- Modify: `tests/test_frontend/test_auth_return_to_origin.py`
- Modify: `frontend/utils/auth.py`

**Step 1: Write the failing tests**

```python
def test_consume_oauth_callback_persists_auth_cookie(monkeypatch):
    ...

def test_logout_clears_persisted_auth_cookie(monkeypatch):
    ...
```

**Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_auth_return_to_origin.py -k "persists_auth_cookie or clears_persisted_auth_cookie"`
Expected: FAIL because login/logout currently do not emit any persistence script.

**Step 3: Write minimal implementation**

- Add helpers to write and clear the auth cookie through the encrypted cookie manager.
- Add deferred sync flags in session state so callback/logout flows still complete if the manager is not ready on the first render.
- Call the sync path from OAuth callback handling, logout, and normal render startup.

**Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_auth_return_to_origin.py -k "persists_auth_cookie or clears_persisted_auth_cookie"`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/utils/auth.py tests/test_frontend/test_auth_return_to_origin.py
git commit -m "feat: persist auth across refresh"
```

### Task 3: Run focused regression checks

**Files:**
- Verify: `frontend/utils/auth.py`
- Verify: `tests/test_frontend/test_auth_return_to_origin.py`
- Verify: `tests/test_frontend/test_auth_google_login_button.py`

**Step 1: Run the focused auth frontend tests**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_auth_return_to_origin.py tests/test_frontend/test_auth_google_login_button.py`
Expected: PASS

**Step 2: Review the diff**

Run: `git diff -- frontend/utils/auth.py tests/test_frontend/test_auth_return_to_origin.py docs/plans/2026-03-06-auth-refresh-persistence-design.md docs/plans/2026-03-06-auth-refresh-persistence-implementation-plan.md`
Expected: Only the planned auth persistence and docs changes are present.

**Step 3: Commit**

```bash
git add frontend/utils/auth.py tests/test_frontend/test_auth_return_to_origin.py docs/plans/2026-03-06-auth-refresh-persistence-design.md docs/plans/2026-03-06-auth-refresh-persistence-implementation-plan.md
git commit -m "feat: restore auth after page refresh"
```
