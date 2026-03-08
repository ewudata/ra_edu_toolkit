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

  return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Relational Algebra Exercises</h1>
          <p className="mt-1 text-sm text-slate-500">Explore datasets, review available practice material, and choose how you want to work with RA expressions.</p>
        </div>

        {backendOk && <StatusBadge variant="success">Backend service connected successfully</StatusBadge>}

        <section>
          <div className="flex items-center gap-2 mb-3">
            <DatabaseIcon className="w-4 h-4 text-primary" />
            <h2 className="text-lg font-semibold text-slate-700">Choose a Database</h2>
          </div>
          <select
            value={selectedDb}
            onChange={(e) => { setSelectedDb(e.target.value); setMode(null); }}
            className="w-full sm:w-80 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors cursor-pointer"
          >
            <option value="">- Select a database -</option>
            {databases.map((db) => (
              <option key={db.name} value={db.name}>{db.name} ({db.table_count} tables)</option>
            ))}
          </select>
        </section>

        {selectedDb && selectedDbInfo && (
          <>
            <Collapsible title={`Active database: ${selectedDb}`}>
              <div className="space-y-0.5">
                {selectedDbInfo.tables.map((t) => (
                  <TablePreview key={t} tableName={t} metadata={schemaMap[t]} />
                ))}
              </div>
            </Collapsible>

            <hr className="border-slate-200" />
            <h2 className="text-lg font-semibold text-slate-700">Choose How You Want to Practice</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                    <LayoutList className="w-4 h-4 text-violet-600" />
                  </div>
                  <h3 className="font-semibold text-slate-700">Operator-Based Queries</h3>
                </div>
                <p className="text-sm text-slate-500">Browse the full query catalog or narrow it by operators like joins or set operations.</p>
                {queries.length > 0 ? (
                  <button
                    onClick={() => setMode('operators')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${mode === 'operators' ? 'bg-primary-50 text-primary border border-primary-100' : 'bg-primary text-white hover:bg-primary-dark'}`}
                  >
                    Browse Queries
                  </button>
                ) : (
                  <p className="text-sm text-slate-400 italic">This database does not provide a query catalog to browse.</p>
                )}
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                    <Pencil className="w-4 h-4 text-amber-600" />
                  </div>
                  <h3 className="font-semibold text-slate-700">Custom Queries</h3>
                </div>
                <p className="text-sm text-slate-500">Practice by writing your own relational algebra expressions.</p>
                <button
                  onClick={() => setMode('custom')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${mode === 'custom' ? 'bg-primary-50 text-primary border border-primary-100' : 'bg-primary text-white hover:bg-primary-dark'}`}
                >
                  Practice with Custom Queries
                </button>
              </div>
            </div>
          </>
        )}

        {mode === 'operators' && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-primary" />
              <h2 className="text-lg font-semibold text-slate-700">Operator-Based Queries</h2>
            </div>

            <div className="flex flex-wrap gap-2">
              {OPERATOR_OPTIONS.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => toggleOp(key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                    selectedOps.has(key) ? 'bg-primary-50 border-primary-100 text-primary' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex gap-4">
              {(['unmastered', 'all', 'mastered'] as const).map((f) => (
                <label key={f} className="flex items-center gap-1.5 text-sm cursor-pointer text-slate-600">
                  <input type="radio" name="progress" checked={progressFilter === f} onChange={() => setProgressFilter(f)} className="accent-primary" />
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </label>
              ))}
            </div>

            <div className="flex gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> beginner</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> intermediate</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> difficult</span>
            </div>

            {filteredQueries.length === 0 ? (
              <StatusBadge variant="info">No queries match the selected filters. Try another operator, switch progress, or clear the filter.</StatusBadge>
            ) : (
              <>
                <select
                  value={selectedQueryId}
                  onChange={(e) => setSelectedQueryId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary cursor-pointer"
                >
                  <option value="">- Select a query -</option>
                  {filteredQueries.map((q) => {
                    const mastered = masteredIds.has(q.id);
                    const prompt = (q.prompt ?? '').length > 80 ? q.prompt!.slice(0, 77) + '...' : q.prompt;
                    return <option key={q.id} value={q.id}>{mastered ? '✓ ' : ''}{difficultyIcon(q.difficulty)} {prompt}</option>;
                  })}
                </select>

                {queryDetail && (
                  <div className="space-y-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                      <p className="text-sm text-slate-600"><span className="font-semibold text-slate-700">Query Description:</span> {queryDetail.prompt}</p>
                      <p className="text-sm text-slate-600"><span className="font-semibold text-slate-700">Difficulty:</span> {difficultyLabel(queryDetail.difficulty)}</p>
                      {queryDetail.hints?.length ? (
                        <p className="text-sm text-slate-600"><span className="font-semibold text-slate-700">Hint:</span> {queryDetail.hints.join(', ')}</p>
                      ) : null}
                    </div>

                    <form onSubmit={handleExecute} className="space-y-3">
                      <h3 className="flex items-center gap-2 text-base font-semibold text-slate-700">
                        <Pencil className="w-4 h-4 text-primary" />
                        Your Solution
                      </h3>
                      <p className="text-sm text-slate-500">Write the relational algebra expression for this query:</p>
                      <textarea
                        value={solution}
                        onChange={(e) => setSolution(e.target.value)}
                        className="w-full h-24 px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary/30 focus:border-primary resize-y transition-colors"
                      />
                      <div className="flex justify-center">
                        <button type="submit" disabled={executing} className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 cursor-pointer">
                          <Play className="w-4 h-4" />
                          {executing ? 'Executing...' : 'Execute My Solution'}
                        </button>
                      </div>
                      <Collapsible title="Query Syntax Help">
                        <SyntaxHelp database={selectedDb} />
                      </Collapsible>
                    </form>

                    {resultError && <StatusBadge variant="error">Error executing your solution: {resultError}</StatusBadge>}

                    {result && (
                      <div className="space-y-6">
                        <h3 className="flex items-center gap-2 text-base font-semibold text-slate-700">
                          <BarChart3 className="w-4 h-4 text-primary" />
                          Results Comparison
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <h4 className="font-semibold text-slate-600 text-sm">Your Solution Output</h4>
                            <p className="text-sm text-slate-500">Rows returned: {result.row_count}</p>
                            {result.rows.length > 0 ? <DataTable rows={result.rows} /> : <p className="text-sm text-slate-400 italic">No rows returned.</p>}
                          </div>
                          <div className="space-y-2">
                            <h4 className="font-semibold text-slate-600 text-sm">Expected Output</h4>
                            {result.expected_rows ? (
                              <>
                                <p className="text-sm text-slate-500">Rows expected: {result.expected_rows.length}</p>
                                {result.expected_rows.length > 0 ? <DataTable rows={result.expected_rows} /> : <p className="text-sm text-slate-400 italic">No rows expected.</p>}
                              </>
                            ) : <p className="text-sm text-slate-400 italic">Expected result not available for this query.</p>}
                          </div>
                        </div>
                        <TraceViewer trace={result.trace} title="Execution Trace of Your Solution" />
                      </div>
                    )}

                    <hr className="border-slate-200" />
                    <h3 className="flex items-center gap-2 text-base font-semibold text-slate-700">
                      <Lightbulb className="w-4 h-4 text-amber-500" />
                      Need Help?
                    </h3>
                    <button
                      onClick={handleViewSolution}
                      className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50 transition-colors cursor-pointer text-slate-600"
                    >
                      <Eye className="w-4 h-4" />
                      View Expected Solution & Results
                    </button>

                    {showSolution && queryDetail.solution && (
                      <div className="space-y-3 bg-white border border-slate-200 rounded-xl p-5">
                        {queryDetail.solution.relational_algebra && (
                          <div>
                            <p className="font-semibold text-sm text-slate-600 mb-1">Expected Relational Algebra Expression:</p>
                            <pre className="bg-slate-50 p-3 rounded-lg text-sm font-mono overflow-x-auto text-slate-700">{queryDetail.solution.relational_algebra}</pre>
                          </div>
                        )}
                        {queryDetail.solution.sql && (
                          <div>
                            <p className="font-semibold text-sm text-slate-600 mb-1">Equivalent SQL:</p>
                            <pre className="bg-slate-50 p-3 rounded-lg text-sm font-mono overflow-x-auto text-slate-700">{queryDetail.solution.sql}</pre>
                          </div>
                        )}
                        {solutionResult && (
                          <>
                            <h4 className="font-semibold text-slate-700">Expected Query Results</h4>
                            {solutionResult.rows.length > 0 ? <DataTable rows={solutionResult.rows} /> : <p className="text-sm text-slate-400 italic">Expected result returns no rows.</p>}
                            <TraceViewer trace={solutionResult.trace} title="Execution Trace of Expected Solution" />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {mode === 'custom' && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Pencil className="w-4 h-4 text-primary" />
              <h2 className="text-lg font-semibold text-slate-700">Custom Query Practice</h2>
            </div>
            <form onSubmit={handleCustomExecute} className="space-y-3">
              <label className="text-sm font-medium text-slate-600">Enter your own relational algebra expression:</label>
              <textarea
                value={customExpr}
                onChange={(e) => setCustomExpr(e.target.value)}
                className="w-full h-24 px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary/30 focus:border-primary resize-y transition-colors"
              />
              <div className="flex justify-center">
                <button type="submit" disabled={customExecuting} className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 cursor-pointer">
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
              <div className="space-y-4">
                <h3 className="flex items-center gap-2 text-base font-semibold text-slate-700">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Query Results
                </h3>
                {customResult.rows.length > 0 ? (
                  <DataTable rows={customResult.rows} />
                ) : (
                  <p className="text-sm text-slate-400 italic">Query returned no rows.</p>
                )}
                <TraceViewer trace={customResult.trace} />
              </div>
            )}
          </section>
        )}
      </div>
  );
}
