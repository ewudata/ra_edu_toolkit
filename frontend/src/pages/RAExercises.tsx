import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { api, type Database, type Query, type EvaluationResult, type TableInfo } from '../lib/api';
import StatusBadge from '../components/StatusBadge';
import Collapsible from '../components/Collapsible';
import TablePreview from '../components/TablePreview';
import DataTable from '../components/DataTable';
import TraceViewer from '../components/TraceViewer';
import SyntaxHelp from '../components/SyntaxHelp';
import { sortQueries, difficultyIcon, difficultyLabel } from '../lib/difficulty';
import {
  Database as DatabaseIcon,
  LayoutList,
  Pencil,
  Play,
  Eye,
  Lightbulb,
  BarChart3,
  Filter,
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
  const [databases, setDatabases] = useState<Database[]>([]);
  const [selectedDb, setSelectedDb] = useState('');
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [queries, setQueries] = useState<Query[]>([]);
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
  const [showSolution, setShowSolution] = useState(false);
  const [solutionResult, setSolutionResult] = useState<EvaluationResult | null>(null);

  const [customExpr, setCustomExpr] = useState('');
  const [customResult, setCustomResult] = useState<EvaluationResult | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);
  const [customExecuting, setCustomExecuting] = useState(false);

  useEffect(() => {
    api.healthCheck().then(() => setBackendOk(true)).catch(() => setBackendOk(false));
    api.getDatabases().then(setDatabases).catch(() => {});
  }, []);

  const loadDbData = useCallback(async (db: string) => {
    try {
      const [qs, mastery, schema] = await Promise.all([
        api.getQueries(db),
        api.getQueryMastery(db).catch(() => ({ query_ids: [] })),
        api.getDatabaseSchema(db, 3),
      ]);
      setQueries(sortQueries(qs));
      setMasteredIds(new Set(mastery.query_ids.map(String)));
      setSchemaMap(Object.fromEntries(schema.tables.map((t) => [t.name, t])));
    } catch {
      setQueries([]);
    }
  }, []);

  useEffect(() => {
    if (selectedDb) {
      loadDbData(selectedDb);
      setSelectedQueryId('');
      setQueryDetail(null);
      setResult(null);
      setResultError(null);
      setCustomResult(null);
      setCustomError(null);
      setShowSolution(false);
      setSolutionResult(null);
    }
  }, [selectedDb, loadDbData]);

  useEffect(() => {
    if (!selectedQueryId || !selectedDb) { setQueryDetail(null); return; }
    api.getQueryDetail(selectedDb, selectedQueryId).then(setQueryDetail).catch(() => {});
    setResult(null);
    setResultError(null);
    setSolution('');
    setShowSolution(false);
    setSolutionResult(null);
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
    setResultError(null);
    try {
      const res = await api.evaluateQuery(selectedDb, selectedQueryId, solution.trim());
      setResult(res);
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

  async function handleViewSolution() {
    setShowSolution(true);
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
  const sectionLabel = 'text-xs font-semibold uppercase tracking-[0.22em] text-[#7d77ad]';
  const sectionTitle = 'text-xl font-semibold text-[#3f4761]';
  const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-2xl border border-[#7b75c2] bg-[#7f78c7] px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#6e68b1] disabled:opacity-50 cursor-pointer';
  const secondaryButton = 'inline-flex items-center justify-center gap-2 rounded-2xl border border-[#d8dded] bg-[rgba(255,255,255,0.88)] px-4 py-2 text-sm font-semibold text-[#55607d] transition-colors duration-200 hover:bg-[#f3f4fd] cursor-pointer';

  return (
    <div className="space-y-6 rounded-[28px] bg-[linear-gradient(180deg,rgba(246,245,253,0.72)_0%,rgba(244,246,252,0.84)_52%,rgba(247,250,249,0.9)_100%)] p-4 sm:p-6">
        <section className="rounded-[26px] border border-[#dde1f0] bg-[linear-gradient(135deg,#f5f4ff_0%,#eef2ff_52%,#eef7f4_100%)] p-6 text-[#3f4761] shadow-[0_14px_34px_rgba(123,128,173,0.1)]">
          <div className="space-y-3">
            <div className="space-y-3">
              <p className="text-sm font-bold uppercase tracking-[0.28em] text-[#7d77ad]">Academic Practice Studio</p>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-[#3f4761] sm:text-4xl">Relational Algebra Exercises</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#68718c] sm:text-base">
                  Work through database-backed prompts in clear study blocks: choose a schema, filter the catalog, and compare your algebra against the expected result.
                </p>
              </div>
            </div>
          </div>
        </section>

        {backendOk && <StatusBadge variant="success">Backend service connected successfully</StatusBadge>}

        <section className={blockCard}>
          <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-[#d8d4fb] bg-[#f1f0ff]">
                  <DatabaseIcon className="h-5 w-5 text-[#6e68b1]" />
                </div>
                <div>
                  <p className={sectionLabel}>Study Setup</p>
                  <h2 className={sectionTitle}>Choose a database workspace</h2>
                </div>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-[#68718c]">
                Pick the dataset you want to practice against. Once selected, the page opens the schema, query catalog, and custom-expression tools for that database.
              </p>
            </div>
            <div className="rounded-[20px] border border-[#e4e7f2] bg-[rgba(255,255,255,0.82)] p-4 shadow-[0_8px_20px_rgba(123,128,173,0.06)]">
              <label className="mb-2 block text-sm font-semibold text-[#55607d]">Database collection</label>
              <select
                value={selectedDb}
                onChange={(e) => { setSelectedDb(e.target.value); setMode(null); }}
                className="w-full rounded-2xl border border-[#d8dded] bg-white/92 px-4 py-3 text-sm text-[#3f4761] focus:border-[#9791e0] focus:outline-none focus:ring-4 focus:ring-[rgba(199,195,242,0.5)] transition-colors cursor-pointer"
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
          <>
            <section className="grid gap-5 xl:grid-cols-[1.05fr_1.3fr]">
              <div className={`${blockCard} space-y-4`}>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-[#dbe7e1] bg-[#eef7f4]">
                    <DatabaseIcon className="h-5 w-5 text-[#6e9d8b]" />
                  </div>
                  <div>
                    <p className={sectionLabel}>Reference Block</p>
                    <h2 className={sectionTitle}>Active database: {selectedDb}</h2>
                  </div>
                </div>
                <p className="text-sm leading-6 text-[#68718c]">
                  Review available relations before solving. This keeps the schema visible as a study aid instead of burying it below the exercise workflow.
                </p>
                <Collapsible title={`Browse tables in ${selectedDb}`}>
                  <div className="space-y-0.5">
                    {selectedDbInfo.tables.map((t) => (
                      <TablePreview key={t} tableName={t} metadata={schemaMap[t]} />
                    ))}
                  </div>
                </Collapsible>
              </div>

              <div className={`${blockCard} space-y-4`}>
                <div className="space-y-2">
                  <p className={sectionLabel}>Practice Mode</p>
                  <h2 className={sectionTitle}>Choose how you want to work</h2>
                  <p className="text-sm leading-6 text-[#68718c]">
                    Use structured catalog practice when you want targeted prompts, or switch to open writing mode to test an expression directly.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-[22px] border border-[#e4e7f2] bg-[rgba(255,255,255,0.86)] p-5 shadow-[0_8px_20px_rgba(123,128,173,0.06)]">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[#d8d4fb] bg-[#f1f0ff]">
                        <LayoutList className="h-4 w-4 text-[#6e68b1]" />
                      </div>
                      <h3 className="font-semibold text-[#3f4761]">Operator-Based Queries</h3>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[#68718c]">Browse the full catalog or narrow it by operator families, difficulty, and mastery progress.</p>
                    {queries.length > 0 ? (
                      <button
                        onClick={() => setMode('operators')}
                        className={`mt-4 ${mode === 'operators' ? secondaryButton : primaryButton}`}
                      >
                        Browse Queries
                      </button>
                    ) : (
                      <p className="mt-4 text-sm italic text-[#8b92a8]">This database does not provide a query catalog to browse.</p>
                    )}
                  </div>
                  <div className="rounded-[22px] border border-[#e4e7f2] bg-[rgba(255,255,255,0.86)] p-5 shadow-[0_8px_20px_rgba(123,128,173,0.06)]">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[#dbe7e1] bg-[#eef7f4]">
                        <Pencil className="h-4 w-4 text-[#6e9d8b]" />
                      </div>
                      <h3 className="font-semibold text-[#3f4761]">Custom Queries</h3>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[#68718c]">Practice by writing your own relational algebra expressions without selecting a catalog prompt first.</p>
                    <button
                      onClick={() => setMode('custom')}
                      className={`mt-4 ${mode === 'custom' ? secondaryButton : primaryButton}`}
                    >
                      Practice with Custom Queries
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {mode === 'operators' && (
          <section className={`${blockCard} space-y-5`}>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border-2 border-[#cf875e] bg-[#ffd19a] shadow-[0_4px_0_0_#f7e1be]">
                <Filter className="h-5 w-5 text-[#7a4526]" />
              </div>
              <div>
                <p className={sectionLabel}>Catalog Filters</p>
                <h2 className={sectionTitle}>Operator-Based Queries</h2>
              </div>
            </div>

            <div className={`${blockCardSoft} space-y-4`}>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-[#8f5f36]">Operator group</h3>
                <p className="mt-1 text-sm text-[#7b5a42]">Select one or more operator families to create a focused practice set.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {OPERATOR_OPTIONS.map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => toggleOp(key)}
                    className={`rounded-2xl border-2 px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                      selectedOps.has(key) ? 'border-[#c66c44] bg-[#d97745] text-white' : 'border-[#d8c1a2] bg-[#fff8eb] text-[#7b5a42] hover:bg-[#fff0d1]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className={`${blockCardSoft} space-y-4`}>
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-[#8f5f36]">Progress view</h3>
                  <p className="mt-1 text-sm text-[#7b5a42]">Switch between new practice, complete view, or mastered prompts.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {(['unmastered', 'all', 'mastered'] as const).map((f) => (
                    <label key={f} className="flex items-center gap-2 rounded-2xl border-2 border-[#dcc5a8] bg-[#fff9ef] px-3 py-2 text-sm font-medium cursor-pointer text-[#6a4930]">
                      <input type="radio" name="progress" checked={progressFilter === f} onChange={() => setProgressFilter(f)} className="accent-[#d97745]" />
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-4 text-xs font-semibold text-[#8b6a50]">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> beginner</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> intermediate</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> difficult</span>
              </div>
            </div>

            {filteredQueries.length === 0 ? (
              <StatusBadge variant="info">No queries match the selected filters. Try another operator, switch progress, or clear the filter.</StatusBadge>
            ) : (
              <>
                <div className={blockCardSoft}>
                  <label className="mb-2 block text-sm font-semibold text-[#6c482c]">Choose a prompt from the filtered catalog</label>
                  <select
                    value={selectedQueryId}
                    onChange={(e) => setSelectedQueryId(e.target.value)}
                    className="w-full rounded-2xl border-2 border-[#d8b485] bg-white px-4 py-3 text-sm text-[#5c3b1f] focus:border-[#d97745] focus:outline-none focus:ring-4 focus:ring-[#f7c8a5] cursor-pointer"
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
                    <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                      <div className="rounded-[26px] border-2 border-[#d8c39a] bg-[#fff8eb] p-5 shadow-[0_6px_0_0_#f4e4c7] space-y-2">
                        <p className="text-sm text-[#6d4b31]"><span className="font-semibold text-[#5c3b1f]">Query Description:</span> {queryDetail.prompt}</p>
                        <p className="text-sm text-[#6d4b31]"><span className="font-semibold text-[#5c3b1f]">Difficulty:</span> {difficultyLabel(queryDetail.difficulty)}</p>
                        {queryDetail.hints?.length ? (
                          <p className="text-sm text-[#6d4b31]"><span className="font-semibold text-[#5c3b1f]">Hint:</span> {queryDetail.hints.join(', ')}</p>
                        ) : null}
                      </div>

                      <form onSubmit={handleExecute} className="rounded-[26px] border-2 border-[#d7b79f] bg-[#fbe7df] p-5 shadow-[0_6px_0_0_#f2d2c4] space-y-3">
                        <h3 className="flex items-center gap-2 text-base font-semibold text-[#5c3b1f]">
                          <Pencil className="w-4 h-4 text-[#c86239]" />
                          Your Solution
                        </h3>
                        <p className="text-sm text-[#7b5a42]">Write the relational algebra expression for this query:</p>
                        <textarea
                          value={solution}
                          onChange={(e) => setSolution(e.target.value)}
                          className="h-28 w-full resize-y rounded-2xl border-2 border-[#d8b485] bg-white px-4 py-3 font-mono text-sm text-[#5c3b1f] transition-colors focus:border-[#d97745] focus:outline-none focus:ring-4 focus:ring-[#f7c8a5]"
                        />
                        <div className="flex justify-center">
                          <button type="submit" disabled={executing} className={primaryButton}>
                            <Play className="w-4 h-4" />
                            {executing ? 'Executing...' : 'Execute My Solution'}
                          </button>
                        </div>
                        <Collapsible title="Query Syntax Help">
                          <SyntaxHelp database={selectedDb} />
                        </Collapsible>
                      </form>
                    </div>

                    {resultError && <StatusBadge variant="error">Error executing your solution: {resultError}</StatusBadge>}

                    {result && (
                      <div className={`${blockCardSoft} space-y-6`}>
                        <h3 className="flex items-center gap-2 text-base font-semibold text-[#5c3b1f]">
                          <BarChart3 className="w-4 h-4 text-[#c86239]" />
                          Results Comparison
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="rounded-[22px] border-2 border-[#e1c8aa] bg-[#fffaf1] p-4 space-y-2">
                            <h4 className="font-semibold text-[#6d4b31] text-sm">Your Solution Output</h4>
                            <p className="text-sm text-[#8b6a50]">Rows returned: {result.row_count}</p>
                            {result.rows.length > 0 ? <DataTable rows={result.rows} /> : <p className="text-sm text-[#9f856d] italic">No rows returned.</p>}
                          </div>
                          <div className="rounded-[22px] border-2 border-[#e1c8aa] bg-[#fffaf1] p-4 space-y-2">
                            <h4 className="font-semibold text-[#6d4b31] text-sm">Expected Output</h4>
                            {result.expected_rows ? (
                              <>
                                <p className="text-sm text-[#8b6a50]">Rows expected: {result.expected_rows.length}</p>
                                {result.expected_rows.length > 0 ? <DataTable rows={result.expected_rows} /> : <p className="text-sm text-[#9f856d] italic">No rows expected.</p>}
                              </>
                            ) : <p className="text-sm text-[#9f856d] italic">Expected result not available for this query.</p>}
                          </div>
                        </div>
                        <TraceViewer trace={result.trace} title="Execution Trace of Your Solution" />
                      </div>
                    )}

                    <div className={`${blockCardSoft} space-y-4`}>
                      <h3 className="flex items-center gap-2 text-base font-semibold text-[#5c3b1f]">
                        <Lightbulb className="w-4 h-4 text-[#d98d24]" />
                        Need Help?
                      </h3>
                      <button
                        onClick={handleViewSolution}
                        className={secondaryButton}
                      >
                        <Eye className="w-4 h-4" />
                        View Expected Solution & Results
                      </button>

                      {showSolution && queryDetail.solution && (
                        <div className="space-y-3 rounded-[24px] border-2 border-[#d9c4a5] bg-[#fff9ef] p-5">
                          {queryDetail.solution.relational_algebra && (
                            <div>
                              <p className="mb-1 text-sm font-semibold text-[#6d4b31]">Expected Relational Algebra Expression:</p>
                              <pre className="overflow-x-auto rounded-2xl border-2 border-[#ead7b8] bg-white p-3 text-sm font-mono text-[#5c3b1f]">{queryDetail.solution.relational_algebra}</pre>
                            </div>
                          )}
                          {queryDetail.solution.sql && (
                            <div>
                              <p className="mb-1 text-sm font-semibold text-[#6d4b31]">Equivalent SQL:</p>
                              <pre className="overflow-x-auto rounded-2xl border-2 border-[#ead7b8] bg-white p-3 text-sm font-mono text-[#5c3b1f]">{queryDetail.solution.sql}</pre>
                            </div>
                          )}
                          {solutionResult && (
                            <>
                              <h4 className="font-semibold text-[#5c3b1f]">Expected Query Results</h4>
                              {solutionResult.rows.length > 0 ? <DataTable rows={solutionResult.rows} /> : <p className="text-sm text-[#9f856d] italic">Expected result returns no rows.</p>}
                              <TraceViewer trace={solutionResult.trace} title="Execution Trace of Expected Solution" />
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
              <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border-2 border-[#d27e63] bg-[#f7b59d] shadow-[0_4px_0_0_#f0d1c4]">
                <Pencil className="w-5 h-5 text-[#7a3526]" />
              </div>
              <div>
                <p className={sectionLabel}>Free Writing</p>
                <h2 className={sectionTitle}>Custom Query Practice</h2>
              </div>
            </div>
            <form onSubmit={handleCustomExecute} className={`${blockCardSoft} space-y-3`}>
              <label className="text-sm font-medium text-[#6d4b31]">Enter your own relational algebra expression:</label>
              <textarea
                value={customExpr}
                onChange={(e) => setCustomExpr(e.target.value)}
                className="h-28 w-full resize-y rounded-2xl border-2 border-[#d8b485] bg-white px-4 py-3 font-mono text-sm text-[#5c3b1f] transition-colors focus:border-[#d97745] focus:outline-none focus:ring-4 focus:ring-[#f7c8a5]"
              />
              <div className="flex justify-center">
                <button type="submit" disabled={customExecuting} className={primaryButton}>
                  <Play className="w-4 h-4" />
                  {customExecuting ? 'Executing...' : 'Execute Custom Query'}
                </button>
              </div>
              <Collapsible title="Query Syntax Help">
                <SyntaxHelp database={selectedDb} />
              </Collapsible>
            </form>

            {customError && <StatusBadge variant="error">Query execution failed: {customError}</StatusBadge>}

            {customResult && (
              <div className={`${blockCardSoft} space-y-4`}>
                <h3 className="flex items-center gap-2 text-base font-semibold text-[#5c3b1f]">
                  <BarChart3 className="w-4 h-4 text-[#c86239]" />
                  Query Results
                </h3>
                {customResult.rows.length > 0 ? (
                  <DataTable rows={customResult.rows} />
                ) : (
                  <p className="text-sm text-[#9f856d] italic">Query returned no rows.</p>
                )}
                <TraceViewer trace={customResult.trace} />
              </div>
            )}
          </section>
        )}
    </div>
  );
}
