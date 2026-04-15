import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ApiError, api, type Database, type EvaluationResult, type Query, type TableInfo, type TranslationCheckResult } from '../lib/api';
import StatusBadge from '../components/StatusBadge';
import Collapsible from '../components/Collapsible';
import DataTable from '../components/DataTable';
import TablePreview from '../components/TablePreview';
import { sortQueries } from '../lib/difficulty';
import { translateRaToSql, translateSqlToRa, TranslationError } from '../lib/raSqlTranslation';
import {
  BookOpen,
  Check,
  Database as DatabaseIcon,
  Filter,
  LayoutList,
  Pencil,
  X,
} from 'lucide-react';

type WorkspaceMode = 'catalog' | 'custom' | null;
type PracticeDirection = 'ra-to-sql' | 'sql-to-ra';
type CustomEditedSide = 'ra' | 'sql' | null;

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
  const databaseSelectId = useId();
  const querySelectId = useId();
  const customRaTextareaId = useId();
  const customSqlTextareaId = useId();
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
  const [selectedOps, setSelectedOps] = useState<Set<string>>(new Set());
  const [studentRa, setStudentRa] = useState('');
  const [customRa, setCustomRa] = useState('');
  const [customSql, setCustomSql] = useState('');
  const [customEditedSide, setCustomEditedSide] = useState<CustomEditedSide>(null);
  const [customTranslationError, setCustomTranslationError] = useState<string | null>(null);
  const [customTranslationWarning, setCustomTranslationWarning] = useState<string | null>(null);
  const [customRaResult, setCustomRaResult] = useState<EvaluationResult | null>(null);
  const [customRaLoading, setCustomRaLoading] = useState(false);
  const [customRaError, setCustomRaError] = useState<string | null>(null);
  const [customSqlResult, setCustomSqlResult] = useState<EvaluationResult | null>(null);
  const [customSqlLoading, setCustomSqlLoading] = useState(false);
  const [customSqlError, setCustomSqlError] = useState<string | null>(null);
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
    setSelectedOps(new Set());
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
    setCustomRa('');
    setCustomSql('');
    setCustomEditedSide(null);
    setCustomTranslationError(null);
    setCustomTranslationWarning(null);
    setCustomRaResult(null);
    setCustomRaLoading(false);
    setCustomRaError(null);
    setCustomSqlResult(null);
    setCustomSqlLoading(false);
    setCustomSqlError(null);
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
    if (!selectedQueryId) return;
    if (filteredQueries.some((query) => query.id === selectedQueryId)) return;
    setSelectedQueryId('');
  }, [filteredQueries, selectedQueryId]);

  useEffect(() => {
    if (customEditedSide !== 'ra') return;
    if (!customRa.trim()) {
      setCustomSql('');
      setCustomTranslationError(null);
      setCustomTranslationWarning(null);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      try {
        const result = translateRaToSql(customRa, translatorSchema);
        setCustomSql(result.translated);
        setCustomTranslationError(null);
        setCustomTranslationWarning(result.warning ?? null);
      } catch (error) {
        setCustomTranslationWarning(null);
        setCustomTranslationError(
          error instanceof TranslationError || error instanceof Error
            ? error.message
            : 'Unable to translate the relational algebra expression.',
        );
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [customEditedSide, customRa, translatorSchema]);

  useEffect(() => {
    if (customEditedSide !== 'sql') return;
    if (!customSql.trim()) {
      setCustomRa('');
      setCustomTranslationError(null);
      setCustomTranslationWarning(null);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      try {
        const result = translateSqlToRa(customSql);
        setCustomRa(result.translated);
        setCustomTranslationError(null);
        setCustomTranslationWarning(result.warning ?? null);
      } catch (error) {
        setCustomTranslationWarning(null);
        setCustomTranslationError(
          error instanceof TranslationError || error instanceof Error
            ? error.message
            : 'Unable to translate the SQL statement.',
        );
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [customEditedSide, customSql]);

  useEffect(() => {
    if (!selectedDb) return;
    if (!customRa.trim()) {
      setCustomRaResult(null);
      setCustomRaLoading(false);
      setCustomRaError(null);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setCustomRaLoading(true);
      setCustomRaError(null);
      api.evaluateCustomQuery(selectedDb, customRa.trim())
        .then((result) => {
          if (cancelled) return;
          setCustomRaResult(result);
        })
        .catch((error) => {
          if (cancelled) return;
          setCustomRaResult(null);
          setCustomRaError(formatCheckError(error));
        })
        .finally(() => {
          if (cancelled) return;
          setCustomRaLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [selectedDb, customRa]);

  useEffect(() => {
    if (!selectedDb) return;
    if (!customSql.trim()) {
      setCustomSqlResult(null);
      setCustomSqlLoading(false);
      setCustomSqlError(null);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setCustomSqlLoading(true);
      setCustomSqlError(null);
      api.evaluateCustomSqlQuery(selectedDb, customSql.trim())
        .then((result) => {
          if (cancelled) return;
          setCustomSqlResult(result);
        })
        .catch((error) => {
          if (cancelled) return;
          setCustomSqlResult(null);
          setCustomSqlError(formatCheckError(error));
        })
        .finally(() => {
          if (cancelled) return;
          setCustomSqlLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [selectedDb, customSql]);

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
      if (raCheckRequestIdRef.current === requestId) {
        setRaCheckLoading(false);
      }
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
            <h1 className="text-3xl font-semibold tracking-tight text-[#3f4761] sm:text-4xl">RA ↔ SQL Translation</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#475467] sm:text-base">
              Translate between relational algebra and SQL with catalog exercises, live custom translation, and result previews against the selected database.
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
                <p className={sectionLabel}>Schema Panel</p>
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
                Use catalog prompts for guided translation practice, or switch to the custom translator to work with your own expressions and statements.
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
                  Use a catalog prompt as the source, inspect its output, and translate it into the target notation.
                </p>
                {queries.length > 0 ? (
                  <button
                    onClick={() => setMode('catalog')}
                    className={`mt-4 ${mode === 'catalog' ? secondaryButton : primaryButton}`}
                  >
                    Open Catalog Translation
                  </button>
                ) : (
                  <p className="mt-4 text-sm italic text-[#667085]">This database does not have a translation catalog yet.</p>
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
                  Type RA or SQL directly, let the page translate it, and preview the result on both sides.
                </p>
                <button
                  onClick={() => setMode('custom')}
                  className={`mt-4 ${mode === 'custom' ? secondaryButton : primaryButton}`}
                >
                  Open Custom Translator
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {selectedDb && mode === 'catalog' && (
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
                <div>
                  <div className="flex items-center gap-3">
                    <Filter className="h-4 w-4 text-[#615a96]" />
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-[#3d6f67]">Operator filters</h3>
                      <p className="mt-1 text-sm text-[#475467]">Filter the catalog by the relational algebra operators used in each prompt.</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {OPERATOR_OPTIONS.map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleOp(key)}
                        aria-pressed={selectedOps.has(key)}
                        className={`rounded-2xl border-2 px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                          selectedOps.has(key)
                            ? 'border-[#87d7c8] bg-[linear-gradient(135deg,#8ddfd2_0%,#8ee0a2_100%)] text-[#214c45]'
                            : 'border-[#cbeae3] bg-[#f7fcfa] text-[#3d6f67] hover:bg-[#edf8f6]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="space-y-2">
                  <label htmlFor={querySelectId} className="block text-sm font-semibold text-[#344054]">Choose a prompt from the catalog</label>
                  <select
                    id={querySelectId}
                    value={selectedQueryId}
                    onChange={(e) => setSelectedQueryId(e.target.value)}
                    className="app-input w-full rounded-2xl bg-white px-4 py-3 text-sm cursor-pointer"
                  >
                    <option value="">- Select a query -</option>
                    {filteredQueries.map((query) => (
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
                            Use the canonical RA expression as the source, then write the equivalent SQL on the right.
                          </p>
                          <pre className="app-code overflow-x-auto p-4 text-sm text-[#344054]">
                            {formatRaExpression(queryDetail.solution?.relational_algebra)}
                          </pre>
                          <div className="space-y-4">
                            <div>
                              <p className="mb-2 text-sm font-semibold text-[#344054]">Result preview</p>
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
                            Use the canonical SQL statement as the source, then write the equivalent relational algebra on the right.
                          </p>
                          <pre className="app-code overflow-x-auto p-4 text-sm text-[#344054]">
                            {formatSqlForDisplay(queryDetail.solution?.sql)}
                          </pre>
                          <div className="space-y-4">
                            <div>
                              <p className="mb-2 text-sm font-semibold text-[#344054]">Result preview</p>
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
                          {practiceDirection === 'ra-to-sql' ? 'Your SQL answer' : 'Your RA answer'}
                        </h3>
                      </div>

                      {practiceDirection === 'ra-to-sql' ? (
                        <>
                          <p className="text-sm leading-6 text-[#475467]">
                            Complete the SQL answer one clause at a time. Each box maps to one part of the canonical SQL solution.
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
                                              aria-label={clause.label}
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
                              Check SQL
                            </button>
                            <button type="button" onClick={() => setRevealSqlAnswers((value) => !value)} className={secondaryButton}>
                              {revealSqlAnswers ? 'Hide Canonical SQL' : 'Show Canonical SQL'}
                            </button>
                          </div>
                          <p className="text-xs leading-5 text-[#667085]">
                            Clause checkmarks reflect match against the catalog clause only.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm leading-6 text-[#475467]">
                            Write the relational algebra expression that matches the SQL statement on the left, then compare it with the canonical answer.
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
                                  aria-label="Relational algebra answer"
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
                              {raCheckLoading ? 'Checking RA...' : 'Check RA'}
                            </button>
                            <button type="button" onClick={() => setRevealRaAnswer((value) => !value)} className={secondaryButton}>
                              {revealRaAnswer ? 'Hide Canonical RA' : 'Show Canonical RA'}
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
                            ? 'Correct: your relational algebra expression returns the same relation as the SQL statement.'
                            : 'Not equivalent on the current dataset: your relational algebra result differs from the SQL statement.'}
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
              <h2 className={sectionTitle}>User-defined Query Translator</h2>
            </div>
          </div>

          <p className="text-sm leading-6 text-[#475467]">
            Edit either side and the page will translate it into the other notation automatically after a short pause.
          </p>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className={`${blockCardSoft} space-y-3`}>
              <label htmlFor={customRaTextareaId} className="text-sm font-semibold text-[#344054]">Relational algebra</label>
              <textarea
                id={customRaTextareaId}
                value={customRa}
                onChange={(e) => {
                  setCustomEditedSide('ra');
                  setCustomTranslationError(null);
                  setCustomTranslationWarning(null);
                  setCustomRa(e.target.value);
                }}
                placeholder="π{name}(σ{dept_name = 'Comp. Sci.'}(student))"
                className="h-44 w-full resize-y rounded-2xl border border-[#d7deef] bg-white px-4 py-3 font-mono text-sm text-[#344054] focus:border-[#74c8b8] focus:outline-none focus:ring-4 focus:ring-[#d9f3ee]"
              />
              <p className="text-xs leading-5 text-[#667085]">
                Supported RA operators here: projection, selection, rename, join, product, union, difference, and intersection.
              </p>

              <div className="rounded-[18px] border border-[#d7deef] bg-white/85 p-3.5">
                <p className="text-sm font-semibold text-[#344054]">Result preview</p>
                <p className="mt-1 text-xs text-[#667085]">
                  {customRaResult ? `Rows returned: ${customRaResult.row_count}` : 'This RA expression is evaluated against the selected database.'}
                </p>
                <div className="mt-3">
                  {customRaLoading ? (
                    <p className="text-sm italic text-[#667085]">Evaluating the RA expression...</p>
                  ) : customRaError ? (
                    <StatusBadge variant="warning">{customRaError}</StatusBadge>
                  ) : customRaResult ? (
                    customRaResult.rows.length ? (
                      <DataTable rows={customRaResult.rows} columns={customRaResult.schema_eval} compact maxHeight="15rem" />
                    ) : (
                      <p className="text-sm italic text-[#667085]">No rows returned.</p>
                    )
                  ) : (
                    <p className="text-sm italic text-[#667085]">Enter a relational algebra expression to preview its result.</p>
                  )}
                </div>
              </div>
            </div>

            <div className={`${blockCardSoft} space-y-3`}>
              <label htmlFor={customSqlTextareaId} className="text-sm font-semibold text-[#344054]">SQL</label>
              <textarea
                id={customSqlTextareaId}
                value={customSql}
                onChange={(e) => {
                  setCustomEditedSide('sql');
                  setCustomTranslationError(null);
                  setCustomTranslationWarning(null);
                  setCustomSql(e.target.value);
                }}
                placeholder="SELECT name FROM student WHERE dept_name = 'Comp. Sci.';"
                className="h-44 w-full resize-y rounded-2xl border border-[#d7deef] bg-white px-4 py-3 font-mono text-sm text-[#344054] focus:border-[#74c8b8] focus:outline-none focus:ring-4 focus:ring-[#d9f3ee]"
              />
              <p className="text-xs leading-5 text-[#667085]">
                Best-supported SQL shape: <code>SELECT ... FROM ... JOIN ... WHERE ...</code>, plus <code>UNION</code>, <code>EXCEPT</code>, and <code>INTERSECT</code>.
              </p>

              <div className="rounded-[18px] border border-[#d7deef] bg-white/85 p-3.5">
                <p className="text-sm font-semibold text-[#344054]">Result preview</p>
                <p className="mt-1 text-xs text-[#667085]">
                  {customSqlResult ? `Rows returned: ${customSqlResult.row_count}` : 'This SQL statement is evaluated against the selected database.'}
                </p>
                <div className="mt-3">
                  {customSqlLoading ? (
                    <p className="text-sm italic text-[#667085]">Evaluating SQL...</p>
                  ) : customSqlError ? (
                    <StatusBadge variant="warning">{customSqlError}</StatusBadge>
                  ) : customSqlResult ? (
                    customSqlResult.rows.length ? (
                      <DataTable rows={customSqlResult.rows} columns={customSqlResult.schema_eval} compact maxHeight="15rem" />
                    ) : (
                      <p className="text-sm italic text-[#667085]">No rows returned.</p>
                    )
                  ) : (
                    <p className="text-sm italic text-[#667085]">Enter a SQL statement to preview its result.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {customTranslationError ? (
            <StatusBadge variant="warning">{customTranslationError}</StatusBadge>
          ) : null}

          {!customTranslationError && customTranslationWarning ? (
            <StatusBadge variant="info">{customTranslationWarning}</StatusBadge>
          ) : null}
        </section>
      )}

      {selectedDb ? (
        <div className={blockCard}>
          <Collapsible title="Translation Tips">
            <div className="space-y-1.5 text-sm text-[#475467]">
              <p className="flex items-start gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#74c8b8]" /> <span><strong className="text-[#344054]">Start with structure:</strong> Outline the relational algebra operators required, then identify their SQL counterparts.</span></p>
              <p className="flex items-start gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#74c8b8]" /> <span><strong className="text-[#344054]">Selection ↔ WHERE:</strong> Translate selections (σ) into WHERE clauses.</span></p>
              <p className="flex items-start gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#74c8b8]" /> <span><strong className="text-[#344054]">Projection ↔ SELECT DISTINCT:</strong> Projections (π) remove duplicates, so they map most closely to <code>SELECT DISTINCT</code> column lists.</span></p>
              <p className="flex items-start gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#74c8b8]" /> <span><strong className="text-[#344054]">Rename ↔ AS / ρ:</strong> Simple SQL aliases such as <code>id AS student_id</code> translate to relational renaming (ρ), and RA rename can translate back through SQL aliases.</span></p>
              <p className="flex items-start gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#74c8b8]" /> <span><strong className="text-[#344054]">Joins:</strong> Natural joins map to <code>NATURAL JOIN</code>, while theta joins map to <code>JOIN ... ON ...</code>.</span></p>
              <p className="flex items-start gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#74c8b8]" /> <span><strong className="text-[#344054]">Set operations:</strong> Union, difference, and intersection correspond to UNION, EXCEPT, and INTERSECT.</span></p>
            </div>
          </Collapsible>
        </div>
      ) : null}
    </div>
  );
}
