"""Shared Google authentication helpers for Streamlit pages."""

from __future__ import annotations

import os

import streamlit as st

from utils.api_client import APIClient


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

    if auth_error:
        st.session_state.auth_error = str(auth_error)
        for key in ("auth_error", "auth_token", "auth_email"):
            if key in params:
                del params[key]
        return

    if token:
        st.session_state.auth_token = str(token)
        st.session_state.auth_user_email = str(email or "Google User")
        st.session_state.auth_error = None
        _apply_auth_token(api_client)
        for key in ("auth_error", "auth_token", "auth_email"):
            if key in params:
                del params[key]
        st.rerun()


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


def require_authentication(api_client: APIClient) -> bool:
    if render_sidebar_account(api_client):
        return True

    st.warning("Sign in with Google to access this application.")
    try:
        frontend_redirect = os.getenv("FRONTEND_BASE_URL", "http://localhost:8501")
        oauth_url = api_client.get_google_login_url(frontend_redirect)
        st.link_button("Continue with Google", oauth_url, type="primary")
    except Exception as exc:
        st.session_state.auth_error = str(exc)

    if st.session_state.get("auth_error"):
        st.error(f"Authentication failed: {st.session_state.auth_error}")
    return False
