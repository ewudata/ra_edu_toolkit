"""Shared Google authentication helpers for Streamlit pages."""

from __future__ import annotations

import html
import json
import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import streamlit as st
from streamlit_cookies_manager_ext import EncryptedCookieManager

from utils.api_client import APIClient

RETURN_PAGE_PARAM = "return_page"
AUTH_PARAM_KEYS = ("auth_error", "auth_token", "auth_email")
AUTH_COOKIE_KEY = "ra_edu_auth"
AUTH_COOKIE_PASSWORD_ENV = "AUTH_COOKIE_PASSWORD"
AUTH_COOKIE_PREFIX = "ra_edu_"
AUTH_COOKIE_PENDING_WRITE_KEY = "auth_cookie_sync_pending"
AUTH_COOKIE_PENDING_CLEAR_KEY = "auth_cookie_clear_pending"


def _init_auth_state() -> None:
    if "auth_token" not in st.session_state:
        st.session_state.auth_token = None
    if "auth_user_email" not in st.session_state:
        st.session_state.auth_user_email = None
    if "auth_error" not in st.session_state:
        st.session_state.auth_error = None
    if AUTH_COOKIE_PENDING_WRITE_KEY not in st.session_state:
        st.session_state[AUTH_COOKIE_PENDING_WRITE_KEY] = False
    if AUTH_COOKIE_PENDING_CLEAR_KEY not in st.session_state:
        st.session_state[AUTH_COOKIE_PENDING_CLEAR_KEY] = False


def _apply_auth_token(api_client: APIClient) -> None:
    token = st.session_state.get("auth_token")
    if token:
        api_client.set_auth_token(token)
    else:
        api_client.clear_auth_token()


def _serialize_persisted_auth(token: str, email: str) -> str:
    return json.dumps(
        {"auth_token": token, "auth_user_email": email},
        separators=(",", ":"),
    )


def _cookie_password() -> str:
    return (
        os.getenv(AUTH_COOKIE_PASSWORD_ENV)
        or os.getenv("OAUTH_STATE_SECRET")
        or "ra-edu-auth-dev-only"
    )


def _get_cookie_manager() -> EncryptedCookieManager:
    return EncryptedCookieManager(
        password=_cookie_password(),
        prefix=AUTH_COOKIE_PREFIX,
        path="/",
    )


def _restore_persisted_auth(
    api_client: APIClient, cookie_manager: EncryptedCookieManager | None
) -> None:
    if st.session_state.get("auth_token"):
        return

    if cookie_manager is None or not cookie_manager.ready():
        return

    try:
        raw_cookie = cookie_manager.get(AUTH_COOKIE_KEY)
        if not raw_cookie:
            return
        payload = json.loads(str(raw_cookie))
    except (TypeError, ValueError):
        return

    token = payload.get("auth_token")
    if not token:
        return

    st.session_state.auth_token = str(token)
    st.session_state.auth_user_email = str(
        payload.get("auth_user_email") or "Google User"
    )
    st.session_state.auth_error = None
    _apply_auth_token(api_client)


def _persist_auth_cookie(
    cookie_manager: EncryptedCookieManager | None, token: str, email: str
) -> bool:
    if cookie_manager is None or not cookie_manager.ready():
        return False
    cookie_manager[AUTH_COOKIE_KEY] = _serialize_persisted_auth(token, email)
    cookie_manager.save()
    return True


def _clear_persisted_auth_cookie(cookie_manager: EncryptedCookieManager | None) -> bool:
    if cookie_manager is None or not cookie_manager.ready():
        return False
    if AUTH_COOKIE_KEY in cookie_manager:
        del cookie_manager[AUTH_COOKIE_KEY]
        cookie_manager.save()
    return True


def _sync_pending_auth_cookie_state(
    cookie_manager: EncryptedCookieManager | None,
) -> None:
    if cookie_manager is None or not cookie_manager.ready():
        return

    if st.session_state.get(AUTH_COOKIE_PENDING_CLEAR_KEY):
        _clear_persisted_auth_cookie(cookie_manager)
        st.session_state[AUTH_COOKIE_PENDING_CLEAR_KEY] = False

    if st.session_state.get(AUTH_COOKIE_PENDING_WRITE_KEY) and st.session_state.get(
        "auth_token"
    ):
        _persist_auth_cookie(
            cookie_manager,
            st.session_state.auth_token,
            st.session_state.get("auth_user_email") or "Google User",
        )
        st.session_state[AUTH_COOKIE_PENDING_WRITE_KEY] = False


def _consume_oauth_callback_params(
    api_client: APIClient, cookie_manager: EncryptedCookieManager | None
) -> None:
    params = st.query_params
    token = params.get("auth_token")
    email = params.get("auth_email")
    auth_error = params.get("auth_error")
    return_page = params.get(RETURN_PAGE_PARAM)

    if auth_error:
        st.session_state.auth_error = str(auth_error)
        for key in AUTH_PARAM_KEYS:
            if key in params:
                del params[key]
        return

    if token:
        st.session_state.auth_token = str(token)
        st.session_state.auth_user_email = str(email or "Google User")
        st.session_state.auth_error = None
        _apply_auth_token(api_client)
        if not _persist_auth_cookie(
            cookie_manager,
            st.session_state.auth_token,
            st.session_state.auth_user_email,
        ):
            st.session_state[AUTH_COOKIE_PENDING_WRITE_KEY] = True
            return
        for key in AUTH_PARAM_KEYS:
            if key in params:
                del params[key]
        if return_page:
            if RETURN_PAGE_PARAM in params:
                del params[RETURN_PAGE_PARAM]
            st.switch_page(str(return_page))
        st.rerun()


def _build_frontend_redirect_url(
    frontend_base_url: str, return_page: str | None
) -> str:
    base_url = frontend_base_url.rstrip("/")
    if not return_page:
        return base_url

    split_url = urlsplit(base_url)
    merged_params = dict(parse_qsl(split_url.query, keep_blank_values=True))
    merged_params[RETURN_PAGE_PARAM] = return_page
    return urlunsplit(
        (
            split_url.scheme,
            split_url.netloc,
            split_url.path,
            urlencode(merged_params),
            split_url.fragment,
        )
    )


def _logout(api_client: APIClient) -> None:
    st.session_state.auth_token = None
    st.session_state.auth_user_email = None
    st.session_state.auth_error = None
    st.session_state.progress_cache = {}
    st.session_state.progress_error = None
    st.session_state[AUTH_COOKIE_PENDING_WRITE_KEY] = False
    cookie_manager = _get_cookie_manager()
    if not _clear_persisted_auth_cookie(cookie_manager):
        st.session_state[AUTH_COOKIE_PENDING_CLEAR_KEY] = True
    else:
        st.session_state[AUTH_COOKIE_PENDING_CLEAR_KEY] = False
    _apply_auth_token(api_client)
    st.rerun()


def render_sidebar_account(api_client: APIClient) -> bool:
    _init_auth_state()
    cookie_manager = _get_cookie_manager()
    _consume_oauth_callback_params(api_client, cookie_manager)
    _sync_pending_auth_cookie_state(cookie_manager)
    _restore_persisted_auth(api_client, cookie_manager)
    _apply_auth_token(api_client)

    if (
        not st.session_state.get("auth_token")
        and cookie_manager is not None
        and not cookie_manager.ready()
    ):
        with st.sidebar:
            st.header("Account")
            st.caption("Loading session...")
        st.stop()

    with st.sidebar:
        st.header("Account")
        if st.session_state.get("auth_token"):
            st.success(f"Signed in as {st.session_state.get('auth_user_email')}")
            if st.button("Log Out", key="sidebar_logout_button"):
                _logout(api_client)
            return True
    return False


def require_authentication(
    api_client: APIClient, return_page: str | None = None
) -> bool:
    if render_sidebar_account(api_client):
        return True

    st.warning("Sign in with Google to access this application.")
    try:
        frontend_redirect = _build_frontend_redirect_url(
            os.getenv("FRONTEND_BASE_URL", "http://localhost:8501"),
            return_page,
        )
        oauth_url = api_client.get_google_login_url(frontend_redirect)
        safe_oauth_url = html.escape(oauth_url, quote=True)
        st.markdown(
            (
                '<a href="'
                f"{safe_oauth_url}"
                '" target="_self" '
                'style="display:inline-block;padding:0.5rem 0.85rem;'
                'border-radius:0.5rem;background:#1f77b4;color:#fff;'
                'text-decoration:none;font-weight:600;">'
                "Log in with Google"
                "</a>"
            ),
            unsafe_allow_html=True,
        )
    except Exception as exc:
        st.session_state.auth_error = str(exc)

    if st.session_state.get("auth_error"):
        st.error(f"Authentication failed: {st.session_state.auth_error}")
    return False
