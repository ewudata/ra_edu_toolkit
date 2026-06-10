from pathlib import Path


def test_working_database_helper_uses_session_storage():
    source = Path("frontend/src/lib/workingDatabase.ts").read_text(encoding="utf-8")

    assert "WORKING_DATABASE_STORAGE_KEY = 'ra_working_database_v1'" in source
    assert "window.sessionStorage.getItem(WORKING_DATABASE_STORAGE_KEY)" in source
    assert "window.sessionStorage.setItem(WORKING_DATABASE_STORAGE_KEY, value)" in source
    assert "window.sessionStorage.removeItem(WORKING_DATABASE_STORAGE_KEY)" in source


def test_auth_clears_working_database_with_ui_session_state():
    source = Path("frontend/src/lib/auth.tsx").read_text(encoding="utf-8")

    assert "WORKING_DATABASE_STORAGE_KEY" in source
    assert "UI_SESSION_STORAGE_KEYS" in source


def test_ra_exercises_reads_and_writes_shared_working_database():
    source = Path("frontend/src/pages/RAExercises.tsx").read_text(encoding="utf-8")

    assert "getWorkingDatabase" in source
    assert "const [selectedDb, setSelectedDb] = useState(() => getWorkingDatabase());" in source
    assert "setWorkingDatabase(nextDb);" in source
    assert "setWorkingDatabase('');" in source


def test_ra_sql_reference_prefers_shared_working_database_over_page_state():
    source = Path("frontend/src/pages/RASQLReference.tsx").read_text(encoding="utf-8")

    assert "const initialWorkingDatabase = getWorkingDatabase();" in source
    assert "useState(initialWorkingDatabase || persistedState?.selectedDb || '')" in source
    assert "setWorkingDatabase(nextDb);" in source


def test_database_manager_reads_writes_and_clears_shared_working_database():
    source = Path("frontend/src/pages/DatabaseManager.tsx").read_text(encoding="utf-8")

    assert "const [selectedDb, setSelectedDb] = useState(() => getWorkingDatabase());" in source
    assert "if (loading || !selectedDb || databases.length === 0) return;" in source
    assert "setWorkingDatabase(nextDb);" in source
    assert "setWorkingDatabase(db.name);" in source
    assert "setWorkingDatabase(result.name);" in source
    assert "setWorkingDatabase('');" in source
