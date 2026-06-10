from pathlib import Path


def test_ra_exercises_shows_correctness_badge_after_evaluation_result():
    source = Path("frontend/src/pages/RAExercises.tsx").read_text(encoding="utf-8")

    form_start = source.index("<form onSubmit={handleExecute}")
    textarea_start = source.index(f"id={{solutionTextareaId}}", form_start)
    button_start = source.index("{executing ? 'Evaluating...' : 'Evaluate Expression'}", textarea_start)
    form_body = source[form_start:button_start]

    assert "result?.is_correct != null" in form_body
    assert "Expression is correct" in form_body
    assert "Expression is incorrect" in form_body
    assert "<Check className=\"h-4 w-4\" />" in form_body
    assert "<X className=\"h-4 w-4\" />" in form_body


def test_evaluation_result_type_includes_correctness():
    source = Path("frontend/src/lib/api.ts").read_text(encoding="utf-8")

    interface_start = source.index("export interface EvaluationResult")
    interface_end = source.index("export interface TranslationCheckResult", interface_start)
    interface_body = source[interface_start:interface_end]

    assert "is_correct?: boolean | null;" in interface_body


def test_solution_walkthrough_button_is_available_before_evaluation_attempt():
    source = Path("frontend/src/pages/RAExercises.tsx").read_text(encoding="utf-8")

    walkthrough_button_start = source.index("'Show solution walkthrough'")
    button_block_start = source.rindex("<button", 0, walkthrough_button_start)
    conditional_start = source.rindex("{", 0, button_block_start)
    button_gate = source[conditional_start:button_block_start]

    assert "queryDetail.solution?.relational_algebra" in button_gate
    assert "hasAttempted" not in source


def test_ra_syntax_help_lives_in_help_center_for_catalog_practice():
    source = Path("frontend/src/pages/RAExercises.tsx").read_text(encoding="utf-8")

    form_start = source.index("<form onSubmit={handleExecute}")
    help_center_start = source.index("Help center", form_start)
    syntax_toggle_start = source.index("panel === 'syntax' ? null : 'syntax'", help_center_start)
    syntax_button_start = source.index("Syntax help", syntax_toggle_start)
    syntax_panel_start = source.index("{supportPanel === 'syntax' &&", syntax_button_start)
    custom_mode_start = source.index("{mode === 'custom'", syntax_panel_start)

    assert syntax_toggle_start < syntax_button_start < syntax_panel_start
    assert "<SyntaxHelp database={selectedDb} />" in source[syntax_panel_start:custom_mode_start]
    assert '<Collapsible title="RA syntax help" quiet>' not in source


def test_answer_hint_button_uses_specific_label():
    source = Path("frontend/src/pages/RAExercises.tsx").read_text(encoding="utf-8")

    help_center_start = source.index("Help center")
    hint_button_start = source.index("handleGenerateHint", help_center_start)
    syntax_button_start = source.index("Syntax help", hint_button_start)
    hint_button_block = source[hint_button_start:syntax_button_start]

    assert "Hint for my answer" in hint_button_block
    assert "Get hint" not in hint_button_block
