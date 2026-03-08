from pathlib import Path


def test_protected_react_routes_are_wrapped_before_page_mount():
    app_source = Path("frontend/src/App.tsx").read_text(encoding="utf-8")

    assert "ProtectedRoute" in app_source
    assert '<Route index element={<ProtectedRoute><Home /></ProtectedRoute>} />' in app_source
    assert '<Route path="databases" element={<ProtectedRoute><DatabaseManager /></ProtectedRoute>} />' in app_source
    assert '<Route path="ra-exercises" element={<ProtectedRoute><RAExercises /></ProtectedRoute>} />' in app_source
    assert '<Route path="sql-exercises" element={<ProtectedRoute><SQLExercises /></ProtectedRoute>} />' in app_source
    assert '<Route path="ra-sql-reference" element={<ProtectedRoute><RASQLReference /></ProtectedRoute>} />' in app_source


def test_protected_pages_do_not_embed_auth_gate_inside_page_components():
    protected_pages = [
        Path("frontend/src/pages/Home.tsx"),
        Path("frontend/src/pages/DatabaseManager.tsx"),
        Path("frontend/src/pages/RAExercises.tsx"),
        Path("frontend/src/pages/SQLExercises.tsx"),
        Path("frontend/src/pages/RASQLReference.tsx"),
    ]

    for page in protected_pages:
        source = page.read_text(encoding="utf-8")
        assert "import AuthGate" not in source
        assert "<AuthGate>" not in source
        assert "</AuthGate>" not in source


def test_auth_provider_uses_shared_session_helpers_for_callback_bootstrap_and_reset():
    source = Path("frontend/src/lib/auth.tsx").read_text(encoding="utf-8")

    assert "function applyAuthenticatedSession" in source
    assert "function clearAuthState" in source
    assert "applyAuthenticatedSession(authToken, email);" in source
    assert "setUnauthorizedHandler((message) => {" in source
    assert "clearAuthState(message);" in source


def test_api_layer_exposes_unauthorized_handler_and_explicit_collection_routes():
    source = Path("frontend/src/lib/api.ts").read_text(encoding="utf-8")

    assert "let _onUnauthorized: ((message: string) => void) | null = null;" in source
    assert "export function setUnauthorizedHandler" in source
    assert "if (res.status === 401) _onUnauthorized?.(message);" in source
    assert "getDatabases: () => request<Database[]>('GET', '/databases/')" in source
