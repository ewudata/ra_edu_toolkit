from pathlib import Path


def test_api_client_exposes_llm_hint_endpoint():
    source = Path("frontend/src/lib/api.ts").read_text(encoding="utf-8")

    assert "generateHint" in source
    assert "/databases/${database}/queries/${queryId}/llm/hint" in source
    assert "LlmHintResponse" in source
    assert "explainRaError" in source
    assert "/databases/${database}/llm/explain-error" in source
    assert "LlmErrorExplanationResponse" in source


def test_ra_exercises_has_ai_hint_controls():
    source = Path("frontend/src/pages/RAExercises.tsx").read_text(encoding="utf-8")

    assert "handleGenerateHint" in source
    assert "Get hint" in source
    assert "Get AI hint" not in source
    assert "Could not generate an AI hint" in source
    assert "AI hint" in source
    assert "AI error explanation" not in source
    assert "Generating a student-friendly explanation" not in source
    assert "api.explainRaError(selectedDb" not in source


def test_ra_exercises_places_prompt_syntax_help_in_left_column():
    source = Path("frontend/src/pages/RAExercises.tsx").read_text(encoding="utf-8")

    prompt_panel_start = source.index('border-[#d8c39a] bg-[#fff8eb]')
    syntax_help_start = source.index('<Collapsible title="RA syntax help">', prompt_panel_start)
    expression_form_start = source.index('<form onSubmit={handleExecute}', prompt_panel_start)

    assert prompt_panel_start < syntax_help_start < expression_form_start


def test_ra_exercises_keeps_ai_hint_visible_while_typing_answer():
    source = Path("frontend/src/pages/RAExercises.tsx").read_text(encoding="utf-8")

    textarea_start = source.index(f"id={{solutionTextareaId}}")
    on_change_start = source.index("onChange={(e) => {", textarea_start)
    on_change_end = source.index("}}", on_change_start)
    on_change_body = source[on_change_start:on_change_end]

    assert "setSolution(e.target.value);" in on_change_body
    assert "setAiHint(null);" not in on_change_body
    assert "setAiHintModel(null);" not in on_change_body


def test_ra_exercises_clears_stale_result_when_typing_answer():
    source = Path("frontend/src/pages/RAExercises.tsx").read_text(encoding="utf-8")

    textarea_start = source.index(f"id={{solutionTextareaId}}")
    on_change_start = source.index("onChange={(e) => {", textarea_start)
    on_change_end = source.index("}}", on_change_start)
    on_change_body = source[on_change_start:on_change_end]

    assert "setResult(null);" in on_change_body
    assert "setExpectedComparisonResult(null);" in on_change_body
    assert "setShowEvaluationTrace(false);" in on_change_body


def test_ra_exercises_clears_stale_custom_result_when_typing_expression():
    source = Path("frontend/src/pages/RAExercises.tsx").read_text(encoding="utf-8")

    textarea_start = source.index(f"id={{customExprTextareaId}}")
    on_change_start = source.index("onChange={(e) => {", textarea_start)
    on_change_end = source.index("}}", on_change_start)
    on_change_body = source[on_change_start:on_change_end]

    assert "setCustomExpr(e.target.value);" in on_change_body
    assert "setCustomResult(null);" in on_change_body


def test_ra_exercises_shows_deterministic_ra_error_context():
    source = Path("frontend/src/pages/RAExercises.tsx").read_text(encoding="utf-8")

    assert "Could not evaluate your expression: {resultError}" in source
    assert "Could not evaluate the expression: {customError}" in source
    assert "Could not evaluate your expression.</StatusBadge>" not in source
    assert "Could not evaluate the expression.</StatusBadge>" not in source


def test_ra_exercises_does_not_show_separate_ai_error_explanation_control():
    source = Path("frontend/src/pages/RAExercises.tsx").read_text(encoding="utf-8")

    handler_start = source.index("async function handleExecute")
    handler_end = source.index("async function handleCustomExecute", handler_start)
    handler_body = source[handler_start:handler_end]

    assert "api.explainRaError" not in handler_body
    assert "handleExplainResultError" not in source
    assert "handleExplainCustomError" not in source
    assert "Explain error" not in source


def test_ra_exercises_places_error_explanation_under_evaluate_button():
    source = Path("frontend/src/pages/RAExercises.tsx").read_text(encoding="utf-8")

    form_start = source.index("<form onSubmit={handleExecute}")
    button_start = source.index("{executing ? 'Evaluating...' : 'Evaluate Expression'}", form_start)
    error_block_start = source.index("{resultError && (", button_start)
    form_end = source.index("</form>", error_block_start)

    assert button_start < error_block_start < form_end


def test_ra_exercises_keeps_result_error_visible_while_typing_answer():
    source = Path("frontend/src/pages/RAExercises.tsx").read_text(encoding="utf-8")

    textarea_start = source.index(f"id={{solutionTextareaId}}")
    on_change_start = source.index("onChange={(e) => {", textarea_start)
    on_change_end = source.index("}}", on_change_start)
    on_change_body = source[on_change_start:on_change_end]

    assert "setResultError(null);" not in on_change_body


def test_ra_exercises_clears_result_error_when_evaluating_again():
    source = Path("frontend/src/pages/RAExercises.tsx").read_text(encoding="utf-8")

    handler_start = source.index("async function handleExecute")
    handler_end = source.index("async function handleCustomExecute", handler_start)
    handler_body = source[handler_start:handler_end]

    assert "setResultError(null);" in handler_body


def test_ra_exercises_clears_stale_result_when_evaluating_again():
    source = Path("frontend/src/pages/RAExercises.tsx").read_text(encoding="utf-8")

    handler_start = source.index("async function handleExecute")
    handler_end = source.index("async function handleCustomExecute", handler_start)
    handler_body = source[handler_start:handler_end]

    assert "setResult(null);" in handler_body
    assert "setExpectedComparisonResult(null);" in handler_body
    assert "setShowEvaluationTrace(false);" in handler_body


def test_ra_exercises_clears_stale_custom_result_when_evaluating_again():
    source = Path("frontend/src/pages/RAExercises.tsx").read_text(encoding="utf-8")

    handler_start = source.index("async function handleCustomExecute")
    handler_end = source.index("async function handleGenerateHint", handler_start)
    handler_body = source[handler_start:handler_end]

    assert "setCustomResult(null);" in handler_body
    assert "setCustomError(null);" in handler_body


def test_ra_exercises_hides_evaluation_trace_until_requested():
    source = Path("frontend/src/pages/RAExercises.tsx").read_text(encoding="utf-8")

    assert "const [showEvaluationTrace, setShowEvaluationTrace] = useState(false);" in source
    assert "{showEvaluationTrace && result && (" in source
    assert "<TraceViewer trace={result.trace} title=\"Evaluation Trace for Your Expression\" />" not in source.replace(
        '<TraceViewer trace={result.trace} title="Evaluation Trace for Your Expression" />',
        "",
    )


def test_ra_exercises_help_center_orders_hint_button_first():
    source = Path("frontend/src/pages/RAExercises.tsx").read_text(encoding="utf-8")

    help_center_start = source.index("Help center")
    hint_button_start = source.index("handleGenerateHint", help_center_start)
    toggle_start = source.index("setShowEvaluationTrace((visible) => !visible)", help_center_start)
    canonical_button_start = source.index("handleViewSolution", help_center_start)

    assert hint_button_start < toggle_start < canonical_button_start
    assert "Get hint" in source[hint_button_start:toggle_start]
    assert "Show evaluation trace" in source[toggle_start:]
    assert "Hide evaluation trace" in source[toggle_start:]
    assert "disabled={!result}" in source[toggle_start:]


def test_ra_exercises_places_evaluation_trace_under_help_center_buttons():
    source = Path("frontend/src/pages/RAExercises.tsx").read_text(encoding="utf-8")

    help_center_start = source.index("Help center")
    button_row_start = source.index('<div className="flex flex-wrap gap-3">', help_center_start)
    button_row_end = source.index("</div>", source.index("handleViewSolution", button_row_start))
    trace_start = source.index("<TraceViewer trace={result.trace}", button_row_end)
    ai_hint_error_start = source.index("{aiHintError &&", trace_start)

    assert button_row_start < button_row_end < trace_start < ai_hint_error_start


def test_ra_exercises_can_toggle_canonical_solution_visibility():
    source = Path("frontend/src/pages/RAExercises.tsx").read_text(encoding="utf-8")

    assert "if (showSolution) {" in source
    assert "setShowSolution(false);" in source
    assert "setSolutionResult(null);" in source
    assert "Hide canonical solution" in source
    assert "Show canonical solution" in source
    assert "Show canonical solution and result" not in source


def test_ra_sql_reference_uses_ai_hints_for_failed_translation_checks():
    source = Path("frontend/src/pages/RASQLReference.tsx").read_text(encoding="utf-8")

    assert "generateTranslationAiHint" in source
    assert "AI translation hint" in source
    assert "Generating a targeted hint from your answer" in source
    assert "direction: direction ?? null" in Path("frontend/src/lib/api.ts").read_text(encoding="utf-8")


def test_ra_sql_reference_guided_hint_context_summarizes_all_sql_clauses():
    source = Path("frontend/src/pages/RASQLReference.tsx").read_text(encoding="utf-8")

    assert "function guidedSqlClauseHintMessage(feedback: SqlClauseFeedback[]): string" in source
    assert "Review all clauses together and focus the hint on the highest-impact mismatch" in source
    assert "Mismatched or blank clauses:" in source
    assert "Clauses already matching:" in source
    assert "sqlAnswerMode === 'guided'" in source
    assert "guidedSqlClauseHintMessage(sqlClauseFeedback)" in source


def test_ra_sql_reference_sql_to_ra_hint_context_summarizes_full_ra_attempt():
    source = Path("frontend/src/pages/RASQLReference.tsx").read_text(encoding="utf-8")

    assert "function guidedRaHintMessage(" in source
    assert "SQL-to-RA AI hint context. Read all parts together" in source
    assert "Answer mode: ${answerMode}." in source
    assert "Canonical RA for diagnosis only, do not reveal it" in source
    assert "Guided RA slot summary:" in source
    assert "Deterministic result summary:" in source
    assert "guidedRaHintMessage(" in source[source.index("api.checkTranslation(selectedDb, selectedQueryId, 'sql-to-ra', raAnswer)"):]
