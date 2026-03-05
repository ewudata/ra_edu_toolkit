import importlib.util
from pathlib import Path


def _load_relalg_page_module():
    module_path = Path("frontend/pages/2_🧮_Relational_Algebra_Exercises.py")
    spec = importlib.util.spec_from_file_location("relalg_exercises_page", module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_operator_options_include_selection_project_and_rename():
    module = _load_relalg_page_module()
    operator_keys = {key for key, _label in module.OPERATOR_OPTIONS}

    assert "selection" in operator_keys
    assert "project" in operator_keys
    assert "rename" in operator_keys


def test_query_operator_filter_uses_and_logic():
    module = _load_relalg_page_module()
    query = {"hints": ["selection", "natural join", "projection"]}

    assert module._query_matches_selected_operators(
        query, {"selection", "natural join"}
    )
    assert not module._query_matches_selected_operators(
        query, {"selection", "division"}
    )
