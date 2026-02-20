import ast
import importlib.util
from pathlib import Path


def _load_database_manager_module():
    module_path = Path("frontend/pages/1_🗄️_Database_Manager.py")
    spec = importlib.util.spec_from_file_location("database_manager_page", module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module, module_path


def test_main_does_not_directly_fetch_schema():
    _module, module_path = _load_database_manager_module()
    tree = ast.parse(module_path.read_text(encoding="utf-8"))

    main_fn = next(
        node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "main"
    )
    schema_calls = []
    for node in ast.walk(main_fn):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if node.func.attr == "get_database_schema":
                schema_calls.append(node)

    assert len(schema_calls) == 0


def test_clear_preview_cache_specific_and_all():
    module, _ = _load_database_manager_module()

    class FakeStreamlit:
        def __init__(self):
            self.session_state = {
                module.PREVIEW_CACHE_KEY: {"A": {"t": {}}, "B": {"u": {}}},
                module.PREVIEW_ERROR_KEY: {"A": "err"},
            }

    fake_st = FakeStreamlit()
    original_st = module.st
    module.st = fake_st
    try:
        module._clear_preview_cache("A")
        assert "A" not in fake_st.session_state[module.PREVIEW_CACHE_KEY]
        assert "A" not in fake_st.session_state[module.PREVIEW_ERROR_KEY]

        module._clear_preview_cache()
        assert module.PREVIEW_CACHE_KEY not in fake_st.session_state
        assert module.PREVIEW_ERROR_KEY not in fake_st.session_state
    finally:
        module.st = original_st


def test_clear_db_list_cache_calls_clear_hooks():
    module, _ = _load_database_manager_module()

    called = {"health": 0, "databases": 0}

    class _CacheHook:
        def __init__(self, key):
            self.key = key

        def clear(self):
            called[self.key] += 1

    original_health = module._cached_health_check
    original_databases = module._cached_get_databases
    module._cached_health_check = _CacheHook("health")
    module._cached_get_databases = _CacheHook("databases")
    try:
        module._clear_db_list_cache()
    finally:
        module._cached_health_check = original_health
        module._cached_get_databases = original_databases

    assert called == {"health": 1, "databases": 1}
