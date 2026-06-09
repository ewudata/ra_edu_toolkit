import { useEffect, useId, useState, type FormEvent } from 'react';
import { api, type Database, type Query, type EvaluationResult, type TableInfo } from '../lib/api';
import StatusBadge from '../components/StatusBadge';
import Collapsible from '../components/Collapsible';
import TablePreview from '../components/TablePreview';
import DataTable from '../components/DataTable';
import TraceViewer from '../components/TraceViewer';
import SyntaxHelp from '../components/SyntaxHelp';
import { sortQueries, difficultyIcon } from '../lib/difficulty';
import {
  Database as DatabaseIcon,
  LayoutList,
  Pencil,
  Play,
  Eye,
  Lightbulb,
  BarChart3,
  Filter,
  Rows3,
} from 'lucide-react';

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
  const hints = (query.hints ?? []).map((h) => h.toLowerCase()).join(' ');
  return [...ops].every((op) => {
    const aliases = OPERATOR_ALIASES[op] ?? new Set([op]);
    return [...aliases].some((alias) => hints.includes(alias));
  });
}

export default function RAExercises() {
  const databaseSelectId = useId();
  const querySelectId = useId();
  const solutionTextareaId = useId();
  const customExprTextareaId = useId();
  const [databases, setDatabases] = useState<Database[]>([]);
  const [selectedDb, setSelectedDb] = useState('');
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [queries, setQueries] = useState<Query[]>([]);
  const [queriesLoaded, setQueriesLoaded] = useState(false);
  const [masteredIds, setMasteredIds] = useState<Set<string>>(new Set());
  const [schemaMap, setSchemaMap] = useState<Record<string, TableInfo>>({});

  const [mode, setMode] = useState<'operators' | 'custom' | null>(null);
  const [selectedOps, setSelectedOps] = useState<Set<string>>(new Set());
  const [progressFilter, setProgressFilter] = useState<'unmastered' | 'all' | 'mastered'>('unmastered');

  const [selectedQueryId, setSelectedQueryId] = useState('');
  const [queryDetail, setQueryDetail] = useState<Query | null>(null);
  const [solution, setSolution] = useState('');
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [supportPanel, setSupportPanel] = useState<'hint' | 'trace' | 'solution' | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const [solutionResult, setSolutionResult] = useState<EvaluationResult | null>(null);
  const [expectedComparisonResult, setExpectedComparisonResult] = useState<EvaluationResult | null>(null);
  const [aiHint, setAiHint] = useState<string | null>(null);
  const [aiHintModel, setAiHintModel] = useState<string | null>(null);
  const [aiHintError, setAiHintError] = useState<string | null>(null);
  const [aiHintLoading, setAiHintLoading] = useState(false);

  const [customExpr, setCustomExpr] = useState('');
  const [customResult, setCustomResult] = useState<EvaluationResult | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);
  const [customExecuting, setCustomExecuting] = useState(false);

  useEffect(() => {
    api.healthCheck().then(() => setBackendOk(true)).catch(() => setBackendOk(false));
    api.getDatabases().then(setDatabases).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedDb) {
      setQueries([]);
      setQueriesLoaded(false);
      setMasteredIds(new Set());
      setSchemaMap({});
      setSelectedQueryId('');
      setQueryDetail(null);
      setResult(null);
      setResultError(null);
      setSupportPanel(null);
      setCustomResult(null);
      setCustomError(null);
      setShowSolution(false);
      setSolutionResult(null);
      setExpectedComparisonResult(null);
      setAiHint(null);
      setAiHintModel(null);
      setAiHintError(null);
    }
  }, [selectedDb]);

  useEffect(() => {
    if (!selectedDb) return;

    let cancelled = false;
    setQueriesLoaded(false);

    api.getQueries(selectedDb)
      .then((qs) => {
        if (cancelled) return;
        setQueries(sortQueries(qs));
      })
      .catch(() => {
        if (cancelled) return;
        setQueries([]);
      })
      .finally(() => {
        if (cancelled) return;
        setQueriesLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDb]);

  useEffect(() => {
    if (!selectedDb) return;

    let cancelled = false;

    api.getQueryMastery(selectedDb)
      .then((mastery) => {
        if (cancelled) return;
        setMasteredIds(new Set(mastery.query_ids.map(String)));
      })
      .catch(() => {
        if (cancelled) return;
        setMasteredIds(new Set());
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDb]);

  useEffect(() => {
    if (!selectedDb) return;

    let cancelled = false;

    api.getDatabaseSchema(selectedDb, 3)
      .then((schema) => {
        if (cancelled) return;
        setSchemaMap(Object.fromEntries(schema.tables.map((t) => [t.name, t])));
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
    if (!selectedQueryId || !selectedDb) { setQueryDetail(null); return; }
    api.getQueryDetail(selectedDb, selectedQueryId).then(setQueryDetail).catch(() => {});
    setResult(null);
    setResultError(null);
    setSupportPanel(null);
    setSolution('');
    setShowSolution(false);
    setSolutionResult(null);
    setExpectedComparisonResult(null);
    setSupportPanel(null);
    setAiHint(null);
    setAiHintModel(null);
    setAiHintError(null);
  }, [selectedQueryId, selectedDb]);

  const filteredQueries = (() => {
    let qs = queries;
    if (selectedOps.size > 0) qs = qs.filter((q) => queryMatchesOps(q, selectedOps));
    if (progressFilter === 'mastered') qs = qs.filter((q) => masteredIds.has(q.id));
    if (progressFilter === 'unmastered') qs = qs.filter((q) => !masteredIds.has(q.id));
    return qs;
  })();

  async function handleExecute(e: FormEvent) {
    e.preventDefault();
    if (!solution.trim() || !selectedQueryId) return;
    setExecuting(true);
    setResult(null);
    setResultError(null);
    setExpectedComparisonResult(null);
    setSupportPanel(null);
    setAiHint(null);
    setAiHintModel(null);
    setAiHintError(null);
    try {
      const res = await api.evaluateQuery(selectedDb, selectedQueryId, solution.trim());
      setResult(res);
      if (res.expected_rows == null && queryDetail?.solution?.relational_algebra) {
        const expectedRes = await api.evaluateCustomQuery(selectedDb, queryDetail.solution.relational_algebra);
        setExpectedComparisonResult(expectedRes);
      }
    } catch (err) {
      setResultError(String(err));
    } finally {
      setExecuting(false);
    }
  }

  async function handleCustomExecute(e: FormEvent) {
    e.preventDefault();
    if (!customExpr.trim()) return;
    setCustomExecuting(true);
    setCustomResult(null);
    setCustomError(null);
    try {
      const res = await api.evaluateCustomQuery(selectedDb, customExpr.trim());
      setCustomResult(res);
    } catch (err) {
      setCustomError(String(err));
    } finally {
      setCustomExecuting(false);
    }
  }

  async function handleGenerateHint() {
    if (!selectedQueryId || !queryDetail) return;
    setAiHintLoading(true);
    setAiHintError(null);
    try {
      const res = await api.generateHint(
        selectedDb,
        selectedQueryId,
        solution.trim() || undefined,
        resultError || undefined,
      );
      setAiHint(res.hint);
      setAiHintModel(res.model);
      setSupportPanel('hint');
    } catch (err) {
      setAiHint(null);
      setAiHintModel(null);
      setAiHintError(String(err));
    } finally {
      setAiHintLoading(false);
    }
  }

  async function handleViewSolution() {
    if (supportPanel === 'solution' && showSolution) {
      setShowSolution(false);
      setSolutionResult(null);
      setSupportPanel(null);
      return;
    }

    setShowSolution(true);
    setSupportPanel('solution');
    const expr = queryDetail?.solution?.relational_algebra;
    if (!expr) return;
    try {
      const res = await api.evaluateCustomQuery(selectedDb, expr);
      setSolutionResult(res);
    } catch { /* ignore */ }
  }

  function toggleOp(op: string) {
    setSelectedOps((prev) => {
      const next = new Set(prev);
      if (next.has(op)) next.delete(op); else next.add(op);
      return next;
    });
  }

  if (backendOk === false) {
    return <StatusBadge variant="error">Backend service connection failed</StatusBadge>;
  }

  const selectedDbInfo = databases.find((d) => d.name === selectedDb);
  const blockCard = 'rounded-[24px] border border-[#dfe2f0] bg-[rgba(255,255,255,0.82)] p-5 shadow-[0_12px_28px_rgba(123,128,173,0.08)]';
  const blockCardSoft = 'rounded-[20px] border border-[#e4e7f2] bg-[rgba(255,255,255,0.9)] p-5 shadow-[0_8px_22px_rgba(123,128,173,0.06)]';
  const sectionLabel = 'text-xs font-semibold uppercase tracking-[0.22em] text-[#615a96]';
  const sectionTitle = 'text-xl font-semibold text-[#3f4761]';
  const primaryButton = 'app-primary-btn disabled:opacity-50';
  const secondaryButton = 'app-secondary-btn';
  const resultHeader = 'mb-1 flex items-center gap-2 font-display text-base font-semibold text-[#6d4b31]';
  const expectedComparisonRows = result?.expected_rows ?? queryDetail?.expected_rows ?? expectedComparisonResult?.rows;
  const expectedComparisonSchema = result?.expected_schema ?? queryDetail?.expected_schema ?? expectedComparisonResult?.schema_eval;

  return (
    <div className="space-y-6 rounded-[28px] bg-[linear-gradient(180deg,rgba(246,245,253,0.72)_0%,rgba(244,246,252,0.84)_52%,rgba(247,250,249,0.9)_100%)] p-4 sm:p-6">
        <section className="rounded-[26px] border border-[#dde1f0] bg-[linear-gradient(135deg,#f5f4ff_0%,#eef2ff_52%,#eef7f4_100%)] p-6 text-[#3f4761] shadow-[0_14px_34px_rgba(123,128,173,0.1)]">
          <div className="space-y-3">
            <div className="space-y-3">
              <p className="text-sm font-bold uppercase tracking-[0.28em] text-[#615a96]">Academic Practice Studio</p>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-[#3f4761] sm:text-4xl">Relational Algebra Exercises</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#475467] sm:text-base">
                  Solve relational algebra prompts against a real dataset, then compare your result with the expected output and evaluation trace.
                </p>
              </div>
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
                Pick the database you want to practice against. Once selected, the page opens the schema, query catalog, and custom-expression tools for that database.
              </p>
            </div>
            <div className="rounded-[20px] border border-[#e4e7f2] bg-[rgba(255,255,255,0.82)] p-4 shadow-[0_8px_20px_rgba(123,128,173,0.06)]">
              <label htmlFor={databaseSelectId} className="mb-2 block text-sm font-semibold text-[#344054]">Database collection</label>
              <select
                id={databaseSelectId}
                value={selectedDb}
                onChange={(e) => { setSelectedDb(e.target.value); setMode(null); }}
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
          <section className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
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
                    {selectedDbInfo.tables.map((t) => (
                      <TablePreview key={t} tableName={t} metadata={schemaMap[t]} />
                    ))}
                  </div>
                </Collapsible>

                <div className="space-y-3 border-t border-[#e5e7eb] pt-4">
                  <p className={sectionLabel}>Practice Mode</p>
                  <div className="grid gap-2">
                    {queriesLoaded && queries.length > 0 && (
                      <button
                        onClick={() => setMode('operators')}
                        className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition-colors ${
                          mode === 'operators'
                            ? 'border-[#87d7c8] bg-[#f3fbf8] text-[#214c45]'
                            : 'border-[#e4e7f2] bg-white/78 text-[#3d6f67] hover:bg-[#f8fcfb]'
                        }`}
                      >
                        <LayoutList className="app-icon-glyph h-4 w-4" />
                        Catalog practice
                      </button>
                    )}
                    {!queriesLoaded && <p className="text-sm italic text-[#667085]">Loading query catalog...</p>}
                    {queriesLoaded && queries.length === 0 && (
                      <p className="text-sm leading-6 text-[#667085]">No catalog prompts are available for this user database.</p>
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
                      Custom evaluator
                      </button>
                  </div>
                </div>

                {mode === 'operators' && (
                  <div className="space-y-4 border-t border-[#e5e7eb] pt-4">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-[#3d6f67]">Operators</h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {OPERATOR_OPTIONS.map(([key, label]) => (
                          <button
                            type="button"
                            key={key}
                            onClick={() => toggleOp(key)}
                            aria-pressed={selectedOps.has(key)}
                            className={`rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                              selectedOps.has(key) ? 'border-[#87d7c8] bg-[#e7f7f2] text-[#214c45]' : 'border-[#d7eee7] bg-white/72 text-[#3d6f67] hover:bg-[#f8fcfb]'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-[#3d6f67]">Progress</h3>
                      <div className="mt-2 grid gap-2">
                        {(['unmastered', 'all', 'mastered'] as const).map((f) => (
                          <label key={f} className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#d7eee7] bg-white/72 px-2.5 py-2 text-sm font-medium text-[#3d6f67]">
                            <input type="radio" name="progress" checked={progressFilter === f} onChange={() => setProgressFilter(f)} className="accent-[#74c8b8]" />
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </aside>

              <div className="min-w-0 space-y-5">
                {!mode && (
                  <section className={`${blockCard} space-y-2`}>
                    <p className={sectionLabel}>Workspace</p>
                    <h2 className={sectionTitle}>Choose a practice mode</h2>
                    <p className="max-w-2xl text-sm leading-6 text-[#475467]">
                      Use the rail on the left to start catalog practice or evaluate a custom expression.
                    </p>
                  </section>
                )}

        {mode === 'operators' && (
          <section className={`${blockCard} space-y-4`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
              <div className="app-icon-tile flex h-10 w-10 items-center justify-center rounded-[14px]">
                <Filter className="app-icon-glyph h-5 w-5" />
              </div>
              <div>
                <p className={sectionLabel}>Catalog Practice</p>
                <h2 className={sectionTitle}>Pre-defined Queries</h2>
              </div>
            </div>
              <div className="rounded-full border border-[#d7eee7] bg-white/76 px-3 py-1 text-xs font-semibold text-[#3d6f67]">
                {filteredQueries.length} matching prompts
              </div>
            </div>

            {filteredQueries.length === 0 ? (
              <StatusBadge variant="info">No queries match the selected filters. Try another operator, switch progress, or clear the filter.</StatusBadge>
            ) : (
              <>
                <div className={`${blockCardSoft} space-y-3`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <label htmlFor={querySelectId} className="block text-sm font-semibold text-[#3d6f67]">Choose a prompt from the filtered list</label>
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
                    {filteredQueries.map((q) => {
                      const mastered = masteredIds.has(q.id);
                      const prompt = (q.prompt ?? '').length > 80 ? q.prompt!.slice(0, 77) + '...' : q.prompt;
                      return <option key={q.id} value={q.id}>{mastered ? '✓ ' : ''}{difficultyIcon(q.difficulty)} {prompt}</option>;
                    })}
                  </select>
                </div>

                {queryDetail && (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-[minmax(240px,0.75fr)_minmax(0,1.25fr)]">
                      <div className="rounded-[24px] border border-[#d8c39a] bg-[#fff8eb] p-5 shadow-[0_8px_18px_rgba(151,103,59,0.08)]">
                        <div className="space-y-2">
                          <p className="text-sm text-[#6d4b31]"><span className="font-semibold text-[#5c3b1f]">Prompt:</span> {queryDetail.prompt}</p>
                          {queryDetail.hints?.length ? (
                            <p className="text-sm text-[#6d4b31]"><span className="font-semibold text-[#5c3b1f]">Hint:</span> {queryDetail.hints.join(', ')}</p>
                          ) : null}
                        </div>
                      </div>

                      <form onSubmit={handleExecute} className={`${blockCardSoft} space-y-3`}>
                        <h3 className="flex items-center gap-2 text-base font-semibold text-[#3f4761]">
                          <Pencil className="app-icon-glyph h-4 w-4" />
                          Your expression
                        </h3>
                        <label htmlFor={solutionTextareaId} className="text-sm font-medium text-[#3d6f67]">Write the relational algebra expression that answers this prompt:</label>
                        <textarea
                          id={solutionTextareaId}
                          value={solution}
                          onChange={(e) => {
                            setSolution(e.target.value);
                            setResult(null);
                            setExpectedComparisonResult(null);
                            setAiHintError(null);
                            setSupportPanel(null);
                          }}
                          className="h-28 w-full resize-y rounded-2xl border-2 border-[#d8b485] bg-white px-4 py-3 font-mono text-sm text-[#5c3b1f] transition-colors focus:border-[#d97745] focus:outline-none focus:ring-4 focus:ring-[#f7c8a5]"
                        />
                        <div className="flex justify-center">
                          <button type="submit" disabled={executing} className={primaryButton}>
                            <Play className="w-4 h-4" />
                            {executing ? 'Evaluating...' : 'Evaluate Expression'}
                          </button>
                        </div>
                        {resultError && (
                          <StatusBadge variant="error">Could not evaluate your expression: {resultError}</StatusBadge>
                        )}
                      </form>
                    </div>

                    <Collapsible title="RA syntax help" quiet>
                      <SyntaxHelp database={selectedDb} />
                    </Collapsible>

                    {result && (
                      <div className={`${blockCardSoft} space-y-6`}>
                        <h3 className="flex items-center gap-2 text-base font-semibold text-[#5c3b1f]">
                          <BarChart3 className="app-icon-glyph h-4 w-4" />
                          Result comparison
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="rounded-[22px] border-2 border-[#e1c8aa] bg-[#fffaf1] p-4 space-y-2">
                            <h4 className="font-semibold text-[#6d4b31] text-sm">Your result</h4>
                            <p className="text-sm text-[#8b6a50]">Rows returned: {result.row_count}</p>
                            {result.rows.length > 0 ? <DataTable rows={result.rows} /> : <p className="text-sm text-[#7c5433] italic">No rows returned.</p>}
                          </div>
                          <div className="rounded-[22px] border-2 border-[#e1c8aa] bg-[#fffaf1] p-4 space-y-2">
                            <h4 className="font-semibold text-[#6d4b31] text-sm">Expected result</h4>
                            {expectedComparisonRows != null ? (
                              <>
                                <p className="text-sm text-[#8b6a50]">Rows expected: {expectedComparisonRows.length}</p>
                                {expectedComparisonRows.length > 0 ? <DataTable rows={expectedComparisonRows} columns={expectedComparisonSchema} /> : <p className="text-sm text-[#7c5433] italic">No rows expected.</p>}
                              </>
                            ) : <p className="text-sm text-[#7c5433] italic">Expected result not available for this query.</p>}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className={`${blockCardSoft} space-y-4`}>
                      <h3 className="flex items-center gap-2 text-base font-semibold text-[#5c3b1f]">
                        <Lightbulb className="app-icon-glyph h-4 w-4" />
                        Help center
                      </h3>
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={handleGenerateHint}
                          disabled={aiHintLoading}
                          className={supportPanel === 'hint' ? primaryButton : secondaryButton}
                        >
                          <Lightbulb className="w-4 h-4" />
                          {aiHintLoading ? 'Generating hint...' : 'Get hint'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSupportPanel((panel) => panel === 'trace' ? null : 'trace');
                          }}
                          disabled={!result}
                          className={supportPanel === 'trace' ? primaryButton : secondaryButton}
                        >
                          <Rows3 className="w-4 h-4" />
                          {supportPanel === 'trace' ? 'Hide evaluation trace' : 'Show evaluation trace'}
                        </button>
                        <button
                          type="button"
                          onClick={handleViewSolution}
                          className={supportPanel === 'solution' ? primaryButton : secondaryButton}
                        >
                          <Eye className="w-4 h-4" />
                          {supportPanel === 'solution' ? 'Hide canonical solution' : 'Show canonical solution'}
                        </button>
                      </div>

                      {supportPanel === 'trace' && result && (
                        <div className="space-y-3 rounded-2xl border border-[#d9c4a5] bg-[#fff9ef] p-4">
                          <TraceViewer trace={result.trace} title="Evaluation Trace for Your Expression" />
                        </div>
                      )}

                      {aiHintError && <StatusBadge variant="error">Could not generate an AI hint: {aiHintError}</StatusBadge>}

                      {supportPanel === 'hint' && aiHint && (
                        <div className="rounded-2xl border border-[#cbeae3] bg-[#f7fcfa] p-4">
                          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#3d6f67]">
                            <Lightbulb className="h-4 w-4" />
                            AI hint{aiHintModel ? <span className="text-xs font-medium text-[#667085]">({aiHintModel})</span> : null}
                          </div>
                          <p className="text-sm leading-6 text-[#344054]">{aiHint}</p>
                        </div>
                      )}

                      {supportPanel === 'solution' && showSolution && queryDetail.solution && (
                        <div className="space-y-3 rounded-2xl border border-[#d9c4a5] bg-[#fff9ef] p-4">
                          {queryDetail.solution.relational_algebra && (
                            <div>
                              <h3 className={resultHeader}>
                                <Pencil className="h-4 w-4 text-primary" />
                                Canonical relational algebra
                              </h3>
                              <pre className="overflow-x-auto rounded-2xl border-2 border-[#ead7b8] bg-white p-3 text-sm font-mono text-[#5c3b1f]">{queryDetail.solution.relational_algebra}</pre>
                            </div>
                          )}
                          {queryDetail.solution.sql && (
                            <div>
                              <h3 className={resultHeader}>
                                <DatabaseIcon className="h-4 w-4 text-primary" />
                                Equivalent SQL
                              </h3>
                              <pre className="overflow-x-auto rounded-2xl border-2 border-[#ead7b8] bg-white p-3 text-sm font-mono text-[#5c3b1f]">{queryDetail.solution.sql}</pre>
                            </div>
                          )}
                          {solutionResult && (
                            <>
                              <h3 className={resultHeader}>
                                <Rows3 className="h-4 w-4 text-primary" />
                                Canonical result
                              </h3>
                              {solutionResult.rows.length > 0 ? <DataTable rows={solutionResult.rows} /> : <p className="text-sm text-[#7c5433] italic">Expected result returns no rows.</p>}
                              <TraceViewer trace={solutionResult.trace} title="Evaluation Trace for the Canonical Expression" />
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {mode === 'custom' && (
          <section className={`${blockCard} space-y-4`}>
            <div className="flex items-center gap-3">
              <div className="app-icon-tile flex h-11 w-11 items-center justify-center rounded-[16px] shadow-[0_4px_0_0_rgba(203,234,227,0.9)]">
                <Pencil className="app-icon-glyph h-5 w-5" />
              </div>
              <div>
                <p className={sectionLabel}>Custom Evaluation</p>
                <h2 className={sectionTitle}>Evaluate any RA expression</h2>
              </div>
            </div>
            <form onSubmit={handleCustomExecute} className={`${blockCardSoft} space-y-3`}>
              <label htmlFor={customExprTextareaId} className="text-sm font-medium text-[#3d6f67]">Enter a relational algebra expression to evaluate:</label>
              <textarea
                id={customExprTextareaId}
                value={customExpr}
                onChange={(e) => {
                  setCustomExpr(e.target.value);
                  setCustomResult(null);
                }}
                className="h-28 w-full resize-y rounded-2xl border-2 border-[#d8b485] bg-white px-4 py-3 font-mono text-sm text-[#5c3b1f] transition-colors focus:border-[#d97745] focus:outline-none focus:ring-4 focus:ring-[#f7c8a5]"
              />
              <div className="flex justify-center">
                <button type="submit" disabled={customExecuting} className={primaryButton}>
                  <Play className="w-4 h-4" />
                  {customExecuting ? 'Evaluating...' : 'Evaluate Expression'}
                </button>
              </div>
              <Collapsible title="RA syntax help">
                <SyntaxHelp database={selectedDb} />
              </Collapsible>
              {customError && (
                <StatusBadge variant="error">Could not evaluate the expression: {customError}</StatusBadge>
              )}
            </form>

            {customResult && (
              <div className={`${blockCardSoft} space-y-4`}>
                <h3 className="flex items-center gap-2 text-base font-semibold text-[#5c3b1f]">
                  <BarChart3 className="app-icon-glyph h-4 w-4" />
                  Result
                </h3>
                {customResult.rows.length > 0 ? (
                  <DataTable rows={customResult.rows} />
                ) : (
                  <p className="text-sm text-[#7c5433] italic">Query returned no rows.</p>
                )}
                <TraceViewer trace={customResult.trace} />
              </div>
            )}
          </section>
        )}
              </div>
            </section>
        )}
    </div>
  );
}
