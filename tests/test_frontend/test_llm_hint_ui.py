from pathlib import Path


def test_api_client_exposes_llm_hint_endpoint():
    source = Path("frontend/src/lib/api.ts").read_text(encoding="utf-8")

    assert "generateHint" in source
    assert "/databases/${database}/queries/${queryId}/llm/hint" in source
    assert "LlmHintResponse" in source


def test_ra_exercises_has_ai_hint_controls():
    source = Path("frontend/src/pages/RAExercises.tsx").read_text(encoding="utf-8")

    assert "handleGenerateHint" in source
    assert "Get AI hint" in source
    assert "Could not generate an AI hint" in source


def test_ra_exercises_can_toggle_canonical_solution_visibility():
    source = Path("frontend/src/pages/RAExercises.tsx").read_text(encoding="utf-8")

    assert "if (showSolution) {" in source
    assert "setShowSolution(false);" in source
    assert "setSolutionResult(null);" in source
    assert "Hide canonical solution and result" in source


def test_ra_sql_reference_uses_ai_hints_for_failed_translation_checks():
    source = Path("frontend/src/pages/RASQLReference.tsx").read_text(encoding="utf-8")

    assert "generateTranslationAiHint" in source
    assert "AI translation hint" in source
    assert "Generating a targeted hint from your answer" in source
    assert "direction: direction ?? null" in Path("frontend/src/lib/api.ts").read_text(encoding="utf-8")
