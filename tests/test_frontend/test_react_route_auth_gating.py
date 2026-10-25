from pathlib import Path


def test_guest_pages_are_public_and_progress_remains_protected():
    app_source = Path("frontend/src/App.tsx").read_text(encoding="utf-8")

    assert '<Route path="progress" element={<ProtectedRoute><ProgressDashboard /></ProtectedRoute>} />' in app_source
    assert "if (loading) return" in app_source
    assert "<Routes key={sessionRevision}>" in app_source
    assert '<Route index element={<Home />} />' in app_source
    assert '<Route path="databases" element={<DatabaseManager />} />' in app_source
    assert '<Route path="ra-exercises" element={<RAExercises />} />' in app_source
    assert '<Route path="ra-sql-reference" element={<RASQLReference />} />' in app_source


def test_protected_pages_do_not_embed_auth_gate_inside_page_components():
    protected_pages = [
        Path("frontend/src/pages/Home.tsx"),
        Path("frontend/src/pages/DatabaseManager.tsx"),
        Path("frontend/src/pages/RAExercises.tsx"),
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
    assert "applyAuthenticatedSession(authToken, email, authRefreshToken || null);" in source
    assert "setUnauthorizedHandler((message) => {" in source
    assert "clearAuthState(message);" in source


def test_api_layer_exposes_unauthorized_handler_and_explicit_collection_routes():
    source = Path("frontend/src/lib/api.ts").read_text(encoding="utf-8")

    assert "let _onUnauthorized: ((message: string) => void) | null = null;" in source
    assert "export function setUnauthorizedHandler" in source
    assert "if (isAuthError) _onUnauthorized?.(message);" in source
    assert "getDatabases: () => request<Database[]>('GET', '/databases/')" in source


def test_main_pages_share_the_ra_exercises_visual_shell_markers():
    expected_markers = [
        "Academic Practice Studio",
        "rounded-[26px] border border-[#dde1f0] bg-[linear-gradient(135deg,#f5f4ff_0%,#eef2ff_52%,#eef7f4_100%)]",
        "rounded-[24px] border border-[#dfe2f0] bg-[rgba(255,255,255,0.82)]",
    ]

    for page in [
        Path("frontend/src/pages/Home.tsx"),
        Path("frontend/src/pages/DatabaseManager.tsx"),
        Path("frontend/src/pages/RASQLReference.tsx"),
    ]:
        source = page.read_text(encoding="utf-8")
        for marker in expected_markers:
            assert marker in source


def test_layout_uses_wide_container_for_tool_pages_only():
    layout_source = Path("frontend/src/components/Layout.tsx").read_text(encoding="utf-8")
    css_source = Path("frontend/src/index.css").read_text(encoding="utf-8")

    assert "const { pathname } = useLocation();" in layout_source
    assert "pathname === '/' ? 'app-container' : 'app-container app-container-wide'" in layout_source
    assert ".app-container-wide" in css_source
    assert "max-width: 1800px;" in css_source
