from pathlib import Path

from frontend.utils.query_difficulty import (
    difficulty_display_label,
    normalize_difficulty,
    sort_queries_by_difficulty,
)


def test_sort_queries_by_difficulty_orders_beginner_to_difficult():
    queries = [
        {"id": "q4", "prompt": "Difficult query", "difficulty": "difficult"},
        {"id": "q2", "prompt": "Intermediate query", "difficulty": "intermediate"},
        {"id": "q3", "prompt": "Also difficult", "difficulty": "advanced"},
        {"id": "q1", "prompt": "Beginner query", "difficulty": "beginner"},
    ]

    sorted_queries = sort_queries_by_difficulty(queries)

    assert [q["id"] for q in sorted_queries] == ["q1", "q2", "q3", "q4"]


def test_difficulty_normalization_and_display_label():
    assert normalize_difficulty("advanced") == "difficult"
    assert normalize_difficulty("BEGINNER") == "beginner"
    assert difficulty_display_label("advanced") == "Difficult"
    assert difficulty_display_label(None) == "Unknown difficulty"


def test_all_query_views_use_shared_difficulty_sorting():
    page2 = Path("frontend/pages/2_🧮_Relational_Algebra_Exercises.py").read_text(
        encoding="utf-8"
    )
    page3 = Path("frontend/pages/3_🧠_SQL_Exercises.py").read_text(encoding="utf-8")
    page4 = Path("frontend/pages/4_🔄_RA_↔️_SQL.py").read_text(encoding="utf-8")
    selector = Path("frontend/components/query_selector.py").read_text(
        encoding="utf-8"
    )

    assert "sort_queries_by_difficulty" in page2
    assert "sort_queries_by_difficulty" in page3
    assert "sort_queries_by_difficulty" in page4
    assert "sort_queries_by_difficulty" in selector
