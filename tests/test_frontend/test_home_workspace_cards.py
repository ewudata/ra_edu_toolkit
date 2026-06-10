from pathlib import Path


def test_home_workspace_cards_use_refined_descriptions():
    source = Path("frontend/src/pages/Home.tsx").read_text(encoding="utf-8")

    assert "Import datasets, choose a working database, inspect schemas, preview rows, and manage user-added databases." in source
    assert "Solve catalog RA problems, filter by operators, evaluate expressions, compare results, and get guided help." in source
    assert "Practice RA/SQL translation, use guided or custom modes, check answers semantically, and preview results." in source
    assert "feature.description" in source
    assert "feature.items[0]" not in source
