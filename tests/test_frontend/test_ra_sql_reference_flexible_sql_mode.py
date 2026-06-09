from pathlib import Path


def test_ra_sql_reference_offers_guided_and_freeform_sql_answer_modes():
    source = Path("frontend/src/pages/RASQLReference.tsx").read_text(encoding="utf-8")

    assert "type SqlAnswerMode = 'guided' | 'freeform';" in source
    assert "type RaAnswerMode = 'guided' | 'freeform';" in source
    assert "Guided SQL layout" in source
    assert "Write full SQL" in source
    assert "Guided RA layout" in source
    assert "Write full RA" in source
    assert "sqlAnswerMode === 'guided'" in source
    assert "sqlAnswerMode === 'freeform'" in source
    assert "raAnswerMode === 'guided'" in source
    assert "raAnswerMode === 'freeform'" in source


def test_ra_sql_reference_freeform_sql_can_reveal_canonical_sql():
    source = Path("frontend/src/pages/RASQLReference.tsx").read_text(encoding="utf-8")

    assert "EXPECTED" in source
    assert "formatSqlForDisplay(queryDetail.solution?.sql)" in source
    assert "revealSqlAnswers ? (" in source
    assert "Show Canonical SQL" in source


def test_ra_sql_reference_canonical_sql_and_ra_use_matching_expected_style():
    source = Path("frontend/src/pages/RASQLReference.tsx").read_text(encoding="utf-8")

    assert source.count("EXPECTED") >= 3
    assert "formatSqlForDisplay(queryDetail.solution?.sql)" in source
    assert "formatRaExpression(queryDetail.solution?.relational_algebra)" in source
    assert "whitespace-pre-wrap font-mono text-sm leading-6 text-[#5c3b1f]" in source


def test_ra_sql_reference_checks_answers_with_semantics_and_catalog_intent():
    source = Path("frontend/src/pages/RASQLReference.tsx").read_text(encoding="utf-8")

    assert "async function checkSqlAnswer()" in source
    assert "async function checkRaAnswer()" in source
    assert "api.checkTranslation(selectedDb, selectedQueryId, 'ra-to-sql', sqlAnswer)" in source
    assert "api.checkTranslation(selectedDb, selectedQueryId, 'sql-to-ra', raAnswer)" in source
    assert "Correct: your SQL returns the same relation as the relational algebra expression." in source
    assert "even though it may use a different structure than the catalog answer." in source
    assert "function fullSqlMatchesCatalogIntent(" in source
    assert "function fullRaMatchesCatalogIntent(" in source
    assert "const raAnswerAccepted" in source
    assert "Free-form mode accepts complete RA expressions that match the catalog intent." in source


def test_ra_sql_reference_guided_sql_requires_clause_alignment():
    source = Path("frontend/src/pages/RASQLReference.tsx").read_text(encoding="utf-8")

    assert "type ClauseBadgeState = 'correct' | 'mismatch' | 'neutral';" in source
    assert "function getClauseBadgeState(" in source
    assert "function getSqlClauseFeedback(" in source
    assert "const guidedSqlClausesMatch" in source
    assert "const sqlAnswerAccepted" in source
    assert "Guided mode checks both the result relation and each catalog clause." in source
    assert "if (overallSqlCorrect && clauseAnswered) return 'correct';" not in source


def test_ra_sql_reference_hides_clause_feedback_until_sql_check_finishes():
    source = Path("frontend/src/pages/RASQLReference.tsx").read_text(encoding="utf-8")

    assert "setSqlChecked(false);" in source
    assert "setSqlChecked(true);" in source
    assert "sqlChecked && !sqlCheckLoading" in source


def test_ra_sql_reference_treats_alias_free_select_from_where_as_equivalent():
    source = Path("frontend/src/pages/RASQLReference.tsx").read_text(encoding="utf-8")

    assert "function buildFromAliasMap(fromClause: string): Map<string, string>" in source
    assert "function normalizeSelectItem(value: string, aliases: Map<string, string>): string" in source
    assert "function normalizeFromClause(value: string): string[]" in source
    assert "function normalizeWhereClause(value: string, aliases: Map<string, string>): string" in source
    assert "clauseMatchesCatalogClause(clause, userValue, userFromClause, expectedFromClause)" in source


def test_ra_sql_reference_guided_from_clause_does_not_ignore_extra_joins():
    source = Path("frontend/src/pages/RASQLReference.tsx").read_text(encoding="utf-8")

    assert "const joinPattern = /\\b(?:natural\\s+join|inner\\s+join|left\\s+join|right\\s+join|full\\s+join|cross\\s+join|join)\\b/i;" in source
    assert ".flatMap((item) => item.replace(/\\s+(?:on|using)\\s+.*$/i, '').split(joinPattern))" in source


def test_ra_sql_reference_splits_multiple_join_clauses_for_guided_sql_and_expected_view():
    source = Path("frontend/src/pages/RASQLReference.tsx").read_text(encoding="utf-8")

    assert "function extractTopLevelJoinClauses(sql: string): string[]" in source
    assert "const joins = extractTopLevelJoinClauses(compact);" in source
    assert "clauses.push(sql.slice(joinStart, joinEnd).trim());" in source


def test_ra_sql_reference_handles_natural_join_without_creating_extra_join_clause():
    source = Path("frontend/src/pages/RASQLReference.tsx").read_text(encoding="utf-8")

    assert "' NATURAL JOIN '" in source
    assert "matchedJoinKeyword = keyword;" in source
    assert "joinStart + matchedJoinKeyword.length" in source
    assert "extractSection(compact, 'FROM', [' NATURAL JOIN '" in source
    assert "function splitJoinClause(joinClause: string): { keyword: string; body: string }" in source
    assert "keyword: match[1]!.toUpperCase()," in source
    assert "label: `${parsedJoin.keyword} clause ${index + 1}`," in source


def test_guided_ra_placeholder_underscores_are_stripped_before_checking():
    source = Path("frontend/src/pages/RASQLReference.tsx").read_text(encoding="utf-8")

    assert "function stripGuidedRaPlaceholderUnderscores(value: string): string" in source
    assert "stripGuidedRaPlaceholderUnderscores(studentRa).trim()" in source
    assert "stripGuidedRaPlaceholderUnderscores(value)" in source
