# Auth Return-To-Origin Design

Topic: Preserve the originally requested protected page across Google OAuth login.

Date: 2026-03-06

## Problem

Protected Streamlit pages call `require_authentication(...)` and display a Google login prompt when the user is signed out. The current OAuth flow always redirects back to the frontend root after authentication, so users land on Home instead of the page they originally tried to open.

## Goal

After successful Google login, return the user to the protected page that initiated login instead of always sending them to Home.

## Current Behavior

- Frontend pages call `frontend/utils/auth.py:require_authentication`.
- The login link is built with `APIClient.get_google_login_url(frontend_redirect)`.
- `frontend_redirect` is currently the `FRONTEND_BASE_URL` environment variable, which points to the frontend root.
- The backend OAuth callback redirects to that root URL with `auth_token` and `auth_email` query parameters.

## Recommended Approach

Pass the exact current frontend URL into the OAuth start request, then preserve that URL when the backend callback redirects back after token exchange.

This keeps the redirect target in the existing OAuth state flow, avoids new server-side session state, and applies uniformly to all protected pages.

## Alternatives Considered

### 1. Store the destination in Streamlit session state

Rejected because the browser leaves the app for OAuth and returns through a full redirect. The frontend URL is a more reliable source of truth than in-memory frontend state.

### 2. Add a second post-login destination parameter handled only by the frontend

Rejected because it adds another layer of redirect bookkeeping without improving correctness over using the actual current page URL directly.

## Design

### Frontend

- Add a helper that computes the current frontend URL from Streamlit request/query context.
- Update `require_authentication(...)` to pass that exact URL into `get_google_login_url(...)`.
- Continue consuming `auth_token`, `auth_email`, and `auth_error` from the returned query string as today.

### Backend

- Keep accepting the `frontend_redirect` value already embedded in the OAuth state context.
- When redirecting after a successful callback, append auth query parameters onto the full `frontend_redirect` URL instead of assuming the root path.
- Preserve any existing query parameters already present on the target URL.

### Scope

This behavior applies to all protected frontend pages:

- Home
- Database Manager
- Relational Algebra Exercises
- SQL Exercises
- RA ↔ SQL

## Error Handling

- If OAuth fails before token exchange, continue redirecting to the frontend base URL with `auth_error`.
- If the stored `frontend_redirect` is missing or malformed, fall back to the existing frontend base URL behavior.
- Successful logins should only reroute to the original page when a valid return URL is available.

## Testing

- Frontend test: verify the login URL request uses the current page URL rather than the root frontend URL.
- Backend test: verify callback redirects back to a non-root page and preserves existing query parameters while appending auth parameters.
- Regression test: root-page login should still redirect back to the root page correctly.

## Expected Outcome

A signed-out user who opens any protected page, signs in with Google, and returns from OAuth should land on the same page they originally requested.
