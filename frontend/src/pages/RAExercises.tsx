import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { api, type Database, type Query, type EvaluationResult, type TableInfo } from '../lib/api';
import AuthGate from '../components/AuthGate';
import StatusBadge from '../components/StatusBadge';
import Collapsible from '../components/Collapsible';
import TablePreview from '../components/TablePreview';
import DataTable from '../components/DataTable';
import TraceViewer from '../components/TraceViewer';
import SyntaxHelp from '../components/SyntaxHelp';
import { sortQueries, difficultyIcon, difficultyLabel } from '../lib/difficulty';

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
    return <AuthGate><StatusBadge variant="error">❌ Backend service connection failed</StatusBadge></AuthGate>;
  }

  const selectedDbInfo = databases.find((d) => d.name === selectedDb);

  return (
    <AuthGate>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">🧮 Relational Algebra Exercises</h1>
          <p className="mt-1 text-gray-600">Explore datasets, review available practice material, and choose how you want to work with relational algebra expressions.</p>
        </div>

        {backendOk && <StatusBadge variant="success">✅ Backend service connected successfully</StatusBadge>}

        <section>
          <h2 className="text-xl font-semibold text-gray-800 mb-3">📊 Choose a Database</h2>
          <select
            value={selectedDb}
            onChange={(e) => { setSelectedDb(e.target.value); setMode(null); }}
            className="w-full sm:w-80 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">- Select a database -</option>
            {databases.map((db) => (
              <option key={db.name} value={db.name}>{db.name} ({db.table_count} tables)</option>
            ))}
          </select>
        </section>

        {selectedDb && selectedDbInfo && (
          <>
            <Collapsible title={`📚 Active database: ${selectedDb}`}>
              <div className="space-y-0.5">
                {selectedDbInfo.tables.map((t) => (
                  <TablePreview key={t} tableName={t} metadata={schemaMap[t]} />
                ))}
              </div>
            </Collapsible>

            <hr className="border-gray-200" />
            <h2 className="text-xl font-semibold text-gray-800">🧭 Choose How You Want to Practice</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
                <h3 className="font-semibold text-gray-800">🧩 Operator-Based Queries</h3>
                <p className="text-sm text-gray-600">Browse the full query catalog or narrow it by operators like joins or set operations.</p>
                {queries.length > 0 ? (
                  <button
                    onClick={() => setMode('operators')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'operators' ? 'bg-blue-100 text-blue-700 border border-blue-300' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                  >
                    Browse Queries
                  </button>
                ) : (
                  <p className="text-sm text-gray-500 italic">This database does not provide a query catalog to browse.</p>
                )}
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
                <h3 className="font-semibold text-gray-800">✏️ Custom Queries</h3>
                <p className="text-sm text-gray-600">Practice by writing your own relational algebra expressions.</p>
                <button
                  onClick={() => setMode('custom')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'custom' ? 'bg-blue-100 text-blue-700 border border-blue-300' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                >
                  Practice with Custom Queries
                </button>
              </div>
            </div>
          </>
        )}

        {mode === 'operators' && (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-800">🧩 Operator-Based Queries</h2>

            <div className="flex flex-wrap gap-2">
              {OPERATOR_OPTIONS.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => toggleOp(key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    selectedOps.has(key) ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              {(['unmastered', 'all', 'mastered'] as const).map((f) => (
                <label key={f} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name="progress" checked={progressFilter === f} onChange={() => setProgressFilter(f)} className="accent-blue-600" />
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </label>
              ))}
            </div>

            <p className="text-xs text-gray-500">🟢 beginner &nbsp; 🟡 intermediate &nbsp; 🔴 difficult</p>

            {filteredQueries.length === 0 ? (
              <StatusBadge variant="info">No queries match the selected filters. Try another operator, switch progress, or clear the filter.</StatusBadge>
            ) : (
              <>
                <select
                  value={selectedQueryId}
                  onChange={(e) => setSelectedQueryId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
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
                    <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-2">
                      <p className="text-sm"><span className="font-semibold">Query Description:</span> {queryDetail.prompt}</p>
                      <p className="text-sm"><span className="font-semibold">Difficulty:</span> {difficultyLabel(queryDetail.difficulty)}</p>
                      {queryDetail.hints?.length ? (
                        <p className="text-sm"><span className="font-semibold">Hint:</span> {queryDetail.hints.join(', ')}</p>
                      ) : null}
                    </div>

                    <form onSubmit={handleExecute} className="space-y-3">
                      <h3 className="text-lg font-semibold text-gray-800">✏️ Your Solution</h3>
                      <p className="text-sm text-gray-600">Write the relational algebra expression for this query:</p>
                      <textarea
                        value={solution}
                        onChange={(e) => setSolution(e.target.value)}
                        className="w-full h-24 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                      />
                      <div className="flex justify-center">
                        <button type="submit" disabled={executing} className="px-6 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
                          {executing ? 'Executing...' : '🚀 Execute My Solution'}
                        </button>
                      </div>
                      <Collapsible title="💡 Query Syntax Help">
                        <SyntaxHelp database={selectedDb} />
                      </Collapsible>
                    </form>

                    {resultError && <StatusBadge variant="error">❌ Error executing your solution: {resultError}</StatusBadge>}

                    {result && (
                      <div className="space-y-6">
                        <h3 className="text-lg font-semibold text-gray-800">📊 Results Comparison</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <h4 className="font-semibold text-gray-700">Your Solution Output</h4>
                            <p className="text-sm text-gray-600">Rows returned: {result.row_count}</p>
                            {result.rows.length > 0 ? <DataTable rows={result.rows} /> : <p className="text-sm text-gray-500 italic">No rows returned.</p>}
                          </div>
                          <div className="space-y-2">
                            <h4 className="font-semibold text-gray-700">Expected Output</h4>
                            {result.expected_rows ? (
                              <>
                                <p className="text-sm text-gray-600">Rows expected: {result.expected_rows.length}</p>
                                {result.expected_rows.length > 0 ? <DataTable rows={result.expected_rows} /> : <p className="text-sm text-gray-500 italic">No rows expected.</p>}
                              </>
                            ) : <p className="text-sm text-gray-500 italic">Expected result not available for this query.</p>}
                          </div>
                        </div>
                        <TraceViewer trace={result.trace} title="🔍 Execution Trace of Your Solution" />
                      </div>
                    )}

                    <hr className="border-gray-200" />
                    <h3 className="text-lg font-semibold text-gray-800">💡 Need Help?</h3>
                    <button
                      onClick={handleViewSolution}
                      className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50 transition-colors"
                    >
                      👁️ View Expected Solution & Results
                    </button>

                    {showSolution && queryDetail.solution && (
                      <div className="space-y-3 bg-white border border-gray-200 rounded-lg p-5">
                        {queryDetail.solution.relational_algebra && (
                          <div>
                            <p className="font-semibold text-sm text-gray-700 mb-1">Expected Relational Algebra Expression:</p>
                            <pre className="bg-gray-50 p-3 rounded text-sm font-mono overflow-x-auto">{queryDetail.solution.relational_algebra}</pre>
                          </div>
                        )}
                        {queryDetail.solution.sql && (
                          <div>
                            <p className="font-semibold text-sm text-gray-700 mb-1">Equivalent SQL:</p>
                            <pre className="bg-gray-50 p-3 rounded text-sm font-mono overflow-x-auto">{queryDetail.solution.sql}</pre>
                          </div>
                        )}
                        {solutionResult && (
                          <>
                            <h4 className="font-semibold text-gray-800">📊 Expected Query Results</h4>
                            {solutionResult.rows.length > 0 ? <DataTable rows={solutionResult.rows} /> : <p className="text-sm text-gray-500 italic">Expected result returns no rows.</p>}
                            <TraceViewer trace={solutionResult.trace} title="🔍 Execution Trace of Expected Solution" />
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
            <h2 className="text-xl font-semibold text-gray-800">✏️ Custom Query Practice</h2>
            <form onSubmit={handleCustomExecute} className="space-y-3">
              <label className="text-sm font-medium text-gray-700">Enter your own relational algebra expression:</label>
              <textarea
                value={customExpr}
                onChange={(e) => setCustomExpr(e.target.value)}
                className="w-full h-24 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
              />
              <div className="flex justify-center">
                <button type="submit" disabled={customExecuting} className="px-6 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
                  {customExecuting ? 'Executing...' : '🚀 Execute Custom Query'}
                </button>
              </div>
              <Collapsible title="💡 Query Syntax Help">
                <SyntaxHelp database={selectedDb} />
              </Collapsible>
            </form>

            {customError && <StatusBadge variant="error">❌ Query execution failed: {customError}</StatusBadge>}

            {customResult && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800">📊 Query Results</h3>
                {customResult.rows.length > 0 ? (
                  <DataTable rows={customResult.rows} />
                ) : (
                  <p className="text-sm text-gray-500 italic">Query returned no rows.</p>
                )}
                <TraceViewer trace={customResult.trace} />
              </div>
            )}
          </section>
        )}
      </div>
    </AuthGate>
  );
}
