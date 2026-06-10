import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ApiError, api, type Database, type EvaluationResult, type Query, type TableInfo, type TranslationCheckResult } from '../lib/api';
import StatusBadge from '../components/StatusBadge';
import Collapsible from '../components/Collapsible';
import DataTable from '../components/DataTable';
import TablePreview from '../components/TablePreview';
import { sortQueries, difficultyIcon } from '../lib/difficulty';
import { translateRaToSql, translateSqlToRa, TranslationError } from '../lib/raSqlTranslation';
import { getWorkingDatabase, setWorkingDatabase } from '../lib/workingDatabase';
import {
  BookOpen,
  Check,
  Database as DatabaseIcon,
  LayoutList,
  Lightbulb,
  Pencil,
  X,
} from 'lucide-react';

type WorkspaceMode = 'catalog' | 'custom' | null;
type PracticeDirection = 'ra-to-sql' | 'sql-to-ra';
type SqlAnswerMode = 'guided' | 'freeform';
type RaAnswerMode = 'guided' | 'freeform';
type PersistedReferenceState = {
  selectedDb: string;
  mode: WorkspaceMode;
  selectedQueryId: string;
  practiceDirection: PracticeDirection;
  selectedOps: string[];
  raAnswerMode: RaAnswerMode;
  studentRa: string;
  raStartedEditing: boolean;
  freeformRaAnswer: string;
  sqlAnswerMode: SqlAnswerMode;
  freeformSqlAnswer: string;
  customRa: string;
  customSql: string;
};

type SqlClause = {
  id: string;
  label: string;
  keyword: string;
  expectedBody: string;
};

type SqlClauseGroup = {
  id: string;
  title: string;
  clauses: SqlClause[];
};

type SqlClauseFeedback = {
  clause: SqlClause;
  userValue: string;
  matches: boolean;
  answered: boolean;
};

const OPERATOR_OPTIONS = [
  ['selection', 'Selection'],
  ['project', 'Project'],
  ['rename', 'Rename'],
  ['intersection', 'Set Intersection'],
  ['union', 'Set Union'],
  ['difference', 'Set Difference'],
  ['cartesian product', 'Cartesian Product'],
  ['natural join', 'Natural Join'],
  ['division', 'Division'],
] as const;

const OPERATOR_ALIASES: Record<string, Set<string>> = {
  selection: new Set(['selection', 'select', 'sigma', 'σ']),
  project: new Set(['project', 'projection', 'pi', 'π']),
  rename: new Set(['rename', 'renaming', 'rho', 'ρ']),
};

const REFERENCE_SESSION_STORAGE_KEY = 'ra_sql_reference_state_v1';

function loadPersistedReferenceState(): PersistedReferenceState | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(REFERENCE_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedReferenceState>;
    return {
      selectedDb: typeof parsed.selectedDb === 'string' ? parsed.selectedDb : '',
      mode: parsed.mode === 'catalog' || parsed.mode === 'custom' ? parsed.mode : null,
      selectedQueryId: typeof parsed.selectedQueryId === 'string' ? parsed.selectedQueryId : '',
      practiceDirection: parsed.practiceDirection === 'sql-to-ra' ? 'sql-to-ra' : 'ra-to-sql',
      selectedOps: Array.isArray(parsed.selectedOps) ? parsed.selectedOps.filter((value): value is string => typeof value === 'string') : [],
      raAnswerMode: parsed.raAnswerMode === 'freeform' ? 'freeform' : 'guided',
      studentRa: typeof parsed.studentRa === 'string' ? parsed.studentRa : '',
      raStartedEditing: parsed.raStartedEditing === true,
      freeformRaAnswer: typeof parsed.freeformRaAnswer === 'string' ? parsed.freeformRaAnswer : '',
      sqlAnswerMode: parsed.sqlAnswerMode === 'freeform' ? 'freeform' : 'guided',
      freeformSqlAnswer: typeof parsed.freeformSqlAnswer === 'string' ? parsed.freeformSqlAnswer : '',
      customRa: typeof parsed.customRa === 'string' ? parsed.customRa : '',
      customSql: typeof parsed.customSql === 'string' ? parsed.customSql : '',
    };
  } catch {
    return null;
  }
}

function queryMatchesOps(query: Query, ops: Set<string>): boolean {
  const hints = (query.hints ?? []).map((hint) => hint.toLowerCase()).join(' ');
  return [...ops].every((op) => {
    const aliases = OPERATOR_ALIASES[op] ?? new Set([op]);
    return [...aliases].some((alias) => hints.includes(alias));
  });
}

function normalizeComparison(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/;$/, '')
    .toLowerCase()
    .replace(/\s*(<=|>=|<>|!=)\s*/g, '$1')
    .replace(/\s*([=<>(),])\s*/g, '$1');
}

function splitTopLevelCommaList(value: string): string[] {
  const items: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of value) {
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);

    if (char === ',' && depth === 0) {
      const item = normalizeComparison(current);
      if (item) items.push(item);
      current = '';
      continue;
    }

    current += char;
  }

  const tail = normalizeComparison(current);
  if (tail) items.push(tail);
  return items;
}

function haveSameItemsIgnoringOrder(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;

  const counts = new Map<string, number>();
  for (const item of left) counts.set(item, (counts.get(item) ?? 0) + 1);
  for (const item of right) {
    const count = counts.get(item) ?? 0;
    if (count === 0) return false;
    if (count === 1) counts.delete(item);
    else counts.set(item, count - 1);
  }
  return counts.size === 0;
}

function buildFromAliasMap(fromClause: string): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const item of splitTopLevelCommaList(fromClause)) {
    const match = item.match(/^([a-z_][a-z0-9_.]*)(?:\s+(?:as\s+)?([a-z_][a-z0-9_]*))?$/i);
    if (!match) continue;
    const table = match[1]!.toLowerCase();
    const alias = (match[2] ?? match[1])!.toLowerCase();
    aliases.set(alias, table);
    aliases.set(table, table);
  }
  return aliases;
}

function replaceAliasQualifiers(value: string, aliases: Map<string, string>): string {
  let normalized = value;
  for (const [alias, table] of aliases.entries()) {
    normalized = normalized.replace(new RegExp(`\\b${alias}\\.`, 'gi'), `${table}.`);
  }
  return normalized;
}

function normalizeSelectItem(value: string, aliases: Map<string, string>): string {
  const normalized = normalizeComparison(replaceAliasQualifiers(value, aliases));
  const aliasMatch = normalized.match(/^(.*?)(?:\s+as)?\s+([a-z_][a-z0-9_]*)$/i);
  if (!aliasMatch) return normalized;
  return `${aliasMatch[1]!.trim()} as ${aliasMatch[2]!.toLowerCase()}`;
}

function normalizeFromClause(value: string): string[] {
  const joinPattern = /\b(?:natural\s+join|inner\s+join|left\s+join|right\s+join|full\s+join|cross\s+join|join)\b/i;

  return splitTopLevelCommaList(value)
    .flatMap((item) => item.replace(/\s+(?:on|using)\s+.*$/i, '').split(joinPattern))
    .map((item) => item.trim().match(/^([a-z_][a-z0-9_.]*)/i)?.[1]?.toLowerCase() ?? '')
    .filter(Boolean);
}

function normalizeWhereClause(value: string, aliases: Map<string, string>): string {
  return normalizeComparison(replaceAliasQualifiers(value, aliases));
}

function normalizeRaForCatalogIntent(expression: string | undefined): string {
  return formatRaExpression(expression)
    .replace(/\s+/g, '')
    .replace(/π/g, 'pi')
    .replace(/σ/g, 'sigma')
    .replace(/ρ/g, 'rho')
    .replace(/⋈/g, 'join')
    .replace(/×/g, 'product')
    .replace(/∪/g, 'union')
    .replace(/[−-]/g, 'diff')
    .replace(/∩/g, 'intersect')
    .toLowerCase();
}

function fullSqlMatchesCatalogIntent(sql: string, expectedSql: string | undefined, expectedRa: string | undefined): boolean {
  if (!sql.trim()) return false;
  if (expectedSql && normalizeComparison(sql) === normalizeComparison(expectedSql)) return true;

  try {
    return normalizeRaForCatalogIntent(translateSqlToRa(sql).translated) === normalizeRaForCatalogIntent(expectedRa);
  } catch {
    return false;
  }
}

function fullRaMatchesCatalogIntent(expression: string, expectedRa: string | undefined): boolean {
  if (!expression.trim()) return false;
  return normalizeRaForCatalogIntent(expression) === normalizeRaForCatalogIntent(expectedRa);
}

function clauseMatchesCatalogClause(
  clause: SqlClause,
  userValue: string,
  userFromClause = '',
  expectedFromClause = '',
): boolean {
  const userAliases = buildFromAliasMap(userFromClause);
  const expectedAliases = buildFromAliasMap(expectedFromClause);

  if (clause.keyword === 'SELECT') {
    return haveSameItemsIgnoringOrder(
      splitTopLevelCommaList(userValue).map((item) => normalizeSelectItem(item, userAliases)),
      splitTopLevelCommaList(clause.expectedBody).map((item) => normalizeSelectItem(item, expectedAliases)),
    );
  }

  if (clause.keyword === 'FROM') {
    return haveSameItemsIgnoringOrder(
      normalizeFromClause(userValue),
      normalizeFromClause(clause.expectedBody),
    );
  }

  if (clause.keyword === 'WHERE') {
    return normalizeWhereClause(userValue, userAliases) === normalizeWhereClause(clause.expectedBody, expectedAliases);
  }

  if (clause.keyword === 'GROUP BY') {
    return haveSameItemsIgnoringOrder(
      splitTopLevelCommaList(userValue),
      splitTopLevelCommaList(clause.expectedBody),
    );
  }

  return normalizeComparison(userValue) === normalizeComparison(clause.expectedBody);
}

function formatRaExpression(expression: string | undefined): string {
  if (!expression) return 'No relational algebra solution available.';

  return expression
    .replace(/\bsigma(?=\{)/gi, 'σ')
    .replace(/\bpi(?=\{)/gi, 'π')
    .replace(/\brho(?=\{)/gi, 'ρ');
}

function createRaSkeleton(expression: string | undefined): string {
  if (!expression) return 'No relational algebra solution available.';
  return formatRaExpression(expression).replace(/\{[^{}]*\}/g, '{_____}');
}

function stripGuidedRaPlaceholderUnderscores(value: string): string {
  return value.replace(/_/g, (match, offset: number, fullText: string) => {
    const prev = fullText[offset - 1] ?? '';
    const next = fullText[offset + 1] ?? '';
    return /[A-Za-z0-9]/.test(prev) && /[A-Za-z0-9]/.test(next) ? match : '';
  });
}

function extractRaBraceArguments(expression: string | undefined): string[] {
  if (!expression) return [];
  const args: string[] = [];
  for (const match of formatRaExpression(expression).matchAll(/\{([^{}]*)\}/g)) {
    args.push(normalizeComparison(match[1] ?? ''));
  }
  return args;
}

function guidedRaHintMessage(
  answerMode: RaAnswerMode,
  studentAnswer: string,
  sourceSql: string | undefined,
  canonicalRa: string | undefined,
  result: TranslationCheckResult | null,
  intentMismatch: boolean,
): string {
  const expectedSlots = extractRaBraceArguments(canonicalRa);
  const studentSlots = extractRaBraceArguments(studentAnswer);
  const slotComparisons = expectedSlots.map((expected, index) => {
    const student = studentSlots[index] ?? '';
    const status = !student ? 'blank' : student === expected ? 'matches' : 'mismatch';
    return `slot ${index + 1}: ${status}. Expected ${expected || '(empty)'}; student wrote ${student || '(blank)'}.`;
  });

  return [
    'SQL-to-RA AI hint context. Read all parts together and focus on the main underlying mismatch.',
    `Answer mode: ${answerMode}.`,
    `Source SQL: ${sourceSql || '(unavailable)'}.`,
    `Canonical RA for diagnosis only, do not reveal it: ${canonicalRa || '(unavailable)'}.`,
    `Student RA: ${studentAnswer || '(blank)'}.`,
    answerMode === 'guided' && slotComparisons.length
      ? `Guided RA slot summary: ${slotComparisons.join(' ')}`
      : '',
    result
      ? `Deterministic result summary: is_correct=${result.is_correct}; schema_equal=${result.schema_equal}; student_schema=${result.student_schema.join(', ') || '(none)'}; expected_schema=${result.expected_schema.join(', ') || '(none)'}; missing_rows_sample=${JSON.stringify(result.missing_rows.slice(0, 3))}; extra_rows_sample=${JSON.stringify(result.extra_rows.slice(0, 3))}.`
      : '',
    intentMismatch
      ? 'The relational algebra returns the same rows on this dataset, but it does not match the catalog intent exactly.'
      : 'The relational algebra is not equivalent to the source SQL on the current dataset.',
  ].filter(Boolean).join(' ');
}

function formatSqlForDisplay(sql: string | undefined): string {
  if (!sql) return 'No SQL solution available.';

  const compact = sql.replace(/\s+/g, ' ').trim().replace(/;$/, '');
  if (!compact) return 'No SQL solution available.';

  if (/\bUNION\b|\bEXCEPT\b|\bINTERSECT\b/i.test(compact)) {
    const clauses = parseSqlClauses(compact);
    const groups = groupSqlClauses(clauses);
    return groups
      .map((group) => {
        if (group.id === 'set_operator') return group.clauses[0]?.expectedBody ?? '';
        return group.clauses.map((clause) => `${clause.keyword} ${clause.expectedBody}`.trim()).join('\n');
      })
      .filter(Boolean)
      .join('\n');
  }

  return parseSqlClauses(compact)
    .map((clause) => `${clause.keyword} ${clause.expectedBody}`.trim())
    .join('\n');
}

function extractSection(sql: string, startKeyword: string, endKeywords: string[]): string {
  const upper = sql.toUpperCase();
  const start = upper.indexOf(startKeyword);
  if (start === -1) return '';

  const searchStart = start + startKeyword.length;
  const candidates = endKeywords
    .map((keyword) => upper.indexOf(keyword, searchStart))
    .filter((index) => index !== -1);
  const end = candidates.length ? Math.min(...candidates) : sql.length;
  return sql.slice(searchStart, end).trim();
}

function extractTopLevelJoinClauses(sql: string): string[] {
  const clauses: string[] = [];
  const upper = sql.toUpperCase();
  const boundaryKeywords = [' WHERE ', ' GROUP BY ', ' HAVING ', ' ORDER BY '];
  const joinKeywords = [' NATURAL JOIN ', ' INNER JOIN ', ' LEFT JOIN ', ' RIGHT JOIN ', ' FULL JOIN ', ' CROSS JOIN ', ' JOIN '];

  const fromIndex = upper.indexOf('FROM ');
  if (fromIndex === -1) return clauses;

  let searchIndex = fromIndex + 'FROM '.length;
  while (searchIndex < sql.length) {
    let joinStart = -1;
    let matchedJoinKeyword = '';
    for (let index = searchIndex; index < upper.length; index += 1) {
      const keyword = joinKeywords.find((candidate) => upper.startsWith(candidate, index));
      if (!keyword) continue;
      joinStart = index;
      matchedJoinKeyword = keyword;
      break;
    }
    if (joinStart === -1) break;

    const joinEndCandidates = [
      ...joinKeywords
        .map((keyword) => upper.indexOf(keyword, joinStart + matchedJoinKeyword.length))
        .filter((index) => index !== -1),
      ...boundaryKeywords
        .map((keyword) => upper.indexOf(keyword, joinStart + matchedJoinKeyword.length))
        .filter((index) => index !== -1),
    ];
    const joinEnd = joinEndCandidates.length ? Math.min(...joinEndCandidates) : sql.length;
    clauses.push(sql.slice(joinStart, joinEnd).trim());
    searchIndex = joinEnd;
  }

  return clauses;
}

function splitJoinClause(joinClause: string): { keyword: string; body: string } {
  const trimmed = joinClause.trim();
  const match = trimmed.match(/^((?:(?:NATURAL|INNER|LEFT|RIGHT|FULL|CROSS)\s+)?JOIN)\s+(.+)$/i);
  if (!match) {
    return { keyword: 'JOIN', body: trimmed };
  }
  return {
    keyword: match[1]!.toUpperCase(),
    body: match[2]!.trim(),
  };
}

function parseSetOperationClauses(sql: string): SqlClause[] {
  const compact = sql.replace(/\s+/g, ' ').trim().replace(/;$/, '');
  const match = compact.match(/\b(UNION|EXCEPT|INTERSECT)\b/i);
  if (!match || match.index == null) return [];

  const left = compact.slice(0, match.index).trim();
  const operator = match[1].toUpperCase();
  const right = compact.slice(match.index + match[1].length).trim();

  const leftClauses = parseSqlClauses(left).map((clause) => ({
    ...clause,
    id: `left_${clause.id}`,
    label: `Left query ${clause.label}`,
  }));
  const rightClauses = parseSqlClauses(right).map((clause) => ({
    ...clause,
    id: `right_${clause.id}`,
    label: `Right query ${clause.label}`,
  }));

  return [
    ...leftClauses,
    { id: 'set_operator', label: 'Set operator', keyword: 'OPERATOR', expectedBody: operator },
    ...rightClauses,
  ];
}

function parseSqlClauses(sql: string): SqlClause[] {
  const compact = sql.replace(/\s+/g, ' ').trim().replace(/;$/, '');
  if (!compact) return [];

  if (/\bUNION\b|\bEXCEPT\b|\bINTERSECT\b/i.test(compact)) {
    return parseSetOperationClauses(compact);
  }

  const clauses: SqlClause[] = [];
  const selectBody = extractSection(compact, 'SELECT', [' FROM ']);
  const fromBody = extractSection(compact, 'FROM', [' NATURAL JOIN ', ' JOIN ', ' INNER JOIN ', ' LEFT JOIN ', ' RIGHT JOIN ', ' FULL JOIN ', ' CROSS JOIN ', ' WHERE ', ' GROUP BY ', ' HAVING ', ' ORDER BY ']);
  const joins = extractTopLevelJoinClauses(compact);
  const whereBody = extractSection(compact, 'WHERE', [' GROUP BY ', ' HAVING ', ' ORDER BY ']);
  const groupByBody = extractSection(compact, 'GROUP BY', [' HAVING ', ' ORDER BY ']);
  const havingBody = extractSection(compact, 'HAVING', [' ORDER BY ']);
  const orderByBody = extractSection(compact, 'ORDER BY', []);

  if (selectBody) clauses.push({ id: 'select', label: 'SELECT clause', keyword: 'SELECT', expectedBody: selectBody });
  if (fromBody) clauses.push({ id: 'from', label: 'FROM clause', keyword: 'FROM', expectedBody: fromBody });
  joins.forEach((joinClause, index) => {
    const parsedJoin = splitJoinClause(joinClause);
    clauses.push({
      id: `join_${index}`,
      label: `${parsedJoin.keyword} clause ${index + 1}`,
      keyword: parsedJoin.keyword,
      expectedBody: parsedJoin.body,
    });
  });
  if (whereBody) clauses.push({ id: 'where', label: 'WHERE clause', keyword: 'WHERE', expectedBody: whereBody });
  if (groupByBody) clauses.push({ id: 'group_by', label: 'GROUP BY clause', keyword: 'GROUP BY', expectedBody: groupByBody });
  if (havingBody) clauses.push({ id: 'having', label: 'HAVING clause', keyword: 'HAVING', expectedBody: havingBody });
  if (orderByBody) clauses.push({ id: 'order_by', label: 'ORDER BY clause', keyword: 'ORDER BY', expectedBody: orderByBody });

  return clauses.length ? clauses : [{ id: 'sql', label: 'SQL statement', keyword: 'SQL', expectedBody: compact }];
}

function groupSqlClauses(clauses: SqlClause[]): SqlClauseGroup[] {
  if (!clauses.length) return [];

  const leftClauses = clauses.filter((clause) => clause.id.startsWith('left_'));
  const rightClauses = clauses.filter((clause) => clause.id.startsWith('right_'));
  const middleClauses = clauses.filter((clause) => !clause.id.startsWith('left_') && !clause.id.startsWith('right_'));

  if (leftClauses.length || rightClauses.length) {
    const groups: SqlClauseGroup[] = [];
    if (leftClauses.length) {
      groups.push({ id: 'left_query', title: 'Left query', clauses: leftClauses });
    }
    const operatorClause = middleClauses.find((clause) => clause.id === 'set_operator');
    if (operatorClause) {
      groups.push({ id: 'set_operator', title: 'Set operator', clauses: [operatorClause] });
    }
    if (rightClauses.length) {
      groups.push({ id: 'right_query', title: 'Right query', clauses: rightClauses });
    }
    return groups;
  }

  return [{ id: 'sql_query', title: 'SQL query', clauses }];
}

type ClauseBadgeState = 'correct' | 'mismatch' | 'neutral';

function getClauseBadgeState(
  clauseCorrect: boolean,
  clauseAnswered: boolean,
): ClauseBadgeState {
  if (clauseCorrect) return 'correct';
  if (!clauseAnswered) return 'neutral';
  return 'mismatch';
}

function getSqlClauseFeedback(groups: SqlClauseGroup[], answers: Record<string, string>): SqlClauseFeedback[] {
  return groups.flatMap((group) => {
    const fromClause = group.clauses.find((candidate) => candidate.keyword === 'FROM');
    const userFromClause = fromClause ? (answers[fromClause.id] ?? '') : '';
    const expectedFromClause = fromClause?.expectedBody ?? '';

    return group.clauses.map((clause) => {
      const userValue = answers[clause.id] ?? '';
      return {
        clause,
        userValue,
        matches: clauseMatchesCatalogClause(clause, userValue, userFromClause, expectedFromClause),
        answered: userValue.trim().length > 0,
      };
    });
  });
}

function guidedSqlClauseHintMessage(feedback: SqlClauseFeedback[]): string {
  const priority = new Map([
    ['FROM', 0],
    ['JOIN', 1],
    ['NATURAL JOIN', 1],
    ['INNER JOIN', 1],
    ['LEFT JOIN', 1],
    ['RIGHT JOIN', 1],
    ['FULL JOIN', 1],
    ['CROSS JOIN', 1],
    ['WHERE', 2],
    ['HAVING', 3],
    ['GROUP BY', 4],
    ['OPERATOR', 5],
    ['SELECT', 6],
    ['ORDER BY', 7],
  ]);
  const describe = (item: SqlClauseFeedback): string => {
    const status = !item.answered ? 'blank' : item.matches ? 'matches' : 'mismatch';
    return `${item.clause.keyword}: ${status}. Expected ${item.clause.expectedBody}; student wrote ${item.userValue || '(blank)'}.`;
  };
  const mismatches = feedback
    .filter((item) => !item.answered || !item.matches)
    .sort((left, right) => (priority.get(left.clause.keyword) ?? 8) - (priority.get(right.clause.keyword) ?? 8));
  const matches = feedback.filter((item) => item.answered && item.matches);

  if (!mismatches.length) {
    return 'The SQL returns the same rows on this dataset, but the guided clauses do not match the catalog intent.';
  }

  return [
    'The SQL returns the same rows on this dataset, but the guided clauses do not match the catalog intent.',
    'Review all clauses together and focus the hint on the highest-impact mismatch, especially FROM/JOIN before projection when present.',
    `Mismatched or blank clauses: ${mismatches.map(describe).join(' ')}`,
    matches.length ? `Clauses already matching: ${matches.map((item) => item.clause.keyword).join(', ')}.` : '',
  ].filter(Boolean).join(' ');
}

function buildSqlFromClauseList(clauses: SqlClause[], answers: Record<string, string>): string {
  return clauses
    .map((clause) => {
      const value = (answers[clause.id] ?? '').trim();
      if (!value) return '';
      if (clause.keyword === 'SQL') return value;
      if (clause.keyword === 'OPERATOR') return value.toUpperCase();
      return `${clause.keyword} ${value}`.trim();
    })
    .filter(Boolean)
    .join('\n');
}

function buildSqlFromClauseGroups(groups: SqlClauseGroup[], answers: Record<string, string>): string {
  const leftGroup = groups.find((group) => group.id === 'left_query');
  const rightGroup = groups.find((group) => group.id === 'right_query');
  const operatorGroup = groups.find((group) => group.id === 'set_operator');

  if (leftGroup || rightGroup || operatorGroup) {
    const leftSql = leftGroup ? buildSqlFromClauseList(leftGroup.clauses, answers) : '';
    const rightSql = rightGroup ? buildSqlFromClauseList(rightGroup.clauses, answers) : '';
    const operator = operatorGroup ? (answers[operatorGroup.clauses[0]?.id ?? ''] ?? '').trim().toUpperCase() : '';
    return [leftSql, operator, rightSql].filter(Boolean).join('\n');
  }

  return groups.map((group) => buildSqlFromClauseList(group.clauses, answers)).filter(Boolean).join('\n');
}

function extractExpectedRows(result: EvaluationResult | null, fallback: Query | null): Record<string, unknown>[] | null {
  return result?.expected_rows ?? fallback?.expected_rows ?? null;
}

function formatCheckError(error: unknown): string {
  const humanize = (message: string): string => {
    const missingColumnsMatch = message.match(/^\[(.+)\] not in index$/i);
    if (missingColumnsMatch) {
      const rawColumns = missingColumnsMatch[1]
        .split(',')
        .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);

      if (rawColumns.length === 1) {
        return `Attribute "${rawColumns[0]}" is not available in the current relation, so it cannot be used in the projection list.`;
      }

      return `Some attributes in your projection list are not available in the current relation: ${rawColumns.join(', ')}.`;
    }

    return message;
  };

  if (error instanceof ApiError) {
    if (typeof error.detail === 'string') return humanize(error.detail);
    if (error.detail && typeof error.detail === 'object' && 'message' in error.detail) {
      const detail = error.detail as { message?: string; line?: number; column?: number };
      if (typeof detail.message === 'string' && detail.line && detail.column) {
        return `${humanize(detail.message)} (line ${detail.line}, column ${detail.column})`;
      }
      if (typeof detail.message === 'string') return humanize(detail.message);
    }
    return humanize(error.message);
  }

  if (error instanceof Error) return humanize(error.message);
  return 'Unable to check the answer.';
}

export default function RASQLReference() {
  const persistedState = loadPersistedReferenceState();
  const initialWorkingDatabase = getWorkingDatabase();
  const databaseSelectId = useId();
  const querySelectId = useId();
  const customRaTextareaId = useId();
  const customSqlTextareaId = useId();
  const raInputRef = useRef<HTMLTextAreaElement | null>(null);
  const raCheckRequestIdRef = useRef(0);
  const previousSelectedDbRef = useRef<string | null>(initialWorkingDatabase || persistedState?.selectedDb || null);
  const [databases, setDatabases] = useState<Database[]>([]);
  const [selectedDb, setSelectedDb] = useState(initialWorkingDatabase || persistedState?.selectedDb || '');
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [queries, setQueries] = useState<Query[]>([]);
  const [details, setDetails] = useState<Record<string, Query>>({});
  const [schemaMap, setSchemaMap] = useState<Record<string, TableInfo>>({});
  const [mode, setMode] = useState<WorkspaceMode>(persistedState?.mode ?? null);
  const [selectedQueryId, setSelectedQueryId] = useState(persistedState?.selectedQueryId ?? '');
  const [practiceDirection, setPracticeDirection] = useState<PracticeDirection>(persistedState?.practiceDirection ?? 'ra-to-sql');
  const [selectedOps, setSelectedOps] = useState<Set<string>>(new Set(persistedState?.selectedOps ?? []));
  const [raAnswerMode, setRaAnswerMode] = useState<RaAnswerMode>(persistedState?.raAnswerMode ?? 'guided');
  const [studentRa, setStudentRa] = useState(persistedState?.studentRa ?? '');
  const [customRa, setCustomRa] = useState(persistedState?.customRa ?? '');
  const [customSql, setCustomSql] = useState(persistedState?.customSql ?? '');
  const [customRaTranslating, setCustomRaTranslating] = useState(false);
  const [customSqlTranslating, setCustomSqlTranslating] = useState(false);
  const [customTranslationError, setCustomTranslationError] = useState<string | null>(null);
  const [customTranslationWarning, setCustomTranslationWarning] = useState<string | null>(null);
  const [customRaResult, setCustomRaResult] = useState<EvaluationResult | null>(null);
  const [customRaError, setCustomRaError] = useState<string | null>(null);
  const [customSqlResult, setCustomSqlResult] = useState<EvaluationResult | null>(null);
  const [customSqlError, setCustomSqlError] = useState<string | null>(null);
  const [sqlClauseAnswers, setSqlClauseAnswers] = useState<Record<string, string>>({});
  const [sqlChecked, setSqlChecked] = useState(false);
  const [revealSqlAnswers, setRevealSqlAnswers] = useState(false);
  const [raChecked, setRaChecked] = useState(false);
  const [revealRaAnswer, setRevealRaAnswer] = useState(false);
  const [raStartedEditing, setRaStartedEditing] = useState(persistedState?.raStartedEditing ?? false);
  const [freeformRaAnswer, setFreeformRaAnswer] = useState(persistedState?.freeformRaAnswer ?? '');
  const [sqlAnswerMode, setSqlAnswerMode] = useState<SqlAnswerMode>(persistedState?.sqlAnswerMode ?? 'guided');
  const [freeformSqlAnswer, setFreeformSqlAnswer] = useState(persistedState?.freeformSqlAnswer ?? '');
  const [traceResult, setTraceResult] = useState<EvaluationResult | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [sqlCheckResult, setSqlCheckResult] = useState<TranslationCheckResult | null>(null);
  const [sqlCheckLoading, setSqlCheckLoading] = useState(false);
  const [sqlCheckError, setSqlCheckError] = useState<string | null>(null);
  const [raCheckResult, setRaCheckResult] = useState<TranslationCheckResult | null>(null);
  const [raCheckLoading, setRaCheckLoading] = useState(false);
  const [raCheckError, setRaCheckError] = useState<string | null>(null);
  const [translationAiHint, setTranslationAiHint] = useState<string | null>(null);
  const [translationAiHintModel, setTranslationAiHintModel] = useState<string | null>(null);
  const [translationAiHintLoading, setTranslationAiHintLoading] = useState(false);
  const [translationAiHintError, setTranslationAiHintError] = useState<string | null>(null);
  const [customRaErrorExplanation, setCustomRaErrorExplanation] = useState<string | null>(null);
  const [customRaErrorExplanationHint, setCustomRaErrorExplanationHint] = useState<string | null>(null);
  const [customRaErrorExplanationModel, setCustomRaErrorExplanationModel] = useState<string | null>(null);
  const [customRaErrorExplanationLoading, setCustomRaErrorExplanationLoading] = useState(false);
  const [raCheckErrorExplanation, setRaCheckErrorExplanation] = useState<string | null>(null);
  const [raCheckErrorExplanationHint, setRaCheckErrorExplanationHint] = useState<string | null>(null);
  const [raCheckErrorExplanationModel, setRaCheckErrorExplanationModel] = useState<string | null>(null);
  const [raCheckErrorExplanationLoading, setRaCheckErrorExplanationLoading] = useState(false);
  const [sqlCheckErrorExplanation, setSqlCheckErrorExplanation] = useState<string | null>(null);
  const [sqlCheckErrorExplanationHint, setSqlCheckErrorExplanationHint] = useState<string | null>(null);
  const [sqlCheckErrorExplanationModel, setSqlCheckErrorExplanationModel] = useState<string | null>(null);
  const [sqlCheckErrorExplanationLoading, setSqlCheckErrorExplanationLoading] = useState(false);
  const [customSqlErrorExplanation, setCustomSqlErrorExplanation] = useState<string | null>(null);
  const [customSqlErrorExplanationHint, setCustomSqlErrorExplanationHint] = useState<string | null>(null);
  const [customSqlErrorExplanationModel, setCustomSqlErrorExplanationModel] = useState<string | null>(null);
  const [customSqlErrorExplanationLoading, setCustomSqlErrorExplanationLoading] = useState(false);
  const [customTranslationExplanation, setCustomTranslationExplanation] = useState<string | null>(null);
  const [customTranslationExplanationHint, setCustomTranslationExplanationHint] = useState<string | null>(null);
  const [customTranslationExplanationModel, setCustomTranslationExplanationModel] = useState<string | null>(null);
  const [customTranslationExplanationLoading, setCustomTranslationExplanationLoading] = useState(false);
  const [customLastEvaluated, setCustomLastEvaluated] = useState<'ra' | 'sql' | null>(null);

  useEffect(() => {
    api.healthCheck().then(() => setBackendOk(true)).catch(() => setBackendOk(false));
    api.getDatabases().then(setDatabases).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedDb || databases.length === 0) return;
    if (!databases.some((db) => db.name === selectedDb)) {
      setSelectedDb('');
      setWorkingDatabase('');
    }
  }, [databases, selectedDb]);

  useEffect(() => {
    if (!selectedDb) return;
    api.getQueries(selectedDb).then((qs) => setQueries(sortQueries(qs))).catch(() => setQueries([]));
  }, [selectedDb]);

  useEffect(() => {
    if (!selectedDb) return;

    let cancelled = false;
    api.getDatabaseSchema(selectedDb, 3)
      .then((schema) => {
        if (cancelled) return;
        setSchemaMap(Object.fromEntries(schema.tables.map((table) => [table.name, table])));
      })
      .catch(() => {
        if (cancelled) return;
        setSchemaMap({});
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDb]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(
      REFERENCE_SESSION_STORAGE_KEY,
      JSON.stringify({
        selectedDb,
        mode,
        selectedQueryId,
        practiceDirection,
        selectedOps: [...selectedOps],
        raAnswerMode,
        studentRa,
        raStartedEditing,
        freeformRaAnswer,
        sqlAnswerMode,
        freeformSqlAnswer,
        customRa,
        customSql,
      } satisfies PersistedReferenceState),
    );
  }, [
    selectedDb,
    mode,
    selectedQueryId,
    practiceDirection,
    selectedOps,
    raAnswerMode,
    studentRa,
    raStartedEditing,
    freeformRaAnswer,
    sqlAnswerMode,
    freeformSqlAnswer,
    customRa,
    customSql,
  ]);

  useEffect(() => {
    if (previousSelectedDbRef.current === selectedDb) return;
    previousSelectedDbRef.current = selectedDb;

    setSelectedQueryId('');
    setSelectedOps(new Set());
    setSqlClauseAnswers({});
    setSqlChecked(false);
    setRevealSqlAnswers(false);
    setRaAnswerMode('guided');
    setSqlAnswerMode('guided');
    setFreeformRaAnswer('');
    setFreeformSqlAnswer('');
    setSqlCheckResult(null);
    setSqlCheckError(null);
    setSqlCheckLoading(false);
    setRaChecked(false);
    setRevealRaAnswer(false);
    setRaStartedEditing(false);
    setTraceResult(null);
    setStudentRa('');
    setRaCheckResult(null);
    setRaCheckError(null);
    setRaCheckLoading(false);
    setTranslationAiHint(null);
    setTranslationAiHintModel(null);
    setTranslationAiHintLoading(false);
    setTranslationAiHintError(null);
    setCustomRa('');
    setCustomSql('');
    setCustomTranslationError(null);
    setCustomTranslationWarning(null);
    setCustomRaResult(null);
    setCustomRaTranslating(false);
    setCustomRaError(null);
    setCustomRaErrorExplanation(null);
    setCustomRaErrorExplanationHint(null);
    setCustomRaErrorExplanationModel(null);
    setCustomRaErrorExplanationLoading(false);
    setCustomSqlResult(null);
    setCustomSqlTranslating(false);
    setCustomSqlError(null);
    setCustomSqlErrorExplanation(null);
    setCustomSqlErrorExplanationHint(null);
    setCustomSqlErrorExplanationModel(null);
    setCustomSqlErrorExplanationLoading(false);
    setCustomTranslationExplanation(null);
    setCustomTranslationExplanationHint(null);
    setCustomTranslationExplanationModel(null);
    setCustomTranslationExplanationLoading(false);
    setCustomLastEvaluated(null);
    setSqlCheckErrorExplanation(null);
    setSqlCheckErrorExplanationHint(null);
    setSqlCheckErrorExplanationModel(null);
    setSqlCheckErrorExplanationLoading(false);
  }, [selectedDb]);

  const queryDetail = selectedQueryId ? details[selectedQueryId] ?? null : null;
  const sqlClauses = queryDetail?.solution?.sql ? parseSqlClauses(queryDetail.solution.sql) : [];
  const sqlClauseGroups = groupSqlClauses(sqlClauses);
  const selectedDbInfo = databases.find((db) => db.name === selectedDb);
  const translatorSchema = useMemo(
    () => Object.fromEntries(
      Object.entries(schemaMap).map(([tableName, table]) => [tableName, table.columns.map((column) => column.name)]),
    ),
    [schemaMap],
  );
  const filteredQueries = selectedOps.size > 0
    ? queries.filter((query) => queryMatchesOps(query, selectedOps))
    : queries;

  useEffect(() => {
    if (!selectedDb || !selectedQueryId) return;
    if (details[selectedQueryId]) return;

    let cancelled = false;
    api.getQueryDetail(selectedDb, selectedQueryId)
      .then((detail) => {
        if (cancelled) return;
        setDetails((prev) => ({ ...prev, [selectedQueryId]: detail }));
      })
      .catch(() => {
        if (cancelled) return;
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDb, selectedQueryId, details]);

  useEffect(() => {
    setSqlClauseAnswers({});
    setSqlChecked(false);
    setRevealSqlAnswers(false);
    setRaAnswerMode('guided');
    setSqlAnswerMode('guided');
    setFreeformRaAnswer('');
    setFreeformSqlAnswer('');
    setSqlCheckResult(null);
    setSqlCheckError(null);
    setSqlCheckLoading(false);
    setSqlCheckErrorExplanation(null);
    setSqlCheckErrorExplanationHint(null);
    setSqlCheckErrorExplanationModel(null);
    setSqlCheckErrorExplanationLoading(false);
    setRaChecked(false);
    setRevealRaAnswer(false);
    setRaStartedEditing(false);
    setTraceResult(null);
    setStudentRa('');
    setRaCheckResult(null);
    setRaCheckError(null);
    setRaCheckErrorExplanation(null);
    setRaCheckErrorExplanationHint(null);
    setRaCheckErrorExplanationModel(null);
    setRaCheckErrorExplanationLoading(false);
    setRaCheckLoading(false);
    setTranslationAiHint(null);
    setTranslationAiHintModel(null);
    setTranslationAiHintLoading(false);
    setTranslationAiHintError(null);
  }, [selectedQueryId, practiceDirection]);

  useEffect(() => {
    if (!selectedQueryId) return;
    if (filteredQueries.some((query) => query.id === selectedQueryId)) return;
    setSelectedQueryId('');
  }, [filteredQueries, selectedQueryId]);

  useEffect(() => {
    if (practiceDirection !== 'sql-to-ra' || !queryDetail) return;
    setRaStartedEditing(false);
    setStudentRa(createRaSkeleton(queryDetail.solution?.relational_algebra));
  }, [practiceDirection, queryDetail]);

  useEffect(() => {
    if (!selectedDb || !queryDetail || !queryDetail.solution?.relational_algebra) return;

    let cancelled = false;
    setTraceLoading(true);

    api.evaluateCustomQuery(selectedDb, queryDetail.solution.relational_algebra)
      .then((result) => {
        if (cancelled) return;
        setTraceResult(result);
      })
      .catch(() => {
        if (cancelled) return;
      })
      .finally(() => {
        if (cancelled) return;
        setTraceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDb, queryDetail, practiceDirection]);

  function updateSqlClauseAnswer(id: string, value: string) {
    setSqlChecked(false);
    setSqlCheckResult(null);
    setSqlCheckError(null);
    setSqlCheckErrorExplanation(null);
    setSqlCheckErrorExplanationHint(null);
    setSqlCheckErrorExplanationModel(null);
    setTranslationAiHint(null);
    setTranslationAiHintModel(null);
    setTranslationAiHintError(null);
    setSqlClauseAnswers((prev) => ({ ...prev, [id]: value }));
  }

  function toggleOp(op: string) {
    setSelectedOps((prev) => {
      const next = new Set(prev);
      if (next.has(op)) next.delete(op);
      else next.add(op);
      return next;
    });
  }

  function updateStudentRa(value: string) {
    setRaChecked(false);
    setRaCheckResult(null);
    setRaCheckError(null);
    setTranslationAiHint(null);
    setTranslationAiHintModel(null);
    setTranslationAiHintError(null);
    if (!raStartedEditing) {
      const input = raInputRef.current;
      const selectionStart = input?.selectionStart ?? value.length;
      const selectionEnd = input?.selectionEnd ?? value.length;
      const removedBeforeStart = value.slice(0, selectionStart).length - stripGuidedRaPlaceholderUnderscores(value.slice(0, selectionStart)).length;
      const removedBeforeEnd = value.slice(0, selectionEnd).length - stripGuidedRaPlaceholderUnderscores(value.slice(0, selectionEnd)).length;
      const nextValue = stripGuidedRaPlaceholderUnderscores(value);
      setRaStartedEditing(true);
      setStudentRa(nextValue);
      requestAnimationFrame(() => {
        const nextInput = raInputRef.current;
        if (!nextInput) return;
        const nextStart = Math.max(0, selectionStart - removedBeforeStart);
        const nextEnd = Math.max(0, selectionEnd - removedBeforeEnd);
        nextInput.setSelectionRange(nextStart, nextEnd);
      });
      return;
    }
    setStudentRa(value);
  }

  async function generateTranslationAiHint(
    direction: PracticeDirection,
    answer: string,
    fallbackMessage: string,
  ) {
    if (!selectedDb || !selectedQueryId) return;
    setTranslationAiHintLoading(true);
    setTranslationAiHint(null);
    setTranslationAiHintModel(null);
    setTranslationAiHintError(null);
    try {
      const response = await api.generateHint(
        selectedDb,
        selectedQueryId,
        answer,
        fallbackMessage,
        direction,
      );
      setTranslationAiHint(response.hint);
      setTranslationAiHintModel(response.model);
    } catch (error) {
      setTranslationAiHintError(formatCheckError(error));
    } finally {
      setTranslationAiHintLoading(false);
    }
  }

  async function handleTranslateRa() {
    if (!customRa.trim() || !selectedDb) return;
    setCustomLastEvaluated('ra');
    setCustomRaTranslating(true);
    setCustomTranslationError(null);
    setCustomTranslationWarning(null);
    setCustomTranslationExplanation(null);
    setCustomTranslationExplanationHint(null);
    setCustomTranslationExplanationModel(null);
    setCustomTranslationExplanationLoading(false);
    setCustomRaResult(null);
    setCustomRaError(null);
    setCustomRaErrorExplanation(null);
    setCustomRaErrorExplanationHint(null);
    setCustomRaErrorExplanationModel(null);
    setCustomRaErrorExplanationLoading(false);
    setCustomSqlResult(null);
    setCustomSqlError(null);
    setCustomSqlErrorExplanation(null);
    setCustomSqlErrorExplanationHint(null);
    setCustomSqlErrorExplanationModel(null);
    setCustomSqlErrorExplanationLoading(false);
    try {
      const translated = translateRaToSql(customRa.trim(), translatorSchema);
      setCustomSql(translated.translated);
      setCustomTranslationWarning(translated.warning ?? null);
    } catch (error) {
      setCustomTranslationError(
        error instanceof TranslationError || error instanceof Error
          ? error.message
          : 'Unable to translate the relational algebra expression.',
      );
      setCustomTranslationExplanationLoading(true);
      api.explainRaError(selectedDb, customRa.trim())
        .then((res) => {
          setCustomTranslationExplanation(res.explanation);
          setCustomTranslationExplanationHint(res.hint);
          setCustomTranslationExplanationModel(res.model);
        })
        .catch(() => {})
        .finally(() => setCustomTranslationExplanationLoading(false));
      setCustomRaTranslating(false);
      return;
    }
    try {
      const result = await api.evaluateCustomQuery(selectedDb, customRa.trim());
      setCustomRaResult(result);
    } catch (error) {
      setCustomRaError(formatCheckError(error));
      setCustomRaErrorExplanationLoading(true);
      api.explainRaError(selectedDb, customRa.trim())
        .then((res) => {
          setCustomRaErrorExplanation(res.explanation);
          setCustomRaErrorExplanationHint(res.hint);
          setCustomRaErrorExplanationModel(res.model);
        })
        .catch(() => {})
        .finally(() => setCustomRaErrorExplanationLoading(false));
    } finally {
      setCustomRaTranslating(false);
    }
  }

  async function handleTranslateSql() {
    if (!customSql.trim() || !selectedDb) return;
    setCustomLastEvaluated('sql');
    setCustomSqlTranslating(true);
    setCustomTranslationError(null);
    setCustomTranslationWarning(null);
    setCustomTranslationExplanation(null);
    setCustomTranslationExplanationHint(null);
    setCustomTranslationExplanationModel(null);
    setCustomTranslationExplanationLoading(false);
    setCustomSqlResult(null);
    setCustomSqlError(null);
    setCustomSqlErrorExplanation(null);
    setCustomSqlErrorExplanationHint(null);
    setCustomSqlErrorExplanationModel(null);
    setCustomSqlErrorExplanationLoading(false);
    setCustomRaResult(null);
    setCustomRaError(null);
    setCustomRaErrorExplanation(null);
    setCustomRaErrorExplanationHint(null);
    setCustomRaErrorExplanationModel(null);
    setCustomRaErrorExplanationLoading(false);
    try {
      const translated = translateSqlToRa(customSql.trim());
      setCustomRa(translated.translated);
      setCustomTranslationWarning(translated.warning ?? null);
    } catch (error) {
      setCustomTranslationError(
        error instanceof TranslationError || error instanceof Error
          ? error.message
          : 'Unable to translate the SQL statement.',
      );
      setCustomTranslationExplanationLoading(true);
      api.explainSqlError(selectedDb, customSql.trim())
        .then((res) => {
          setCustomTranslationExplanation(res.explanation);
          setCustomTranslationExplanationHint(res.hint);
          setCustomTranslationExplanationModel(res.model);
        })
        .catch(() => {})
        .finally(() => setCustomTranslationExplanationLoading(false));
      setCustomSqlTranslating(false);
      return;
    }
    try {
      const result = await api.evaluateCustomSqlQuery(selectedDb, customSql.trim());
      setCustomSqlResult(result);
    } catch (error) {
      setCustomSqlError(formatCheckError(error));
      setCustomSqlErrorExplanationLoading(true);
      api.explainSqlError(selectedDb, customSql.trim())
        .then((res) => {
          setCustomSqlErrorExplanation(res.explanation);
          setCustomSqlErrorExplanationHint(res.hint);
          setCustomSqlErrorExplanationModel(res.model);
        })
        .catch(() => {})
        .finally(() => setCustomSqlErrorExplanationLoading(false));
    } finally {
      setCustomSqlTranslating(false);
    }
  }

  async function checkRaAnswer() {
    if (!selectedDb || !selectedQueryId) return;
    const raAnswer = raAnswerMode === 'guided'
      ? stripGuidedRaPlaceholderUnderscores(studentRa).trim()
      : freeformRaAnswer.trim();
    if (!raAnswer) {
      setRaChecked(true);
      setRaCheckResult(null);
      setRaCheckError('Enter a relational algebra expression before checking it.');
      setTranslationAiHint(null);
      setTranslationAiHintModel(null);
      setTranslationAiHintError(null);
      return;
    }

    const requestId = raCheckRequestIdRef.current + 1;
    raCheckRequestIdRef.current = requestId;
    setRaChecked(true);
    setRaCheckLoading(true);
    setRaCheckError(null);
    setRaCheckErrorExplanation(null);
    setRaCheckErrorExplanationHint(null);
    setRaCheckErrorExplanationModel(null);
    setRaCheckErrorExplanationLoading(false);
    setTranslationAiHint(null);
    setTranslationAiHintModel(null);
    setTranslationAiHintError(null);

    try {
      const result = await api.checkTranslation(selectedDb, selectedQueryId, 'sql-to-ra', raAnswer);
      if (raCheckRequestIdRef.current !== requestId) return;
      setRaCheckResult(result);
      const freeformRaIntentMismatch = raAnswerMode === 'freeform'
        && result.is_correct
        && !fullRaMatchesCatalogIntent(raAnswer, queryDetail?.solution?.relational_algebra);
      if (!result.is_correct || freeformRaIntentMismatch) {
        void generateTranslationAiHint(
          'sql-to-ra',
          raAnswer,
          guidedRaHintMessage(
            raAnswerMode,
            raAnswer,
            queryDetail?.solution?.sql,
            queryDetail?.solution?.relational_algebra,
            result,
            freeformRaIntentMismatch,
          ),
        );
      }
    } catch (error) {
      if (raCheckRequestIdRef.current !== requestId) return;
      setRaCheckResult(null);
      setRaCheckError(formatCheckError(error));
      setRaCheckErrorExplanationLoading(true);
      api.explainRaError(selectedDb, raAnswer)
        .then((res) => {
          if (raCheckRequestIdRef.current !== requestId) return;
          setRaCheckErrorExplanation(res.explanation);
          setRaCheckErrorExplanationHint(res.hint);
          setRaCheckErrorExplanationModel(res.model);
        })
        .catch(() => {})
        .finally(() => {
          if (raCheckRequestIdRef.current === requestId) setRaCheckErrorExplanationLoading(false);
        });
    } finally {
      if (raCheckRequestIdRef.current === requestId) {
        setRaCheckLoading(false);
      }
    }
  }

  async function checkSqlAnswer() {
    if (!selectedDb || !selectedQueryId) return;

    const sqlAnswer = sqlAnswerMode === 'guided'
      ? buildSqlFromClauseGroups(sqlClauseGroups, sqlClauseAnswers).trim()
      : freeformSqlAnswer.trim();

    if (!sqlAnswer) {
      setSqlChecked(true);
      setSqlCheckResult(null);
      setSqlCheckError('Enter a SQL query before checking it.');
      setTranslationAiHint(null);
      setTranslationAiHintModel(null);
      setTranslationAiHintError(null);
      return;
    }

    setSqlChecked(false);
    setSqlCheckLoading(true);
    setSqlCheckError(null);
    setSqlCheckErrorExplanation(null);
    setSqlCheckErrorExplanationHint(null);
    setSqlCheckErrorExplanationModel(null);
    setSqlCheckErrorExplanationLoading(false);
    setTranslationAiHint(null);
    setTranslationAiHintModel(null);
    setTranslationAiHintError(null);

    try {
      const result = await api.checkTranslation(selectedDb, selectedQueryId, 'ra-to-sql', sqlAnswer);
      setSqlCheckResult(result);
      const guidedClauseMismatch = sqlAnswerMode === 'guided' && result.is_correct && !guidedSqlClausesMatch;
      const freeformSqlIntentMismatch = sqlAnswerMode === 'freeform'
        && result.is_correct
        && !fullSqlMatchesCatalogIntent(
          sqlAnswer,
          queryDetail?.solution?.sql,
          queryDetail?.solution?.relational_algebra,
      );
      if (!result.is_correct || guidedClauseMismatch || freeformSqlIntentMismatch) {
        void generateTranslationAiHint(
          'ra-to-sql',
          sqlAnswer,
          sqlAnswerMode === 'guided'
            ? guidedSqlClauseHintMessage(sqlClauseFeedback)
            : freeformSqlIntentMismatch
              ? 'The SQL returns the same rows on this dataset, but it does not match the catalog intent exactly. Check comparison operators, selected attributes, joins, aliases, and set operations against the source relational algebra expression.'
              : 'The submitted SQL query is not equivalent to the source relational algebra expression on the current dataset.',
        );
      }
    } catch (error) {
      setSqlCheckResult(null);
      setSqlCheckError(formatCheckError(error));
      setSqlCheckErrorExplanationLoading(true);
      api.explainSqlError(selectedDb, sqlAnswer)
        .then((res) => {
          setSqlCheckErrorExplanation(res.explanation);
          setSqlCheckErrorExplanationHint(res.hint);
          setSqlCheckErrorExplanationModel(res.model);
        })
        .catch(() => {})
        .finally(() => setSqlCheckErrorExplanationLoading(false));
    } finally {
      setSqlCheckLoading(false);
      setSqlChecked(true);
    }
  }

  if (backendOk === false) {
    return <StatusBadge variant="error">Backend service connection failed</StatusBadge>;
  }

  const shell = 'space-y-5 rounded-[28px] bg-[linear-gradient(180deg,rgba(246,245,253,0.72)_0%,rgba(244,246,252,0.84)_52%,rgba(247,250,249,0.9)_100%)] p-3 sm:p-4';
  const hero = 'rounded-[26px] border border-[#dde1f0] bg-[linear-gradient(135deg,#f5f4ff_0%,#eef2ff_52%,#eef7f4_100%)] p-6 text-[#3f4761] shadow-[0_14px_34px_rgba(123,128,173,0.1)]';
  const blockCard = 'rounded-[24px] border border-[#dfe2f0] bg-[rgba(255,255,255,0.82)] p-5 shadow-[0_12px_28px_rgba(123,128,173,0.08)]';
  const blockCardSoft = 'rounded-[20px] border border-[#e4e7f2] bg-[rgba(255,255,255,0.9)] p-5 shadow-[0_8px_22px_rgba(123,128,173,0.06)]';
  const sectionLabel = 'text-xs font-semibold uppercase tracking-[0.22em] text-[#615a96]';
  const sectionTitle = 'text-xl font-semibold text-[#3f4761]';
  const primaryButton = 'app-primary-btn disabled:opacity-50';
  const secondaryButton = 'app-secondary-btn';
  const activeQueryRows = extractExpectedRows(traceResult, queryDetail);
  const raMatchesSolution = raCheckResult?.is_correct ?? false;
  const sqlMatchesSolution = sqlCheckResult?.is_correct ?? false;
  const sqlClauseFeedback = getSqlClauseFeedback(sqlClauseGroups, sqlClauseAnswers);
  const guidedSqlClausesMatch = sqlClauseFeedback.length > 0 && sqlClauseFeedback.every((item) => item.answered && item.matches);
  const fullSqlCatalogIntentMatches = fullSqlMatchesCatalogIntent(
    freeformSqlAnswer,
    queryDetail?.solution?.sql,
    queryDetail?.solution?.relational_algebra,
  );
  const fullRaCatalogIntentMatches = fullRaMatchesCatalogIntent(
    freeformRaAnswer,
    queryDetail?.solution?.relational_algebra,
  );
  const sqlAnswerAccepted = sqlMatchesSolution && (sqlAnswerMode === 'guided' ? guidedSqlClausesMatch : fullSqlCatalogIntentMatches);
  const raAnswerAccepted = raMatchesSolution && (raAnswerMode === 'guided' || fullRaCatalogIntentMatches);
  const currentRaAnswerText = raAnswerMode === 'guided'
    ? stripGuidedRaPlaceholderUnderscores(studentRa).trim()
    : freeformRaAnswer.trim();
  return (
    <div className={shell}>
      <section className={hero}>
        <div className="space-y-3">
          <p className="text-sm font-bold uppercase tracking-[0.28em] text-[#615a96]">Academic Practice Studio</p>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#3f4761] sm:text-4xl">RA ↔ SQL Translation</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#475467] sm:text-base">
              Translate between relational algebra and SQL with catalog exercises or customized queries, and result previews against the selected database.
            </p>
          </div>
        </div>
      </section>

      <section className={blockCard}>
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="app-icon-tile flex h-12 w-12 items-center justify-center rounded-[18px]">
                <DatabaseIcon className="app-icon-glyph h-5 w-5" />
              </div>
              <div>
                <p className={sectionLabel}>Study Setup</p>
                <h2 className={sectionTitle}>Choose a database workspace</h2>
              </div>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-[#475467]">
              Pick the database you want to work with. Once selected, this page shows the schema, catalog translation drills, and the custom translator.
            </p>
          </div>
          <div className="rounded-[20px] border border-[#e4e7f2] bg-[rgba(255,255,255,0.82)] p-4 shadow-[0_8px_20px_rgba(123,128,173,0.06)]">
            <label htmlFor={databaseSelectId} className="mb-2 block text-sm font-semibold text-[#344054]">Database collection</label>
            <select
              id={databaseSelectId}
              value={selectedDb}
              onChange={(e) => {
                const nextDb = e.target.value;
                setSelectedDb(nextDb);
                setWorkingDatabase(nextDb);
                setDetails({});
                setSchemaMap({});
                setMode(null);
                setCustomRa('');
                setCustomSql('');
              }}
              className="app-input w-full rounded-2xl bg-white/92 px-4 py-3 text-sm cursor-pointer"
            >
              <option value="">- Select a database -</option>
              {databases.map((db) => (
                <option key={db.name} value={db.name}>{db.name} ({db.table_count} tables)</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {selectedDb && selectedDbInfo && (
        <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className={`${blockCard} space-y-4 xl:sticky xl:top-32 xl:self-start`}>
            <div className="flex items-center gap-3">
              <div className="app-icon-tile-soft flex h-10 w-10 items-center justify-center rounded-[14px]">
                <DatabaseIcon className="app-icon-glyph-soft h-5 w-5" />
              </div>
              <div>
                <p className={sectionLabel}>Schema Panel</p>
                <h2 className="text-lg font-semibold text-[#3f4761]">{selectedDb}</h2>
              </div>
            </div>
            <Collapsible title={`${selectedDbInfo.table_count} tables`} quiet>
              <div className="space-y-0.5">
                {selectedDbInfo.tables.map((tableName) => (
                  <TablePreview key={tableName} tableName={tableName} metadata={schemaMap[tableName]} />
                ))}
              </div>
            </Collapsible>

            <div className="space-y-3 border-t border-[#e5e7eb] pt-4">
              <p className={sectionLabel}>Practice Mode</p>
              <div className="grid gap-2">
                {queries.length > 0 ? (
                  <button
                    onClick={() => setMode('catalog')}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition-colors ${
                      mode === 'catalog'
                        ? 'border-[#87d7c8] bg-[#f3fbf8] text-[#214c45]'
                        : 'border-[#e4e7f2] bg-white/78 text-[#3d6f67] hover:bg-[#f8fcfb]'
                    }`}
                  >
                    <LayoutList className="app-icon-glyph h-4 w-4" />
                    Catalog practice
                  </button>
                ) : (
                  <p className="text-sm leading-6 text-[#667085]">This database does not have a translation catalog yet.</p>
                )}
                <button
                  onClick={() => setMode('custom')}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition-colors ${
                    mode === 'custom'
                      ? 'border-[#87d7c8] bg-[#f3fbf8] text-[#214c45]'
                      : 'border-[#e4e7f2] bg-white/78 text-[#3d6f67] hover:bg-[#f8fcfb]'
                  }`}
                >
                  <Pencil className="app-icon-glyph-soft h-4 w-4" />
                  Custom translator
                </button>
              </div>
            </div>

            {mode === 'catalog' && (
              <div className="space-y-4 border-t border-[#e5e7eb] pt-4">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-[#3d6f67]">Operators</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {OPERATOR_OPTIONS.map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleOp(key)}
                        aria-pressed={selectedOps.has(key)}
                        className={`rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                          selectedOps.has(key)
                            ? 'border-[#87d7c8] bg-[#e7f7f2] text-[#214c45]'
                            : 'border-[#d7eee7] bg-white/72 text-[#3d6f67] hover:bg-[#f8fcfb]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="border-t border-[#e5e7eb] pt-4">
              <Collapsible title="Translation tips" quiet>
                <div className="space-y-2 text-sm text-[#475467]">
                  <p><strong className="text-[#344054]">Selection:</strong> σ maps to WHERE.</p>
                  <p><strong className="text-[#344054]">Projection:</strong> π maps most closely to SELECT DISTINCT.</p>
                  <p><strong className="text-[#344054]">Rename:</strong> ρ maps to aliases and AS.</p>
                  <p><strong className="text-[#344054]">Set operations:</strong> union, difference, and intersection map to UNION, EXCEPT, and INTERSECT.</p>
                </div>
              </Collapsible>
            </div>
          </aside>

          <div className="min-w-0 space-y-5">
            {!mode && (
              <section className={`${blockCard} space-y-2`}>
                <p className={sectionLabel}>Workspace</p>
                <h2 className={sectionTitle}>Choose a translation mode</h2>
                <p className="max-w-2xl text-sm leading-6 text-[#475467]">
                  Use catalog practice for guided RA and SQL drills, or use the custom translator to experiment freely.
                </p>
              </section>
            )}

      {mode === 'catalog' && (
        <section className={`${blockCard} space-y-5`}>
          <div className="flex items-center gap-3">
            <div className="app-icon-tile flex h-11 w-11 items-center justify-center rounded-[16px] shadow-[0_4px_0_0_rgba(203,234,227,0.9)]">
              <BookOpen className="app-icon-glyph h-5 w-5" />
            </div>
            <div>
              <p className={sectionLabel}>Catalog Translation</p>
              <h2 className={sectionTitle}>Practice with catalog prompts</h2>
            </div>
          </div>

          {queries.length === 0 ? (
            <StatusBadge variant="info">This database does not have any cataloged translation queries yet.</StatusBadge>
          ) : (
            <>
              <div className={`${blockCardSoft} space-y-4`}>
                <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <label htmlFor={querySelectId} className="block text-sm font-semibold text-[#344054]">Choose a prompt from the catalog</label>
                    <div className="flex flex-wrap gap-4 text-xs font-semibold text-[#8b6a50]">
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> beginner</span>
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> intermediate</span>
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> advanced</span>
                    </div>
                  </div>
                  <select
                    id={querySelectId}
                    value={selectedQueryId}
                    onChange={(e) => setSelectedQueryId(e.target.value)}
                    className="app-input w-full rounded-2xl bg-white px-4 py-3 text-sm cursor-pointer"
                  >
                    <option value="">- Select a query -</option>
                    {filteredQueries.map((query) => (
                      <option key={query.id} value={query.id}>
                        {difficultyIcon(query.difficulty)} {query.prompt}
                      </option>
                    ))}
                  </select>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-[#344054]">Practice direction</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setPracticeDirection('ra-to-sql')}
                        aria-pressed={practiceDirection === 'ra-to-sql'}
                        className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${practiceDirection === 'ra-to-sql' ? 'border-[#87d7c8] bg-[linear-gradient(135deg,#8ddfd2_0%,#8ee0a2_100%)] text-[#214c45]' : 'border-[#dfe2f0] bg-white text-[#475467]'}`}
                      >
                        RA → SQL
                      </button>
                      <button
                        type="button"
                        onClick={() => setPracticeDirection('sql-to-ra')}
                        aria-pressed={practiceDirection === 'sql-to-ra'}
                        className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${practiceDirection === 'sql-to-ra' ? 'border-[#87d7c8] bg-[linear-gradient(135deg,#8ddfd2_0%,#8ee0a2_100%)] text-[#214c45]' : 'border-[#dfe2f0] bg-white text-[#475467]'}`}
                      >
                        SQL → RA
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {filteredQueries.length === 0 ? (
                <StatusBadge variant="info">No catalog prompts match the selected operator filters.</StatusBadge>
              ) : null}

              {!queryDetail ? null : (
                <div className="space-y-4">
                  <div className="rounded-[24px] border border-[#d8c39a] bg-[#fff8eb] p-5 shadow-[0_8px_18px_rgba(151,103,59,0.08)]">
                    <p className="text-sm text-[#6d4b31]"><span className="font-semibold text-[#5c3b1f]">Prompt:</span> {queryDetail.prompt}</p>
                  </div>

                  <div className={`grid gap-4 ${practiceDirection === 'ra-to-sql' ? 'xl:grid-cols-[0.95fr_1.05fr]' : 'xl:grid-cols-[0.95fr_1.05fr]'}`}>
                    <div className={`${blockCardSoft} min-w-0 space-y-4`}>
                      <div className="flex items-center gap-2">
                        {practiceDirection === 'ra-to-sql' ? (
                          <>
                            <Pencil className="h-4 w-4 text-[#615a96]" />
                            <h3 className="text-base font-semibold text-[#3f4761]">Relational Algebra</h3>
                          </>
                        ) : (
                          <>
                            <BookOpen className="h-4 w-4 text-[#615a96]" />
                            <h3 className="text-base font-semibold text-[#3f4761]">SQL Statement</h3>
                          </>
                        )}
                      </div>

                      {practiceDirection === 'ra-to-sql' ? (
                        <>
                          <p className="text-sm leading-6 text-[#475467]">
                            Use the canonical RA expression as the source, then write the equivalent SQL on the right.
                          </p>
                          <pre className="app-code overflow-x-auto p-4 text-sm text-[#344054]">
                            {formatRaExpression(queryDetail.solution?.relational_algebra)}
                          </pre>
                          <div className="space-y-3">
                            <Collapsible title={`Source output${traceResult ? ` (${traceResult.row_count} rows)` : ''}`} quiet>
                              {traceLoading ? (
                                <p className="text-sm italic text-[#667085]">Loading output preview...</p>
                              ) : traceResult?.rows.length ? (
                                <DataTable rows={traceResult.rows} compact maxHeight="15rem" />
                              ) : (
                                <p className="text-sm italic text-[#667085]">No rows returned.</p>
                              )}
                            </Collapsible>
                            {activeQueryRows ? (
                              <Collapsible title={`Expected output (${activeQueryRows.length} rows)`} quiet>
                                {activeQueryRows.length > 0 ? <DataTable rows={activeQueryRows} compact maxHeight="15rem" /> : <p className="text-sm italic text-[#667085]">Expected result returns no rows.</p>}
                              </Collapsible>
                            ) : null}
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-sm leading-6 text-[#475467]">
                            Use the canonical SQL statement as the source, then write the equivalent relational algebra on the right.
                          </p>
                          <pre className="app-code overflow-x-auto p-4 text-sm text-[#344054]">
                            {formatSqlForDisplay(queryDetail.solution?.sql)}
                          </pre>
                          <div className="space-y-3">
                            <Collapsible title={`Source output${traceResult ? ` (${traceResult.row_count} rows)` : ''}`} quiet>
                              {traceLoading ? (
                                <p className="text-sm italic text-[#667085]">Loading output preview...</p>
                              ) : traceResult?.rows.length ? (
                                <DataTable rows={traceResult.rows} compact maxHeight="15rem" />
                              ) : (
                                <p className="text-sm italic text-[#667085]">No rows returned.</p>
                              )}
                            </Collapsible>
                          </div>
                        </>
                      )}
                    </div>

                    <div className={`${blockCardSoft} min-w-0 space-y-4`}>
                      <div className="flex items-center gap-2">
                        <Pencil className="h-4 w-4 text-[#615a96]" />
                        <h3 className="text-base font-semibold text-[#3f4761]">
                          {practiceDirection === 'ra-to-sql' ? 'Your SQL answer' : 'Your RA answer'}
                        </h3>
                      </div>

                      {practiceDirection === 'ra-to-sql' ? (
                        <>
                          <p className="text-sm leading-6 text-[#475467]">
                            Start from the canonical SQL layout, then either fill the scaffold clause by clause or switch to a free-form SQL answer if you want to use a different valid structure.
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSqlAnswerMode('guided');
                                setSqlCheckResult(null);
                                setSqlCheckError(null);
                                setTranslationAiHint(null);
                                setTranslationAiHintModel(null);
                                setTranslationAiHintError(null);
                              }}
                              aria-pressed={sqlAnswerMode === 'guided'}
                              className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${sqlAnswerMode === 'guided' ? 'border-[#87d7c8] bg-[linear-gradient(135deg,#8ddfd2_0%,#8ee0a2_100%)] text-[#214c45]' : 'border-[#dfe2f0] bg-white text-[#475467]'}`}
                            >
                              Guided SQL layout
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSqlAnswerMode('freeform');
                                setSqlCheckResult(null);
                                setSqlCheckError(null);
                                setTranslationAiHint(null);
                                setTranslationAiHintModel(null);
                                setTranslationAiHintError(null);
                              }}
                              aria-pressed={sqlAnswerMode === 'freeform'}
                              className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${sqlAnswerMode === 'freeform' ? 'border-[#87d7c8] bg-[linear-gradient(135deg,#8ddfd2_0%,#8ee0a2_100%)] text-[#214c45]' : 'border-[#dfe2f0] bg-white text-[#475467]'}`}
                            >
                              Write full SQL
                            </button>
                          </div>
                          {sqlAnswerMode === 'guided' ? (
                          <div className="space-y-3">
                            {sqlClauseGroups.map((group) => {
                              const isOperatorOnly = group.id === 'set_operator';
                              const userFromClause = group.clauses.find((candidate) => candidate.keyword === 'FROM')
                                ? (sqlClauseAnswers[group.clauses.find((candidate) => candidate.keyword === 'FROM')!.id] ?? '')
                                : '';
                              const expectedFromClause = group.clauses.find((candidate) => candidate.keyword === 'FROM')?.expectedBody ?? '';

                              return (
                                <div key={group.id} className="rounded-[18px] border border-[#d7deef] bg-white/85 p-3.5">
                                  <p className="text-sm font-semibold text-[#344054]">{group.title}</p>

                                  <div className={`mt-2.5 space-y-2 ${isOperatorOnly ? '' : 'rounded-2xl border border-[#d7deef] bg-white p-3'}`}>
                                    {group.clauses.map((clause) => {
                                      const userValue = sqlClauseAnswers[clause.id] ?? '';
                                      const clauseCorrect = clauseMatchesCatalogClause(clause, userValue, userFromClause, expectedFromClause);
                                      const clauseAnswered = userValue.trim().length > 0;
                                      const clauseBadgeState = getClauseBadgeState(
                                        clauseCorrect,
                                        clauseAnswered,
                                      );
                                      return (
                                        <div key={clause.id} className="flex items-start gap-2.5">
                                          <span className="min-w-[88px] rounded-xl border border-[#cbeae3] bg-[#f3fbf8] px-2.5 py-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3d6f67]">
                                            {clause.keyword}
                                          </span>
                                          <div className="flex flex-1 items-start gap-2">
                                            <textarea
                                              value={userValue}
                                              onChange={(e) => updateSqlClauseAnswer(clause.id, e.target.value)}
                                              aria-label={clause.label}
                                              placeholder={clause.keyword === 'SQL' ? 'Write SQL here' : 'Fill in'}
                                              className={`min-h-[54px] flex-1 resize-y rounded-2xl border border-[#d7deef] bg-white px-3 py-2 font-mono text-sm leading-6 text-[#344054] focus:border-[#74c8b8] focus:outline-none focus:ring-4 focus:ring-[#d9f3ee] ${isOperatorOnly ? '' : 'border-[#e4e7f2]'}`}
                                            />
                                            {sqlChecked && !sqlCheckLoading ? (
                                              <span
                                                title={
                                                  clauseBadgeState === 'correct'
                                                    ? 'Matches the catalog clause.'
                                                    : clauseBadgeState === 'mismatch'
                                                        ? 'Does not match the catalog clause.'
                                                        : 'No clause feedback yet.'
                                                }
                                                className={`mt-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                                                clauseBadgeState === 'correct'
                                                  ? 'bg-[#e8faf4] text-[#166534]'
                                                  : clauseBadgeState === 'mismatch'
                                                    ? 'bg-[#fff1f2] text-[#be123c]'
                                                    : 'bg-[#f4f5f7] text-[#667085]'
                                              }`}>
                                                {clauseBadgeState === 'correct' ? <Check className="h-4 w-4" /> : clauseBadgeState === 'mismatch' ? <X className="h-4 w-4" /> : null}
                                              </span>
                                            ) : null}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {revealSqlAnswers ? (
                                    <div className="mt-2.5 rounded-2xl border border-[#ead7b8] bg-[#fffaf1] px-3 py-2">
                                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7c5433]">EXPECTED</p>
                                      <div className="mt-1.5 space-y-0.5 font-mono text-sm leading-6 text-[#5c3b1f]">
                                        {group.clauses.map((clause) => (
                                          <p key={clause.id}>
                                            <span className="font-semibold">{clause.keyword}</span> {clause.expectedBody}
                                          </p>
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                          ) : (
                            <div className="space-y-3">
                              <textarea
                                value={freeformSqlAnswer}
                                onChange={(e) => {
                                  setFreeformSqlAnswer(e.target.value);
                                  setSqlChecked(false);
                                  setSqlCheckResult(null);
                                  setSqlCheckError(null);
                                  setSqlCheckErrorExplanation(null);
                                  setSqlCheckErrorExplanationHint(null);
                                  setSqlCheckErrorExplanationModel(null);
                                  setTranslationAiHint(null);
                                  setTranslationAiHintModel(null);
                                  setTranslationAiHintError(null);
                                }}
                                aria-label="Full SQL answer"
                                placeholder="Write a complete SQL query here."
                                className="min-h-[180px] w-full resize-y rounded-2xl border border-[#d7deef] bg-white px-4 py-3 font-mono text-sm leading-6 text-[#344054] focus:border-[#74c8b8] focus:outline-none focus:ring-4 focus:ring-[#d9f3ee]"
                              />
                              {revealSqlAnswers ? (
                                <div className="rounded-2xl border border-[#ead7b8] bg-[#fffaf1] px-3 py-2">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7c5433]">EXPECTED</p>
                                  <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap font-mono text-sm leading-6 text-[#5c3b1f]">
                                    {formatSqlForDisplay(queryDetail.solution?.sql)}
                                  </pre>
                                </div>
                              ) : null}
                              <p className="text-xs leading-5 text-[#667085]">
                                Use this mode when your SQL is correct but does not follow the catalog&apos;s clause layout exactly.
                              </p>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-3">
                            <button type="button" onClick={() => { void checkSqlAnswer(); }} className={primaryButton} disabled={sqlCheckLoading}>
                              {sqlCheckLoading ? 'Checking SQL...' : 'Check SQL'}
                            </button>
                            <button type="button" onClick={() => setRevealSqlAnswers((value) => !value)} className={secondaryButton}>
                              {revealSqlAnswers ? 'Hide Canonical SQL' : 'Show Canonical SQL'}
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-sm leading-6 text-[#475467]">
                            Start from the canonical RA layout, then either fill the scaffold or switch to a full relational algebra answer if you want to write your own complete expression.
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <button
                              type="button"
                              onClick={() => {
                                setRaAnswerMode('guided');
                                setRaChecked(false);
                                setRaCheckResult(null);
                                setRaCheckError(null);
                                setTranslationAiHint(null);
                                setTranslationAiHintModel(null);
                                setTranslationAiHintError(null);
                              }}
                              aria-pressed={raAnswerMode === 'guided'}
                              className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${raAnswerMode === 'guided' ? 'border-[#87d7c8] bg-[linear-gradient(135deg,#8ddfd2_0%,#8ee0a2_100%)] text-[#214c45]' : 'border-[#dfe2f0] bg-white text-[#475467]'}`}
                            >
                              Guided RA layout
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRaAnswerMode('freeform');
                                setRaChecked(false);
                                setRaCheckResult(null);
                                setRaCheckError(null);
                                setTranslationAiHint(null);
                                setTranslationAiHintModel(null);
                                setTranslationAiHintError(null);
                              }}
                              aria-pressed={raAnswerMode === 'freeform'}
                              className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${raAnswerMode === 'freeform' ? 'border-[#87d7c8] bg-[linear-gradient(135deg,#8ddfd2_0%,#8ee0a2_100%)] text-[#214c45]' : 'border-[#dfe2f0] bg-white text-[#475467]'}`}
                            >
                              Write full RA
                            </button>
                          </div>
                          <div className="rounded-[18px] border border-[#d7deef] bg-white/85 p-3.5">
                            <div className="flex items-start gap-2">
                              {raAnswerMode === 'guided' ? (
                                <textarea
                                  ref={raInputRef}
                                  value={studentRa}
                                  onChange={(e) => updateStudentRa(e.target.value)}
                                  aria-label="Relational algebra answer"
                                  placeholder="π{_____}(σ{_____}(relation))"
                                  className="min-h-[72px] flex-1 resize-y rounded-2xl border border-[#d7deef] bg-white px-3 py-2 font-mono text-sm leading-6 text-[#344054] focus:border-[#74c8b8] focus:outline-none focus:ring-4 focus:ring-[#d9f3ee]"
                                />
                              ) : (
                                <textarea
                                  value={freeformRaAnswer}
                                  onChange={(e) => {
                                    setFreeformRaAnswer(e.target.value);
                                    setRaChecked(false);
                                    setRaCheckResult(null);
                                    setRaCheckError(null);
                                    setTranslationAiHint(null);
                                    setTranslationAiHintModel(null);
                                    setTranslationAiHintError(null);
                                  }}
                                  aria-label="Full relational algebra answer"
                                  placeholder="Write a complete relational algebra expression here."
                                  className="min-h-[140px] flex-1 resize-y rounded-2xl border border-[#d7deef] bg-white px-3 py-2 font-mono text-sm leading-6 text-[#344054] focus:border-[#74c8b8] focus:outline-none focus:ring-4 focus:ring-[#d9f3ee]"
                                />
                              )}
                              {raChecked ? (
                                <span className={`mt-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                                  raCheckLoading
                                    ? 'bg-[#f4f5f7] text-[#667085]'
                                    : raAnswerAccepted
                                    ? 'bg-[#e8faf4] text-[#166534]'
                                    : currentRaAnswerText
                                      ? 'bg-[#fff1f2] text-[#be123c]'
                                      : 'bg-[#f4f5f7] text-[#667085]'
                                }`}>
                                  {raCheckLoading
                                    ? null
                                    : raAnswerAccepted
                                    ? <Check className="h-4 w-4" />
                                    : currentRaAnswerText
                                      ? <X className="h-4 w-4" />
                                      : null}
                                </span>
                              ) : null}
                            </div>

                            {revealRaAnswer ? (
                              <div className="mt-2.5 rounded-2xl border border-[#ead7b8] bg-[#fffaf1] px-3 py-2">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7c5433]">EXPECTED</p>
                                <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap font-mono text-sm leading-6 text-[#5c3b1f]">
                                  {formatRaExpression(queryDetail.solution?.relational_algebra)}
                                </pre>
                              </div>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap gap-3">
                            <button type="button" onClick={() => { void checkRaAnswer(); }} className={primaryButton} disabled={raCheckLoading}>
                              {raCheckLoading ? 'Checking RA...' : 'Check RA'}
                            </button>
                            <button type="button" onClick={() => setRevealRaAnswer((value) => !value)} className={secondaryButton}>
                              {revealRaAnswer ? 'Hide Canonical RA' : 'Show Canonical RA'}
                            </button>
                          </div>
                        </>
                      )}

                      {practiceDirection === 'sql-to-ra' && raCheckError ? (
                        <div className="space-y-2">
                          <StatusBadge variant="error">{raCheckError}</StatusBadge>
                          {(raCheckErrorExplanationLoading || raCheckErrorExplanation) && (
                            <div className="rounded-2xl border border-[#cbeae3] bg-[#f7fcfa] p-3 space-y-1">
                              {raCheckErrorExplanationLoading ? (
                                <p className="text-sm text-[#667085]">Explaining error...</p>
                              ) : (
                                <>
                                  <p className="text-sm text-[#344054]">{raCheckErrorExplanation}</p>
                                  {raCheckErrorExplanationHint && <p className="text-sm text-[#3d6f67]">{raCheckErrorExplanationHint}</p>}
                                  {raCheckErrorExplanationModel && <p className="text-xs text-[#667085]">{raCheckErrorExplanationModel}</p>}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ) : null}

                      {practiceDirection === 'ra-to-sql' && sqlCheckError ? (
                        <div className="space-y-2">
                          <StatusBadge variant="error">{sqlCheckError}</StatusBadge>
                          {(sqlCheckErrorExplanationLoading || sqlCheckErrorExplanation) && (
                            <div className="rounded-2xl border border-[#cbeae3] bg-[#f7fcfa] p-3 space-y-1">
                              {sqlCheckErrorExplanationLoading ? (
                                <p className="text-sm text-[#667085]">Explaining error...</p>
                              ) : (
                                <>
                                  <p className="text-sm text-[#344054]">{sqlCheckErrorExplanation}</p>
                                  {sqlCheckErrorExplanationHint && <p className="text-sm text-[#3d6f67]">{sqlCheckErrorExplanationHint}</p>}
                                  {sqlCheckErrorExplanationModel && <p className="text-xs text-[#667085]">{sqlCheckErrorExplanationModel}</p>}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ) : null}

                      {practiceDirection === 'ra-to-sql' && sqlCheckResult ? (
                        sqlAnswerAccepted ? (
                          <StatusBadge variant="success">
                            {sqlAnswerMode === 'guided'
                              ? 'Correct: your SQL returns the same relation as the relational algebra expression.'
                              : 'Correct: your SQL returns the same relation as the relational algebra expression, even though it may use a different structure than the catalog answer.'}
                          </StatusBadge>
                        ) : (
                          <div className="rounded-[22px] border-2 border-[#cbeae3] bg-[#f7fcfa] p-4">
                            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#3d6f67]">
                              <Lightbulb className="h-4 w-4" />
                              AI translation hint{translationAiHintModel ? <span className="text-xs font-medium text-[#667085]">({translationAiHintModel})</span> : null}
                            </div>
                            {translationAiHintLoading ? (
                              <p className="text-sm italic leading-6 text-[#667085]">Generating a targeted hint from your answer...</p>
                            ) : translationAiHint ? (
                              <p className="text-sm leading-6 text-[#344054]">{translationAiHint}</p>
                            ) : (
                              <p className="text-sm leading-6 text-[#344054]">
                                {sqlMatchesSolution
                                  ? 'Your SQL returns the same rows on this dataset, but it does not match the catalog intent exactly. Review comparison operators, selected attributes, joins, aliases, and set operations.'
                                  : 'Your SQL is not equivalent on the current dataset. Compare the selected columns, join conditions, filters, and set operation structure against the source relational algebra expression.'}
                              </p>
                            )}
                            {translationAiHintError ? (
                              <p className="mt-2 text-xs leading-5 text-[#8b6a50]">AI hint unavailable: {translationAiHintError}</p>
                            ) : null}
                          </div>
                        )
                      ) : null}

                      {practiceDirection === 'sql-to-ra' && raCheckResult ? (
                        raAnswerAccepted ? (
                          <StatusBadge variant="success">
                            Correct: your relational algebra expression returns the same relation as the SQL statement.
                          </StatusBadge>
                        ) : (
                          <div className="rounded-[22px] border-2 border-[#cbeae3] bg-[#f7fcfa] p-4">
                            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#3d6f67]">
                              <Lightbulb className="h-4 w-4" />
                              AI translation hint{translationAiHintModel ? <span className="text-xs font-medium text-[#667085]">({translationAiHintModel})</span> : null}
                            </div>
                            {translationAiHintLoading ? (
                              <p className="text-sm italic leading-6 text-[#667085]">Generating a targeted hint from your answer...</p>
                            ) : translationAiHint ? (
                              <p className="text-sm leading-6 text-[#344054]">{translationAiHint}</p>
                            ) : (
                              <p className="text-sm leading-6 text-[#344054]">
                                {raMatchesSolution
                                  ? 'Your relational algebra expression returns the same rows on this dataset, but it does not match the catalog intent exactly. Review comparison operators, projections, selections, joins, renames, and set operations.'
                                  : 'Your relational algebra expression is not equivalent on the current dataset. Check whether your projections, selections, joins, renames, and set operations preserve the same rows and attributes as the source SQL statement.'}
                              </p>
                            )}
                            {translationAiHintError ? (
                              <p className="mt-2 text-xs leading-5 text-[#8b6a50]">AI hint unavailable: {translationAiHintError}</p>
                            ) : null}
                          </div>
                        )
                      ) : null}

                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {mode === 'custom' && (
        <section className={`${blockCard} space-y-5`}>
          <div className="flex items-center gap-3">
            <div className="app-icon-tile flex h-11 w-11 items-center justify-center rounded-[16px] shadow-[0_4px_0_0_rgba(203,234,227,0.9)]">
              <Pencil className="app-icon-glyph h-5 w-5" />
            </div>
            <div>
              <p className={sectionLabel}>Translation Workspace</p>
              <h2 className={sectionTitle}>User-defined Query Translator</h2>
            </div>
          </div>

          <p className="text-sm leading-6 text-[#475467]">
            Write an expression on either side, then click the translate button to convert it and see the result against the selected database.
          </p>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className={`${blockCardSoft} space-y-3`}>
              <label htmlFor={customRaTextareaId} className="text-sm font-semibold text-[#344054]">Relational algebra</label>
              <textarea
                id={customRaTextareaId}
                value={customRa}
                onChange={(e) => setCustomRa(e.target.value)}
                placeholder="π{name}(σ{dept_name = 'Comp. Sci.'}(student))"
                className="h-44 w-full resize-y rounded-2xl border border-[#d7deef] bg-white px-4 py-3 font-mono text-sm text-[#344054] focus:border-[#74c8b8] focus:outline-none focus:ring-4 focus:ring-[#d9f3ee]"
              />
              <p className="text-xs leading-5 text-[#667085]">
                Supported RA operators here: projection, selection, rename, join, product, union, difference, and intersection.
              </p>
              <button
                type="button"
                onClick={() => { void handleTranslateRa(); }}
                disabled={customRaTranslating || !customRa.trim() || !selectedDb}
                className={primaryButton}
              >
                {customRaTranslating ? 'Translating...' : 'Translate to SQL'}
              </button>
            </div>

            <div className={`${blockCardSoft} space-y-3`}>
              <label htmlFor={customSqlTextareaId} className="text-sm font-semibold text-[#344054]">SQL</label>
              <textarea
                id={customSqlTextareaId}
                value={customSql}
                onChange={(e) => setCustomSql(e.target.value)}
                placeholder="SELECT name FROM student WHERE dept_name = 'Comp. Sci.';"
                className="h-44 w-full resize-y rounded-2xl border border-[#d7deef] bg-white px-4 py-3 font-mono text-sm text-[#344054] focus:border-[#74c8b8] focus:outline-none focus:ring-4 focus:ring-[#d9f3ee]"
              />
              <p className="text-xs leading-5 text-[#667085]">
                Best-supported SQL shape: <code>SELECT ... FROM ... JOIN ... WHERE ...</code>, plus <code>UNION</code>, <code>EXCEPT</code>, and <code>INTERSECT</code>.
              </p>
              <button
                type="button"
                onClick={() => { void handleTranslateSql(); }}
                disabled={customSqlTranslating || !customSql.trim() || !selectedDb}
                className={primaryButton}
              >
                {customSqlTranslating ? 'Translating...' : 'Translate to RA'}
              </button>
            </div>
          </div>

          <div className="rounded-[18px] border border-[#d7deef] bg-white/85 p-3.5 space-y-3">
            <div>
              <p className="text-sm font-semibold text-[#344054]">Result preview</p>
              <p className="mt-1 text-xs text-[#667085]">
                {customRaResult
                  ? `Relational algebra — ${customRaResult.row_count} rows returned`
                  : customSqlResult
                    ? `SQL statement — ${customSqlResult.row_count} rows returned`
                    : customLastEvaluated === 'ra'
                      ? 'Relational algebra expression'
                      : customLastEvaluated === 'sql'
                        ? 'SQL statement'
                        : 'Click a translate button to evaluate your expression against the database.'}
              </p>
            </div>
            {customTranslationWarning && !customTranslationError ? (
              <StatusBadge variant="info">{customTranslationWarning}</StatusBadge>
            ) : null}
            {customTranslationError ? (
              <div className="space-y-2">
                <StatusBadge variant="warning">{customTranslationError}</StatusBadge>
                {(customTranslationExplanationLoading || customTranslationExplanation) && (
                  <div className="rounded-2xl border border-[#cbeae3] bg-[#f7fcfa] p-3 space-y-1">
                    {customTranslationExplanationLoading ? (
                      <p className="text-sm text-[#667085]">Explaining error...</p>
                    ) : (
                      <>
                        <p className="text-sm text-[#344054]">{customTranslationExplanation}</p>
                        {customTranslationExplanationHint && <p className="text-sm text-[#3d6f67]">{customTranslationExplanationHint}</p>}
                        {customTranslationExplanationModel && <p className="text-xs text-[#667085]">{customTranslationExplanationModel}</p>}
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (customRaTranslating || customSqlTranslating) ? (
              <p className="text-sm italic text-[#667085]">Evaluating...</p>
            ) : customRaError ? (
              <div className="space-y-2">
                <StatusBadge variant="warning">{customRaError}</StatusBadge>
                {(customRaErrorExplanationLoading || customRaErrorExplanation) && (
                  <div className="rounded-2xl border border-[#cbeae3] bg-[#f7fcfa] p-3 space-y-1">
                    {customRaErrorExplanationLoading ? (
                      <p className="text-sm text-[#667085]">Explaining error...</p>
                    ) : (
                      <>
                        <p className="text-sm text-[#344054]">{customRaErrorExplanation}</p>
                        {customRaErrorExplanationHint && <p className="text-sm text-[#3d6f67]">{customRaErrorExplanationHint}</p>}
                        {customRaErrorExplanationModel && <p className="text-xs text-[#667085]">{customRaErrorExplanationModel}</p>}
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : customSqlError ? (
              <div className="space-y-2">
                <StatusBadge variant="warning">{customSqlError}</StatusBadge>
                {(customSqlErrorExplanationLoading || customSqlErrorExplanation) && (
                  <div className="rounded-2xl border border-[#cbeae3] bg-[#f7fcfa] p-3 space-y-1">
                    {customSqlErrorExplanationLoading ? (
                      <p className="text-sm text-[#667085]">Explaining error...</p>
                    ) : (
                      <>
                        <p className="text-sm text-[#344054]">{customSqlErrorExplanation}</p>
                        {customSqlErrorExplanationHint && <p className="text-sm text-[#3d6f67]">{customSqlErrorExplanationHint}</p>}
                        {customSqlErrorExplanationModel && <p className="text-xs text-[#667085]">{customSqlErrorExplanationModel}</p>}
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : customRaResult ? (
              customRaResult.rows.length ? (
                <DataTable rows={customRaResult.rows} columns={customRaResult.schema_eval} compact maxHeight="15rem" />
              ) : (
                <p className="text-sm italic text-[#667085]">No rows returned.</p>
              )
            ) : customSqlResult ? (
              customSqlResult.rows.length ? (
                <DataTable rows={customSqlResult.rows} columns={customSqlResult.schema_eval} compact maxHeight="15rem" />
              ) : (
                <p className="text-sm italic text-[#667085]">No rows returned.</p>
              )
            ) : null}
          </div>
        </section>
      )}
          </div>
        </section>
      )}
    </div>
  );
}
