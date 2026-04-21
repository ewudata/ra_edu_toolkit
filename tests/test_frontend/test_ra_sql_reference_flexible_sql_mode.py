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


def test_ra_sql_reference_checks_ra_to_sql_answers_semantically():
    source = Path("frontend/src/pages/RASQLReference.tsx").read_text(encoding="utf-8")

    assert "async function checkSqlAnswer()" in source
    assert "async function checkRaAnswer()" in source
    assert "api.checkTranslation(selectedDb, selectedQueryId, 'ra-to-sql', sqlAnswer)" in source
    assert "api.checkTranslation(selectedDb, selectedQueryId, 'sql-to-ra', raAnswer)" in source
    assert "Correct: your SQL returns the same relation as the relational algebra expression." in source
    assert "even though it may use a different structure than the catalog answer." in source
    assert "Free-form mode checks any complete RA expression for semantic equivalence." in source


def test_ra_sql_reference_marks_guided_clauses_correct_when_sql_is_semantically_correct():
    source = Path("frontend/src/pages/RASQLReference.tsx").read_text(encoding="utf-8")

    assert "type ClauseBadgeState = 'correct' | 'mismatch' | 'neutral';" in source
    assert "function getClauseBadgeState(" in source
    assert "if (overallSqlCorrect && clauseAnswered) return 'correct';" in source
    assert "Accepted as correct because the full SQL answer is semantically correct." in source
    assert "If the full SQL answer is semantically correct, the guided clauses are marked correct as well" in source


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


def test_ra_sql_reference_splits_multiple_join_clauses_for_guided_sql_and_expected_view():
    source = Path("frontend/src/pages/RASQLReference.tsx").read_text(encoding="utf-8")

    assert "function extractTopLevelJoinClauses(sql: string): string[]" in source
    assert "const joins = extractTopLevelJoinClauses(compact);" in source
    assert "clauses.push(sql.slice(joinStart, joinEnd).trim());" in source
