# React Auth Bootstrap Design

## Goal

Ensure the React frontend attaches the bearer token before any protected API request after login, and clear persisted auth immediately when the backend returns `401`.

## Context

The backend correctly protects `/databases`, `/queries`, and evaluation endpoints with a bearer-token dependency. The frontend currently relies on `AuthProvider` to read OAuth callback query params or a persisted cookie and call `setAuthToken(...)` before protected pages mount.

The observed failure mode is a `401` with `Missing Authorization header.`, which means protected requests are leaving the frontend without a bearer token attached. Clearing cookies does not resolve it, so the issue is in the frontend bootstrap path rather than stale browser state alone.

## Options Considered

### 1. Keep the current provider shape and harden bootstrap

- Parse and apply OAuth callback tokens deterministically during provider initialization.
- Expose a centralized auth reset path for backend `401` failures.
- Keep page components unchanged.

Pros:
- Smallest change set.
- Fixes the immediate bug and the invalid-token recovery gap.
- Preserves the current routing and page structure.

Cons:
- Keeps auth state logic inside one provider module.

### 2. Move auth into a larger reducer or external state container

Pros:
- More explicit state transitions.

Cons:
- More churn than the bug requires.
- Touches more frontend code while the worktree already contains unrelated page changes.

Recommended: Option 1.

## Design

### Auth bootstrap

- Keep `AuthProvider` as the owner of login/logout/bootstrap.
- Add a shared helper that applies an auth token to both in-memory API state and provider state.
- Consume OAuth callback params before protected pages issue any data-loading requests.
- Keep cookie restore as a fallback when no callback token is present.

### Backend `401` recovery

- Add one API-level unauthorized hook that the auth provider registers.
- When a request fails with `401`, clear the in-memory token, remove the auth cookie, reset provider state, and store the backend detail as the current auth error.
- This covers expired, malformed, or otherwise rejected tokens without requiring manual cookie cleanup.

### Error handling

- Preserve existing login/logout behavior.
- Surface backend auth errors through the existing `error` state so `AuthGate` and account UI can show the failure.
- Avoid broad page-level rewrites; pages should continue calling `api.*` helpers.

### Testing

- Add a focused frontend test proving an OAuth callback token is applied to the API layer before protected requests would rely on it.
- Add a focused frontend test proving a backend `401` triggers auth reset and clears persisted auth.

## Scope

In scope:
- `frontend/src/lib/auth.tsx`
- `frontend/src/lib/api.ts`
- new focused frontend tests

Out of scope:
- broader route refactors
- changing backend auth rules
- unrelated page/UI cleanup
