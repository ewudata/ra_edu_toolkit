# React Auth Bootstrap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure the React frontend attaches auth tokens before protected API requests and automatically clears persisted auth on backend `401` responses.

**Architecture:** Keep the existing React auth provider and API client structure. Add a centralized unauthorized handler in the API layer, then let the auth provider own bootstrap, token application, cookie persistence, and auth reset behavior.

**Tech Stack:** React 19, TypeScript, Vite, js-cookie, pytest source-inspection tests

---

### Task 1: Cover token bootstrap in a failing test

**Files:**
- Modify: `tests/test_frontend/test_react_route_auth_gating.py`
- Verify: `frontend/src/lib/auth.tsx`

**Step 1: Write the failing test**

Add a source-level test that asserts the auth provider applies callback tokens through a shared helper before marking auth loading complete.

**Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_react_route_auth_gating.py`

Expected: FAIL because the current provider sets `setAuthToken(...)` inline and lacks the new bootstrap/reset structure.

**Step 3: Write minimal implementation**

Update `frontend/src/lib/auth.tsx` to use a shared token-application helper during callback bootstrap.

**Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_react_route_auth_gating.py`

Expected: PASS

### Task 2: Cover backend `401` auth reset in a failing test

**Files:**
- Modify: `tests/test_frontend/test_react_route_auth_gating.py`
- Verify: `frontend/src/lib/api.ts`
- Verify: `frontend/src/lib/auth.tsx`

**Step 1: Write the failing test**

Add a source-level test that asserts:
- the API layer exposes an unauthorized handler registration point
- the auth provider registers a reset handler
- reset clears cookie-backed auth and provider token state

**Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_react_route_auth_gating.py`

Expected: FAIL because the API layer does not currently expose a `401` callback hook.

**Step 3: Write minimal implementation**

Add the unauthorized hook in `frontend/src/lib/api.ts` and register/reset auth state from `frontend/src/lib/auth.tsx`.

**Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_react_route_auth_gating.py`

Expected: PASS

### Task 3: Keep API paths explicit and avoid redirect noise

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Verify: `backend/routes/databases.py`
- Verify: `backend/routes/queries.py`

**Step 1: Write the failing test**

Extend the source-level test to assert protected collection endpoints use explicit trailing slashes where the backend route is defined with `@router.get("/")`.

**Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_react_route_auth_gating.py`

Expected: FAIL because `getDatabases()` currently requests `'/databases'`.

**Step 3: Write minimal implementation**

Adjust the API helper endpoints to hit the backend routes directly without relying on a redirect.

**Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_react_route_auth_gating.py`

Expected: PASS

### Task 4: Verify the focused auth regression coverage

**Files:**
- Verify: `tests/test_frontend/test_react_route_auth_gating.py`
- Verify: `frontend/src/lib/auth.tsx`
- Verify: `frontend/src/lib/api.ts`

**Step 1: Run focused tests**

Run: `PYTHONPATH=. .venv/bin/pytest -q tests/test_frontend/test_react_route_auth_gating.py tests/test_frontend/test_auth_return_to_origin.py`

Expected: PASS

**Step 2: Run frontend type/build verification**

Run: `npm run build`
Workdir: `frontend`

Expected: PASS

**Step 3: Review diff**

Run: `git diff -- docs/plans/2026-03-08-react-auth-bootstrap-design.md docs/plans/2026-03-08-react-auth-bootstrap-implementation-plan.md frontend/src/lib/auth.tsx frontend/src/lib/api.ts tests/test_frontend/test_react_route_auth_gating.py`

Expected: Only the planned auth bootstrap and recovery changes are present.
