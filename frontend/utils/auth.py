"""Shared Google authentication helpers for Streamlit pages."""

from __future__ import annotations

import html
import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import streamlit as st

from utils.api_client import APIClient

RETURN_PAGE_PARAM = "return_page"
AUTH_PARAM_KEYS = ("auth_error", "auth_token", "auth_email")


def _init_auth_state() -> None:
    if "auth_token" not in st.session_state:
        st.session_state.auth_token = None
    if "auth_user_email" not in st.session_state:
        st.session_state.auth_user_email = None
    if "auth_error" not in st.session_state:
        st.session_state.auth_error = None


def _apply_auth_token(api_client: APIClient) -> None:
    token = st.session_state.get("auth_token")
    if token:
        api_client.set_auth_token(token)
    else:
        api_client.clear_auth_token()


def _consume_oauth_callback_params(api_client: APIClient) -> None:
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
    _apply_auth_token(api_client)
    st.rerun()


def render_sidebar_account(api_client: APIClient) -> bool:
    _init_auth_state()
    _consume_oauth_callback_params(api_client)
    _apply_auth_token(api_client)

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
