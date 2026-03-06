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


def test_empty_operator_selection_means_show_all_queries():
    module = _load_relalg_page_module()
    queries = [
        {"id": "q1", "hints": ["selection"]},
        {"id": "q2", "hints": ["natural join"]},
    ]

    selected_ops = set()
    filtered = [
        query
        for query in queries
        if not selected_ops
        or module._query_matches_selected_operators(query, selected_ops)
    ]

    assert filtered == queries


def test_predefined_mode_card_copy_is_removed():
    page_source = Path(
        "frontend/pages/2_🧮_Relational_Algebra_Exercises.py"
    ).read_text(encoding="utf-8")

    assert "Practice with Pre-defined Queries" not in page_source


def test_operator_multiselect_selected_tags_use_light_pill_styling():
    page_source = Path(
        "frontend/pages/2_🧮_Relational_Algebra_Exercises.py"
    ).read_text(encoding="utf-8")

    assert '[data-baseweb="tag"]' in page_source
    assert "background-color: #ffffff" in page_source
    assert "color: #0f172a" in page_source
