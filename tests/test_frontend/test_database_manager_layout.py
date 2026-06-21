from pathlib import Path


def test_database_manager_uses_tool_page_rail_layout():
    source = Path("frontend/src/pages/DatabaseManager.tsx").read_text(encoding="utf-8")

    assert "type WorkspaceMode = 'browse' | 'import';" in source
    assert "Manager Setup" in source
    assert "Choose a database workspace" in source
    assert "Database Rail" in source
    assert "Workspace catalog" in source
    assert "grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]" in source
    assert "mode === 'browse' && selectedDbInfo" in source
    assert "mode === 'import'" in source
    assert "Choose a working database" in source


def test_database_manager_keeps_import_and_schema_workflows():
    source = Path("frontend/src/pages/DatabaseManager.tsx").read_text(encoding="utf-8")

    assert "handleZipImport" in source
    assert "handleSqlImport" in source
    assert "loadSchema(selectedDbInfo.name)" in source
    assert "hideSchema(selectedDbInfo.name)" in source
    assert "Import ZIP dataset" in source
    assert "Import SQL dataset" in source
    assert "? 'Hide' : 'Load'} table details" in source
    assert "? 'Refresh' : 'Load'} table details" not in source


def test_database_manager_uses_single_dataset_action_status():
    source = Path("frontend/src/pages/DatabaseManager.tsx").read_text(encoding="utf-8")

    assert "datasetActionMsg" in source
    assert "catalogMsg" not in source
    assert "importMsg" not in source
    assert "if (nextDb !== selectedDb) setDatasetActionMsg(null);" in source
    assert "if (db.name !== selectedDb) setDatasetActionMsg(null);" in source


def test_database_manager_does_not_auto_select_or_show_catalog_refresh_action():
    source = Path("frontend/src/pages/DatabaseManager.tsx").read_text(encoding="utf-8")

    assert "setSelectedDb(databases[0].name)" not in source
    assert "Refresh catalog" not in source


def test_database_manager_dataset_summary_copy_and_order():
    source = Path("frontend/src/pages/DatabaseManager.tsx").read_text(encoding="utf-8")

    summary_start = source.index("Dataset summary")
    database_name_start = source.index("Database name:", summary_start)
    table_count_start = source.index("Table count:", summary_start)
    shared_status_start = source.index("Shared starter dataset:", summary_start)

    assert summary_start < database_name_start < table_count_start < shared_status_start
    assert "Yes; protected from deletion" in source
    assert "This shared starter dataset is protected." not in source
