from pathlib import Path


def test_ra_sql_reference_persists_workspace_state_in_session_storage():
    source = Path("frontend/src/pages/RASQLReference.tsx").read_text(encoding="utf-8")

    assert "REFERENCE_SESSION_STORAGE_KEY = 'ra_sql_reference_state_v1'" in source
    assert "window.sessionStorage.setItem(" in source
    assert "loadPersistedReferenceState()" in source
    assert "raAnswerMode," in source
    assert "freeformRaAnswer," in source


def test_ra_sql_reference_skips_database_reset_on_initial_restore():
    source = Path("frontend/src/pages/RASQLReference.tsx").read_text(encoding="utf-8")

    assert "const previousSelectedDbRef = useRef<string | null>" in source
    assert "if (previousSelectedDbRef.current === selectedDb) return;" in source
