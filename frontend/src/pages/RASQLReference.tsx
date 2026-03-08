import { useEffect, useState } from 'react';
import { api, type Database, type Query } from '../lib/api';
import AuthGate from '../components/AuthGate';
import StatusBadge from '../components/StatusBadge';
import Collapsible from '../components/Collapsible';
import DataTable from '../components/DataTable';
import { sortQueries, difficultyLabel } from '../lib/difficulty';

export default function RASQLReference() {
  const [databases, setDatabases] = useState<Database[]>([]);
  const [selectedDb, setSelectedDb] = useState('');
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [queries, setQueries] = useState<Query[]>([]);
  const [details, setDetails] = useState<Record<string, Query>>({});

  useEffect(() => {
    api.healthCheck().then(() => setBackendOk(true)).catch(() => setBackendOk(false));
    api.getDatabases().then(setDatabases).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedDb) {
      api.getQueries(selectedDb).then((qs) => setQueries(sortQueries(qs))).catch(() => setQueries([]));
      setDetails({});
    }
  }, [selectedDb]);

  async function loadDetail(queryId: string) {
    if (details[queryId]) return;
    try {
      const detail = await api.getQueryDetail(selectedDb, queryId);
      setDetails((prev) => ({ ...prev, [queryId]: detail }));
    } catch { /* ignore */ }
  }

  if (backendOk === false) {
    return <AuthGate><StatusBadge variant="error">❌ Backend service connection failed</StatusBadge></AuthGate>;
  }

  return (
    <AuthGate>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">🔄 RA ↔ SQL Reference</h1>
          <p className="mt-1 text-gray-600">Explore side-by-side relational algebra and SQL solutions to build intuition for translating between both representations.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <aside className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase">📊 Select Database</h2>
            <select
              value={selectedDb}
              onChange={(e) => setSelectedDb(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">- Select -</option>
              {databases.map((db) => (
                <option key={db.name} value={db.name}>{db.name}</option>
              ))}
            </select>
          </aside>

          <div className="md:col-span-3 space-y-4">
            {!selectedDb ? (
              <StatusBadge variant="info">Select a database from the sidebar to continue.</StatusBadge>
            ) : queries.length === 0 ? (
              <StatusBadge variant="info">This database does not have any cataloged exercises yet.</StatusBadge>
            ) : (
              <>
                <h2 className="text-xl font-semibold text-gray-800">📘 Exercises for <code className="bg-gray-100 px-1.5 py-0.5 rounded">{selectedDb}</code></h2>
                <div className="space-y-3">
                  {queries.map((q) => {
                    const prompt = (q.prompt ?? q.id ?? '').length > 80 ? (q.prompt ?? '').slice(0, 77) + '...' : q.prompt;
                    const detail = details[q.id];
                    return (
                      <Collapsible key={q.id} title={`${prompt} · ${difficultyLabel(q.difficulty)}`}>
                        <div className="space-y-4" onMouseEnter={() => loadDetail(q.id)}>
                          <p className="text-sm"><span className="font-semibold">Prompt:</span> {q.prompt ?? 'No prompt provided.'}</p>
                          {q.hints?.length ? (
                            <div className="text-sm">
                              <span className="font-semibold">Hints:</span>
                              <ul className="list-disc list-inside ml-2">
                                {q.hints.map((h, i) => <li key={i}>{h}</li>)}
                              </ul>
                            </div>
                          ) : null}

                          {!detail ? (
                            <button
                              onClick={() => loadDetail(q.id)}
                              className="text-sm text-blue-600 hover:underline"
                            >
                              Load solutions...
                            </button>
                          ) : (
                            <>
                              {(detail.expected_schema || detail.expected_rows) && (
                                <Collapsible title="🎯 Expected Result">
                                  {detail.expected_schema && (
                                    <p className="text-sm mb-2"><span className="font-semibold">Schema:</span> {detail.expected_schema.join(', ')}</p>
                                  )}
                                  {detail.expected_rows?.length ? <DataTable rows={detail.expected_rows} /> : null}
                                </Collapsible>
                              )}

                              {detail.solution ? (
                                <div className="space-y-3">
                                  {detail.solution.relational_algebra && (
                                    <div>
                                      <p className="font-semibold text-sm text-gray-700 mb-1">Relational algebra expression:</p>
                                      <pre className="bg-gray-50 p-3 rounded text-sm font-mono overflow-x-auto">{detail.solution.relational_algebra}</pre>
                                    </div>
                                  )}
                                  {detail.solution.sql && (
                                    <div>
                                      <p className="font-semibold text-sm text-gray-700 mb-1">SQL query:</p>
                                      <pre className="bg-gray-50 p-3 rounded text-sm font-mono overflow-x-auto">{detail.solution.sql}</pre>
                                    </div>
                                  )}
                                  {!detail.solution.relational_algebra && !detail.solution.sql && (
                                    <StatusBadge variant="info">Reference entries are empty for this exercise.</StatusBadge>
                                  )}
                                </div>
                              ) : (
                                <StatusBadge variant="info">No reference solutions available for this exercise yet.</StatusBadge>
                              )}
                            </>
                          )}
                        </div>
                      </Collapsible>
                    );
                  })}
                </div>
              </>
            )}

            <hr className="border-gray-200" />
            <Collapsible title="🧭 Translation Tips">
              <div className="text-sm text-gray-700 space-y-1.5">
                <p>• <strong>Start with structure:</strong> Outline the relational algebra operators required, then identify their SQL counterparts.</p>
                <p>• <strong>Selection ↔ WHERE:</strong> Translate selections (σ) into WHERE clauses.</p>
                <p>• <strong>Projection ↔ SELECT:</strong> Projections (π) map to SELECT column lists.</p>
                <p>• <strong>Joins:</strong> Natural joins or specific join conditions translate to explicit JOIN ... ON ... clauses.</p>
                <p>• <strong>Set operations:</strong> Union (∪), difference (−), and intersection (∩) correspond to UNION, EXCEPT, and INTERSECT.</p>
                <p>• <strong>Aggregation:</strong> Use GROUP BY and HAVING to mirror grouping operators.</p>
              </div>
            </Collapsible>
          </div>
        </div>
      </div>
    </AuthGate>
  );
}
