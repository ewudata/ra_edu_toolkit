from pathlib import Path


def test_react_ra_exercise_prompt_displays_operator_symbols_with_aliases():
    page_source = Path("frontend/src/pages/RAExercises.tsx").read_text(encoding="utf-8")

    assert "function operatorHintDisplays(" in page_source
    assert "Operators:" in page_source
    assert "symbol: 'σ', aliases: 'sigma'" in page_source
    assert "symbol: 'π', aliases: 'pi'" in page_source
    assert "symbol: '⋈', aliases: 'natural_join, natjoin, njoin'" in page_source
