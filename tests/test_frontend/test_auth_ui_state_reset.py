from pathlib import Path


def test_auth_provider_clears_persisted_ui_state_on_login_callback_and_logout():
    source = Path("frontend/src/lib/auth.tsx").read_text(encoding="utf-8")

    assert "const UI_SESSION_STORAGE_KEYS = [" in source
    assert "'ra_sql_reference_state_v1'," in source
    assert "function clearUiSessionState()" in source
    assert "UI_SESSION_STORAGE_KEYS.forEach((key) => window.sessionStorage.removeItem(key));" in source
    assert "clearUiSessionState();\n      applyAuthenticatedSession(authToken, email, authRefreshToken || null);" in source
    assert "clearUiSessionState();\n    clearAuthState(null);" in source
