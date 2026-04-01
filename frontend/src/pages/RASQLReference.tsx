import { useEffect, useRef, useState } from 'react';
import { ApiError, api, type Database, type EvaluationResult, type Query, type TableInfo, type TranslationCheckResult } from '../lib/api';
import StatusBadge from '../components/StatusBadge';
import Collapsible from '../components/Collapsible';
import DataTable from '../components/DataTable';
import TablePreview from '../components/TablePreview';
import { sortQueries } from '../lib/difficulty';
import {
  BookOpen,
  Check,
  Database as DatabaseIcon,
  LayoutList,
  Pencil,
  X,
} from 'lucide-react';

type WorkspaceMode = 'catalog' | 'custom' | null;
type PracticeDirection = 'ra-to-sql' | 'sql-to-ra';

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

function clauseMatchesCatalogClause(clause: SqlClause, userValue: string): boolean {
  if (clause.keyword === 'SELECT' || clause.keyword === 'GROUP BY') {
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
  const fromBody = extractSection(compact, 'FROM', [' JOIN ', ' INNER JOIN ', ' LEFT JOIN ', ' RIGHT JOIN ', ' FULL JOIN ', ' CROSS JOIN ', ' WHERE ', ' GROUP BY ', ' HAVING ', ' ORDER BY ']);
  const joins = [...compact.matchAll(/((?:(?:INNER|LEFT|RIGHT|FULL|CROSS)\s+)?JOIN\s+.+?)(?=\s+(?:(?:(?:INNER|LEFT|RIGHT|FULL|CROSS)\s+)?JOIN|WHERE|GROUP BY|HAVING|ORDER BY|$))/gi)].map((match) => match[1].trim());
  const whereBody = extractSection(compact, 'WHERE', [' GROUP BY ', ' HAVING ', ' ORDER BY ']);
  const groupByBody = extractSection(compact, 'GROUP BY', [' HAVING ', ' ORDER BY ']);
  const havingBody = extractSection(compact, 'HAVING', [' ORDER BY ']);
  const orderByBody = extractSection(compact, 'ORDER BY', []);

  if (selectBody) clauses.push({ id: 'select', label: 'SELECT clause', keyword: 'SELECT', expectedBody: selectBody });
  if (fromBody) clauses.push({ id: 'from', label: 'FROM clause', keyword: 'FROM', expectedBody: fromBody });
  joins.forEach((joinClause, index) => {
    clauses.push({ id: `join_${index}`, label: `JOIN clause ${index + 1}`, keyword: 'JOIN', expectedBody: joinClause.replace(/^JOIN\s+/i, '').trim() });
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
  const raInputRef = useRef<HTMLTextAreaElement | null>(null);
  const raCheckRequestIdRef = useRef(0);
  const [databases, setDatabases] = useState<Database[]>([]);
  const [selectedDb, setSelectedDb] = useState('');
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [queries, setQueries] = useState<Query[]>([]);
  const [details, setDetails] = useState<Record<string, Query>>({});
  const [schemaMap, setSchemaMap] = useState<Record<string, TableInfo>>({});
  const [mode, setMode] = useState<WorkspaceMode>(null);
  const [selectedQueryId, setSelectedQueryId] = useState('');
  const [practiceDirection, setPracticeDirection] = useState<PracticeDirection>('ra-to-sql');
  const [studentRa, setStudentRa] = useState('');
  const [customRa, setCustomRa] = useState('');
  const [customSql, setCustomSql] = useState('');
  const [sqlClauseAnswers, setSqlClauseAnswers] = useState<Record<string, string>>({});
  const [sqlChecked, setSqlChecked] = useState(false);
  const [revealSqlAnswers, setRevealSqlAnswers] = useState(false);
  const [raChecked, setRaChecked] = useState(false);
  const [revealRaAnswer, setRevealRaAnswer] = useState(false);
  const [raStartedEditing, setRaStartedEditing] = useState(false);
  const [traceResult, setTraceResult] = useState<EvaluationResult | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [raCheckResult, setRaCheckResult] = useState<TranslationCheckResult | null>(null);
  const [raCheckLoading, setRaCheckLoading] = useState(false);
  const [raCheckError, setRaCheckError] = useState<string | null>(null);

  useEffect(() => {
    api.healthCheck().then(() => setBackendOk(true)).catch(() => setBackendOk(false));
    api.getDatabases().then(setDatabases).catch(() => {});
  }, []);

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
    setSelectedQueryId('');
    setSqlClauseAnswers({});
    setSqlChecked(false);
    setRevealSqlAnswers(false);
    setRaChecked(false);
    setRevealRaAnswer(false);
    setRaStartedEditing(false);
    setTraceResult(null);
    setStudentRa('');
    setRaCheckResult(null);
    setRaCheckError(null);
    setRaCheckLoading(false);
  }, [selectedDb]);

  const queryDetail = selectedQueryId ? details[selectedQueryId] ?? null : null;
  const sqlClauses = queryDetail?.solution?.sql ? parseSqlClauses(queryDetail.solution.sql) : [];
  const sqlClauseGroups = groupSqlClauses(sqlClauses);
  const selectedDbInfo = databases.find((db) => db.name === selectedDb);

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
    setRaChecked(false);
    setRevealRaAnswer(false);
    setRaStartedEditing(false);
    setTraceResult(null);
    setStudentRa('');
    setRaCheckResult(null);
    setRaCheckError(null);
    setRaCheckLoading(false);
  }, [selectedQueryId, practiceDirection]);

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
    setSqlClauseAnswers((prev) => ({ ...prev, [id]: value }));
  }

  function updateStudentRa(value: string) {
    setRaChecked(false);
    setRaCheckResult(null);
    setRaCheckError(null);
    if (!raStartedEditing) {
      const input = raInputRef.current;
      const selectionStart = input?.selectionStart ?? value.length;
      const selectionEnd = input?.selectionEnd ?? value.length;
      const removedBeforeStart = (value.slice(0, selectionStart).match(/_{2,}/g) ?? []).reduce((count, match) => count + match.length, 0);
      const removedBeforeEnd = (value.slice(0, selectionEnd).match(/_{2,}/g) ?? []).reduce((count, match) => count + match.length, 0);
      const nextValue = value.replace(/_{2,}/g, '');
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

  async function checkRaAnswer() {
    if (!selectedDb || !selectedQueryId) return;
    if (!studentRa.trim()) {
      setRaChecked(true);
      setRaCheckResult(null);
      setRaCheckError('Enter a relational algebra expression before checking it.');
      return;
    }

    const requestId = raCheckRequestIdRef.current + 1;
    raCheckRequestIdRef.current = requestId;
    setRaChecked(true);
    setRaCheckLoading(true);
    setRaCheckError(null);

    try {
      const result = await api.checkTranslation(selectedDb, selectedQueryId, 'sql-to-ra', studentRa.trim());
      if (raCheckRequestIdRef.current !== requestId) return;
      setRaCheckResult(result);
    } catch (error) {
      if (raCheckRequestIdRef.current !== requestId) return;
      setRaCheckResult(null);
      setRaCheckError(formatCheckError(error));
    } finally {
      if (raCheckRequestIdRef.current !== requestId) return;
      setRaCheckLoading(false);
    }
  }

  if (backendOk === false) {
    return <StatusBadge variant="error">Backend service connection failed</StatusBadge>;
  }

  const shell = 'space-y-6 rounded-[28px] bg-[linear-gradient(180deg,rgba(246,245,253,0.72)_0%,rgba(244,246,252,0.84)_52%,rgba(247,250,249,0.9)_100%)] p-4 sm:p-6';
  const hero = 'rounded-[26px] border border-[#dde1f0] bg-[linear-gradient(135deg,#f5f4ff_0%,#eef2ff_52%,#eef7f4_100%)] p-6 text-[#3f4761] shadow-[0_14px_34px_rgba(123,128,173,0.1)]';
  const blockCard = 'rounded-[24px] border border-[#dfe2f0] bg-[rgba(255,255,255,0.82)] p-5 shadow-[0_12px_28px_rgba(123,128,173,0.08)]';
  const blockCardSoft = 'rounded-[20px] border border-[#e4e7f2] bg-[rgba(255,255,255,0.9)] p-5 shadow-[0_8px_22px_rgba(123,128,173,0.06)]';
  const sectionLabel = 'text-xs font-semibold uppercase tracking-[0.22em] text-[#615a96]';
  const sectionTitle = 'text-xl font-semibold text-[#3f4761]';
  const primaryButton = 'app-primary-btn disabled:opacity-50';
  const secondaryButton = 'app-secondary-btn';
  const activeQueryRows = extractExpectedRows(traceResult, queryDetail);
  const raMatchesSolution = raCheckResult?.is_correct ?? false;
  return (
    <div className={shell}>
      <section className={hero}>
        <div className="space-y-3">
          <p className="text-sm font-bold uppercase tracking-[0.28em] text-[#615a96]">Academic Practice Studio</p>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#3f4761] sm:text-4xl">RA ↔ SQL Reference</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#475467] sm:text-base">
              Practice translating between relational algebra and SQL with catalog-backed prompts, intermediate traces, and clause-level mapping support.
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
              Pick the database you want to study. Once selected, the page opens the schema, pre-defined query practice workspace, and a user-defined translation pad.
            </p>
          </div>
          <div className="rounded-[20px] border border-[#e4e7f2] bg-[rgba(255,255,255,0.82)] p-4 shadow-[0_8px_20px_rgba(123,128,173,0.06)]">
            <label className="mb-2 block text-sm font-semibold text-[#344054]">Database collection</label>
            <select
              value={selectedDb}
              onChange={(e) => {
                setSelectedDb(e.target.value);
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
        <section className="grid gap-5 xl:grid-cols-[1.05fr_1.3fr]">
          <div className={`${blockCard} space-y-4`}>
            <div className="flex items-center gap-3">
              <div className="app-icon-tile-soft flex h-11 w-11 items-center justify-center rounded-[16px]">
                <DatabaseIcon className="app-icon-glyph-soft h-5 w-5" />
              </div>
              <div>
                <p className={sectionLabel}>Reference Block</p>
                <h2 className={sectionTitle}>Active database: {selectedDb}</h2>
              </div>
            </div>
            <p className="text-sm leading-6 text-[#475467]">
              Keep the schema visible while you translate. Seeing tables and sample rows makes the RA-to-SQL mapping much easier to reason about.
            </p>
            <Collapsible title={`Browse tables in ${selectedDb}`}>
              <div className="space-y-0.5">
                {selectedDbInfo.tables.map((tableName) => (
                  <TablePreview key={tableName} tableName={tableName} metadata={schemaMap[tableName]} />
                ))}
              </div>
            </Collapsible>
          </div>

          <div className={`${blockCard} space-y-4`}>
            <div className="space-y-2">
              <p className={sectionLabel}>Practice Mode</p>
              <h2 className={sectionTitle}>Choose how you want to work</h2>
              <p className="text-sm leading-6 text-[#475467]">
                Use pre-defined queries for guided RA/SQL translation practice, or switch to user-defined mode to draft your own notes against the same schema.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-[22px] border border-[#e4e7f2] bg-[rgba(255,255,255,0.86)] p-5 shadow-[0_8px_20px_rgba(123,128,173,0.06)]">
                <div className="flex items-center gap-3">
                  <div className="app-icon-tile flex h-10 w-10 items-center justify-center rounded-[14px]">
                    <LayoutList className="app-icon-glyph h-4 w-4" />
                  </div>
                  <h3 className="font-semibold text-[#3f4761]">Pre-defined Queries</h3>
                </div>
                <p className="mt-3 text-sm leading-6 text-[#475467]">
                  Work from existing catalog solutions and focus on translating between relational algebra, trace output, and SQL clauses.
                </p>
                {queries.length > 0 ? (
                  <button
                    onClick={() => setMode('catalog')}
                    className={`mt-4 ${mode === 'catalog' ? secondaryButton : primaryButton}`}
                  >
                    Practice Pre-defined Queries
                  </button>
                ) : (
                  <p className="mt-4 text-sm italic text-[#667085]">This database does not have a reference catalog yet.</p>
                )}
              </div>
              <div className="rounded-[22px] border border-[#e4e7f2] bg-[rgba(255,255,255,0.86)] p-5 shadow-[0_8px_20px_rgba(123,128,173,0.06)]">
                <div className="flex items-center gap-3">
                  <div className="app-icon-tile-soft flex h-10 w-10 items-center justify-center rounded-[14px]">
                    <Pencil className="app-icon-glyph-soft h-4 w-4" />
                  </div>
                  <h3 className="font-semibold text-[#3f4761]">User-defined Queries</h3>
                </div>
                <p className="mt-3 text-sm leading-6 text-[#475467]">
                  Draft your own relational algebra and SQL side by side while keeping mapping reminders in view.
                </p>
                <button
                  onClick={() => setMode('custom')}
                  className={`mt-4 ${mode === 'custom' ? secondaryButton : primaryButton}`}
                >
                  Practice User-defined Queries
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {!selectedDb ? (
        <StatusBadge variant="info">Select a database from the study setup block to continue.</StatusBadge>
      ) : null}

      {selectedDb && mode === 'catalog' && (
        <section className={`${blockCard} space-y-5`}>
          <div className="flex items-center gap-3">
            <div className="app-icon-tile flex h-11 w-11 items-center justify-center rounded-[16px] shadow-[0_4px_0_0_rgba(203,234,227,0.9)]">
              <BookOpen className="app-icon-glyph h-5 w-5" />
            </div>
            <div>
              <p className={sectionLabel}>Pre-defined Practice</p>
              <h2 className={sectionTitle}>Three-Column Translation Workspace</h2>
            </div>
          </div>

          {queries.length === 0 ? (
            <StatusBadge variant="info">This database does not have any cataloged reference queries yet.</StatusBadge>
          ) : (
            <>
              <div className={`${blockCardSoft} grid gap-4 lg:grid-cols-[1.2fr_0.8fr]`}>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-[#344054]">Choose a query from the catalog</label>
                  <select
                    value={selectedQueryId}
                    onChange={(e) => setSelectedQueryId(e.target.value)}
                    className="app-input w-full rounded-2xl bg-white px-4 py-3 text-sm cursor-pointer"
                  >
                    <option value="">- Select a query -</option>
                    {queries.map((query) => (
                      <option key={query.id} value={query.id}>
                        {query.prompt}
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
                      className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${practiceDirection === 'ra-to-sql' ? 'border-[#87d7c8] bg-[linear-gradient(135deg,#8ddfd2_0%,#8ee0a2_100%)] text-[#214c45]' : 'border-[#dfe2f0] bg-white text-[#475467]'}`}
                    >
                      RA → SQL
                    </button>
                    <button
                      type="button"
                      onClick={() => setPracticeDirection('sql-to-ra')}
                      className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${practiceDirection === 'sql-to-ra' ? 'border-[#87d7c8] bg-[linear-gradient(135deg,#8ddfd2_0%,#8ee0a2_100%)] text-[#214c45]' : 'border-[#dfe2f0] bg-white text-[#475467]'}`}
                    >
                      SQL → RA
                    </button>
                  </div>
                </div>
              </div>

              {!queryDetail ? (
                <StatusBadge variant="info">Pick a catalog query to open the three-column workspace.</StatusBadge>
              ) : (
                <div className="space-y-4">
                  <div className={`${blockCardSoft} space-y-2`}>
                    <p className="text-base text-[#344054]">{queryDetail.prompt}</p>
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
                            Use the solved RA expression as the source representation, then translate it into SQL on the right.
                          </p>
                          <pre className="app-code overflow-x-auto p-4 text-sm text-[#344054]">
                            {formatRaExpression(queryDetail.solution?.relational_algebra)}
                          </pre>
                          <div className="space-y-4">
                            <div>
                              <p className="mb-2 text-sm font-semibold text-[#344054]">Output preview</p>
                              <p className="mb-3 text-sm text-[#475467]">Rows returned: {traceResult?.row_count ?? '—'}</p>
                              {traceLoading ? (
                                <p className="text-sm italic text-[#667085]">Loading output preview...</p>
                              ) : traceResult?.rows.length ? (
                                <DataTable rows={traceResult.rows} compact maxHeight="15rem" />
                              ) : (
                                <p className="text-sm italic text-[#667085]">No rows returned.</p>
                              )}
                            </div>
                            {activeQueryRows ? (
                              <div>
                                <p className="mb-2 text-sm font-semibold text-[#344054]">Expected result</p>
                                {activeQueryRows.length > 0 ? <DataTable rows={activeQueryRows} compact maxHeight="15rem" /> : <p className="text-sm italic text-[#667085]">Expected result returns no rows.</p>}
                              </div>
                            ) : null}
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-sm leading-6 text-[#475467]">
                            Use the SQL statement as the source representation, then translate it into relational algebra on the right.
                          </p>
                          <pre className="app-code overflow-x-auto p-4 text-sm text-[#344054]">
                            {formatSqlForDisplay(queryDetail.solution?.sql)}
                          </pre>
                          <div className="space-y-4">
                            <div>
                              <p className="mb-2 text-sm font-semibold text-[#344054]">Output preview</p>
                              <p className="mb-3 text-sm text-[#475467]">Rows returned: {traceResult?.row_count ?? '—'}</p>
                              {traceLoading ? (
                                <p className="text-sm italic text-[#667085]">Loading output preview...</p>
                              ) : traceResult?.rows.length ? (
                                <DataTable rows={traceResult.rows} compact maxHeight="15rem" />
                              ) : (
                                <p className="text-sm italic text-[#667085]">No rows returned.</p>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    <div className={`${blockCardSoft} min-w-0 space-y-4`}>
                      <div className="flex items-center gap-2">
                        <Pencil className="h-4 w-4 text-[#615a96]" />
                        <h3 className="text-base font-semibold text-[#3f4761]">
                          {practiceDirection === 'ra-to-sql' ? 'Equivalent SQL' : 'Relational Algebra Skeleton'}
                        </h3>
                      </div>

                      {practiceDirection === 'ra-to-sql' ? (
                        <>
                          <p className="text-sm leading-6 text-[#475467]">
                            Complete the SQL one clause at a time. Each box corresponds to a piece of the canonical SQL solution from the query catalog.
                          </p>
                          <div className="space-y-3">
                            {sqlClauseGroups.map((group) => {
                              const isOperatorOnly = group.id === 'set_operator';

                              return (
                                <div key={group.id} className="rounded-[18px] border border-[#d7deef] bg-white/85 p-3.5">
                                  <p className="text-sm font-semibold text-[#344054]">{group.title}</p>

                                  <div className={`mt-2.5 space-y-2 ${isOperatorOnly ? '' : 'rounded-2xl border border-[#d7deef] bg-white p-3'}`}>
                                    {group.clauses.map((clause) => {
                                      const userValue = sqlClauseAnswers[clause.id] ?? '';
                                      const clauseCorrect = clauseMatchesCatalogClause(clause, userValue);
                                      const clauseAnswered = userValue.trim().length > 0;
                                      return (
                                        <div key={clause.id} className="flex items-start gap-2.5">
                                          <span className="min-w-[88px] rounded-xl border border-[#cbeae3] bg-[#f3fbf8] px-2.5 py-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3d6f67]">
                                            {clause.keyword}
                                          </span>
                                          <div className="flex flex-1 items-start gap-2">
                                            <textarea
                                              value={userValue}
                                              onChange={(e) => updateSqlClauseAnswer(clause.id, e.target.value)}
                                              placeholder={clause.keyword === 'SQL' ? 'Write SQL here' : 'Fill in'}
                                              className={`min-h-[54px] flex-1 resize-y rounded-2xl border border-[#d7deef] bg-white px-3 py-2 font-mono text-sm leading-6 text-[#344054] focus:border-[#74c8b8] focus:outline-none focus:ring-4 focus:ring-[#d9f3ee] ${isOperatorOnly ? '' : 'border-[#e4e7f2]'}`}
                                            />
                                            {sqlChecked ? (
                                              <span className={`mt-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${clauseCorrect ? 'bg-[#e8faf4] text-[#166534]' : clauseAnswered ? 'bg-[#fff1f2] text-[#be123c]' : 'bg-[#f4f5f7] text-[#667085]'}`}>
                                                {clauseCorrect ? <Check className="h-4 w-4" /> : clauseAnswered ? <X className="h-4 w-4" /> : null}
                                              </span>
                                            ) : null}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {revealSqlAnswers ? (
                                    <div className="mt-2.5 rounded-2xl border border-[#ead7b8] bg-[#fffaf1] px-3 py-2">
                                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7c5433]">Expected</p>
                                      <div className="mt-1 space-y-1 font-mono text-xs text-[#5c3b1f]">
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

                          <div className="flex flex-wrap gap-3">
                            <button type="button" onClick={() => setSqlChecked(true)} className={primaryButton}>
                              Check SQL Answer
                            </button>
                            <button type="button" onClick={() => setRevealSqlAnswers((value) => !value)} className={secondaryButton}>
                              {revealSqlAnswers ? 'Hide Expected SQL' : 'Reveal Expected SQL'}
                            </button>
                          </div>
                          <p className="text-xs leading-5 text-[#667085]">
                            Clause checkmarks reflect match against the catalog clause only.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm leading-6 text-[#475467]">
                            Fill in the relational algebra expression that matches the SQL statement on the left, then check it against the catalog answer.
                          </p>
                          <div className="rounded-[18px] border border-[#d7deef] bg-white/85 p-3.5">
                            <div className="flex items-start gap-2.5">
                              <span className="min-w-[88px] rounded-xl border border-[#cbeae3] bg-[#f3fbf8] px-2.5 py-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3d6f67]">
                                RA
                              </span>
                              <div className="flex flex-1 items-start gap-2">
                                <textarea
                                  ref={raInputRef}
                                  value={studentRa}
                                  onChange={(e) => updateStudentRa(e.target.value)}
                                  placeholder="π{_____}(σ{_____}(relation))"
                                  className="min-h-[72px] flex-1 resize-y rounded-2xl border border-[#d7deef] bg-white px-3 py-2 font-mono text-sm leading-6 text-[#344054] focus:border-[#74c8b8] focus:outline-none focus:ring-4 focus:ring-[#d9f3ee]"
                                />
                                {raChecked ? (
                                  <span className={`mt-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                                    raCheckLoading
                                      ? 'bg-[#f4f5f7] text-[#667085]'
                                      : raMatchesSolution
                                      ? 'bg-[#e8faf4] text-[#166534]'
                                      : studentRa.trim()
                                        ? 'bg-[#fff1f2] text-[#be123c]'
                                        : 'bg-[#f4f5f7] text-[#667085]'
                                  }`}>
                                    {raCheckLoading
                                      ? null
                                      : raMatchesSolution
                                      ? <Check className="h-4 w-4" />
                                      : studentRa.trim()
                                        ? <X className="h-4 w-4" />
                                        : null}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            {revealRaAnswer ? (
                              <div className="mt-2.5 rounded-2xl border border-[#ead7b8] bg-[#fffaf1] px-3 py-2">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7c5433]">Expected</p>
                                <p className="mt-1 font-mono text-xs text-[#5c3b1f]">
                                  {formatRaExpression(queryDetail.solution?.relational_algebra)}
                                </p>
                              </div>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap gap-3">
                            <button type="button" onClick={() => { void checkRaAnswer(); }} className={primaryButton} disabled={raCheckLoading}>
                              {raCheckLoading ? 'Checking RA...' : 'Check RA Answer'}
                            </button>
                            <button type="button" onClick={() => setRevealRaAnswer((value) => !value)} className={secondaryButton}>
                              {revealRaAnswer ? 'Hide Expected RA' : 'Reveal Expected RA'}
                            </button>
                          </div>
                        </>
                      )}

                      {practiceDirection === 'sql-to-ra' && raCheckError ? (
                        <StatusBadge variant="error">{raCheckError}</StatusBadge>
                      ) : null}

                      {practiceDirection === 'sql-to-ra' && raCheckResult ? (
                        <StatusBadge variant={raCheckResult.is_correct ? 'success' : 'warning'}>
                          {raCheckResult.is_correct
                            ? 'Correct answer: your relational algebra expression returns the same relation as the SQL query.'
                            : 'Incorrect answer on the current dataset: the relational algebra result differs from the SQL query result.'}
                        </StatusBadge>
                      ) : null}

                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {selectedDb && mode === 'custom' && (
        <section className={`${blockCard} space-y-5`}>
          <div className="flex items-center gap-3">
            <div className="app-icon-tile flex h-11 w-11 items-center justify-center rounded-[16px] shadow-[0_4px_0_0_rgba(203,234,227,0.9)]">
              <Pencil className="app-icon-glyph h-5 w-5" />
            </div>
            <div>
              <p className={sectionLabel}>Translation Workspace</p>
              <h2 className={sectionTitle}>User-defined Query Notes</h2>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className={`${blockCardSoft} space-y-3`}>
              <label className="text-sm font-semibold text-[#344054]">Relational algebra draft</label>
              <textarea
                value={customRa}
                onChange={(e) => setCustomRa(e.target.value)}
                placeholder="π{name}(σ{dept_name = 'Comp. Sci.'}(student))"
                className="h-44 w-full resize-y rounded-2xl border border-[#d7deef] bg-white px-4 py-3 font-mono text-sm text-[#344054] focus:border-[#74c8b8] focus:outline-none focus:ring-4 focus:ring-[#d9f3ee]"
              />
            </div>

            <div className={`${blockCardSoft} space-y-3`}>
              <label className="text-sm font-semibold text-[#344054]">SQL draft</label>
              <textarea
                value={customSql}
                onChange={(e) => setCustomSql(e.target.value)}
                placeholder="SELECT name FROM student WHERE dept_name = 'Comp. Sci.';"
                className="h-44 w-full resize-y rounded-2xl border border-[#d7deef] bg-white px-4 py-3 font-mono text-sm text-[#344054] focus:border-[#74c8b8] focus:outline-none focus:ring-4 focus:ring-[#d9f3ee]"
              />
            </div>
          </div>
        </section>
      )}

      <div className={blockCard}>
        <Collapsible title="Translation Tips">
          <div className="space-y-1.5 text-sm text-[#475467]">
            <p className="flex items-start gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#74c8b8]" /> <span><strong className="text-[#344054]">Start with structure:</strong> Outline the relational algebra operators required, then identify their SQL counterparts.</span></p>
            <p className="flex items-start gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#74c8b8]" /> <span><strong className="text-[#344054]">Selection ↔ WHERE:</strong> Translate selections (σ) into WHERE clauses.</span></p>
            <p className="flex items-start gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#74c8b8]" /> <span><strong className="text-[#344054]">Projection ↔ SELECT:</strong> Projections (π) map to SELECT column lists.</span></p>
            <p className="flex items-start gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#74c8b8]" /> <span><strong className="text-[#344054]">Joins:</strong> Natural joins or specific join conditions translate to explicit JOIN ... ON ... clauses.</span></p>
            <p className="flex items-start gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#74c8b8]" /> <span><strong className="text-[#344054]">Set operations:</strong> Union, difference, and intersection correspond to UNION, EXCEPT, and INTERSECT.</span></p>
          </div>
        </Collapsible>
      </div>
    </div>
  );
}
