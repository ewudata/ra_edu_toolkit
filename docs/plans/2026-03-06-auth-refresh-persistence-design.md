# Auth Refresh Persistence Design

## Goal

Keep authenticated users signed in when they refresh a Streamlit page, and continue restoring that sign-in state when they reopen the app in the same browser until they log out or the backend rejects the token.

## Context

The current frontend auth flow stores `auth_token` and `auth_user_email` only in `st.session_state`. That state is tied to the current Streamlit session, so a browser refresh starts a new session and loses the token even though the OAuth login already succeeded.

## Options Considered

### 1. Keep auth in query parameters

This would make refresh work because the token remains in the URL, but it leaves bearer tokens in browser history, copied links, screenshots, logs, and bookmarks. That is an unnecessary security regression.

### 2. Add a third-party cookie/local-storage dependency

This is the most reliable option in the current Streamlit stack. Streamlit can read request cookies, but it does not provide a native Python API to write browser cookies for future requests. A small component package is the practical bridge.

### 3. Use browser cookies with existing Streamlit context support only

This is not sufficient on its own. `st.html` does not execute JavaScript, and `streamlit.components.v1.html` runs inside an iframe, so ad hoc script injection is not a dependable way to write cookies for the main app.

Recommended: Option 2.

## Design

### Storage model

- Add one frontend cookie key for persisted auth state.
- Store a compact JSON payload containing `auth_token` and `auth_user_email`.
- Use `streamlit-cookies-manager-ext` with encryption so the browser cookie is written and read through a supported Streamlit component boundary.

### Restore flow

- During auth initialization, if `st.session_state.auth_token` is empty, inspect the encrypted cookie manager.
- If the auth cookie exists and parses successfully, restore `auth_token` and `auth_user_email` into session state.
- Apply the token to `APIClient` before protected page logic runs.

### Login flow

- Keep consuming OAuth callback query params as today.
- After receiving `auth_token` and `auth_email`, store them in session state and write the auth cookie through the cookie manager.
- Continue removing OAuth query params from the URL.
- If the cookie manager is not ready on the first callback render, defer persistence until the manager finishes initialization.

### Logout flow

- Clear session state as today.
- Delete the auth cookie through the cookie manager.
- If the cookie manager is not ready on that render, defer the clear and process it before any restore attempt on the next rerun.

### Invalid stored token behavior

- If the frontend later receives an auth-related backend failure while using a restored token, clear both the session token and persisted cookie.
- The first scoped version will at minimum clear persisted auth on explicit logout. If existing auth error handling already clears the token on backend rejection, reuse that path.

## Testing

- Add a frontend unit test proving auth is restored from cookie-backed context into session state and applied to the API client.
- Add a frontend unit test proving login callback handling emits the persistence script.
- Add a frontend unit test proving logout clears the persisted cookie state.
