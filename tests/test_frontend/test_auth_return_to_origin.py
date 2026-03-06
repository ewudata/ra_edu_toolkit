import os
import sys
from types import SimpleNamespace

sys.path.append(os.path.join(os.getcwd(), "frontend"))

from frontend.utils import auth


def test_build_frontend_redirect_includes_return_page():
    redirect = auth._build_frontend_redirect_url(
        "http://localhost:8501", "pages/1_🗄️_Database_Manager.py"
    )

    assert (
        redirect
        == "http://localhost:8501?return_page=pages%2F1_%F0%9F%97%84%EF%B8%8F_Database_Manager.py"
    )


def test_build_frontend_redirect_without_return_page_uses_base_url():
    redirect = auth._build_frontend_redirect_url("http://localhost:8501", None)

    assert redirect == "http://localhost:8501"


class _FakeSidebar:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class _FakeStreamlit:
    def __init__(self, *, query_params=None, cookies=None):
        self.session_state = _FakeSessionState()
        self.query_params = query_params or {}
        self.context = SimpleNamespace(cookies=cookies or {})
        self.sidebar = _FakeSidebar()
        self.markdown_calls = []
        self.rerun_called = False
        self.caption_calls = []

    def header(self, _text):
        return None

    def caption(self, text):
        self.caption_calls.append(text)

    def success(self, _text):
        return None

    def button(self, _label, key=None):
        return False

    def markdown(self, body, unsafe_allow_html=False):
        self.markdown_calls.append((body, unsafe_allow_html))

    def warning(self, _text):
        return None

    def error(self, _text):
        return None

    def rerun(self):
        self.rerun_called = True

    def switch_page(self, _page):
        raise AssertionError("switch_page should not be called in this test")


class _FakeSessionState(dict):
    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError as exc:
            raise AttributeError(name) from exc

    def __setattr__(self, name, value):
        self[name] = value


class _StubClient:
    def __init__(self):
        self.auth_token = None

    def set_auth_token(self, token):
        self.auth_token = token

    def clear_auth_token(self):
        self.auth_token = None

    def get_google_login_url(self, frontend_redirect):
        return frontend_redirect


class _FakeCookieManager(dict):
    def __init__(self, *, ready=True, initial=None):
        super().__init__(initial or {})
        self._ready = ready
        self.save_calls = 0

    def ready(self):
        return self._ready

    def save(self):
        self.save_calls += 1


def test_render_sidebar_restores_auth_from_cookie():
    fake_st = _FakeStreamlit()
    fake_cookie_manager = _FakeCookieManager(
        initial={
            auth.AUTH_COOKIE_KEY: '{"auth_token":"persisted-token","auth_user_email":"user@example.com"}'
        }
    )
    api_client = _StubClient()
    original_st = auth.st
    original_get_cookie_manager = auth._get_cookie_manager
    auth.st = fake_st
    auth._get_cookie_manager = lambda: fake_cookie_manager
    try:
        assert auth.render_sidebar_account(api_client) is True
    finally:
        auth.st = original_st
        auth._get_cookie_manager = original_get_cookie_manager

    assert fake_st.session_state["auth_token"] == "persisted-token"
    assert fake_st.session_state["auth_user_email"] == "user@example.com"
    assert api_client.auth_token == "persisted-token"


def test_consume_oauth_callback_persists_auth_cookie():
    fake_st = _FakeStreamlit(
        query_params={
            "auth_token": "token-123",
            "auth_email": "user@example.com",
        }
    )
    fake_cookie_manager = _FakeCookieManager()
    api_client = _StubClient()
    original_st = auth.st
    auth.st = fake_st
    try:
        auth._init_auth_state()
        auth._consume_oauth_callback_params(api_client, fake_cookie_manager)
    finally:
        auth.st = original_st

    assert fake_st.rerun_called is True
    assert auth.AUTH_COOKIE_KEY in fake_cookie_manager
    assert fake_cookie_manager.save_calls == 1


def test_logout_clears_persisted_auth_cookie():
    fake_st = _FakeStreamlit()
    fake_cookie_manager = _FakeCookieManager(
        initial={
            auth.AUTH_COOKIE_KEY: '{"auth_token":"token-123","auth_user_email":"user@example.com"}'
        }
    )
    fake_st.session_state.update(
        {
            "auth_token": "token-123",
            "auth_user_email": "user@example.com",
            "auth_error": None,
            "progress_cache": {"x": 1},
            "progress_error": "boom",
        }
    )
    api_client = _StubClient()
    api_client.set_auth_token("token-123")
    original_st = auth.st
    original_get_cookie_manager = auth._get_cookie_manager
    auth.st = fake_st
    auth._get_cookie_manager = lambda: fake_cookie_manager
    try:
        auth._logout(api_client)
    finally:
        auth.st = original_st
        auth._get_cookie_manager = original_get_cookie_manager

    assert fake_st.session_state["auth_token"] is None
    assert api_client.auth_token is None
    assert fake_st.rerun_called is True
    assert auth.AUTH_COOKIE_KEY not in fake_cookie_manager
    assert fake_cookie_manager.save_calls == 1


def test_oauth_callback_marks_cookie_sync_pending_when_cookie_manager_not_ready():
    fake_st = _FakeStreamlit(
        query_params={
            "auth_token": "token-123",
            "auth_email": "user@example.com",
        }
    )
    fake_cookie_manager = _FakeCookieManager(ready=False)
    api_client = _StubClient()
    original_st = auth.st
    auth.st = fake_st
    try:
        auth._init_auth_state()
        auth._consume_oauth_callback_params(api_client, fake_cookie_manager)
    finally:
        auth.st = original_st

    assert fake_st.session_state["auth_token"] == "token-123"
    assert fake_st.session_state[auth.AUTH_COOKIE_PENDING_WRITE_KEY] is True
    assert fake_st.rerun_called is False
    assert fake_st.query_params["auth_token"] == "token-123"
