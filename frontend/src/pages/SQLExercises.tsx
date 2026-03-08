import { useEffect, useState, type FormEvent } from 'react';
import { api, type Database, type Query, type EvaluationResult } from '../lib/api';
import AuthGate from '../components/AuthGate';
import StatusBadge from '../components/StatusBadge';
import Collapsible from '../components/Collapsible';
import ResultViewer from '../components/ResultViewer';
import DataTable from '../components/DataTable';
import { sortQueries, difficultyLabel } from '../lib/difficulty';
import {
  BrainCircuit,
  Database as DatabaseIcon,
  ClipboardList,
  Pencil,
  Send,
  BookOpen,
  Target,
  FileText,
} from 'lucide-react';

export default function SQLExercises() {
  const [databases, setDatabases] = useState<Database[]>([]);
  const [selectedDb, setSelectedDb] = useState('');
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [queries, setQueries] = useState<Query[]>([]);
  const [selectedQueryId, setSelectedQueryId] = useState('');
  const [queryDetail, setQueryDetail] = useState<Query | null>(null);

  const [answer, setAnswer] = useState('');
  const [sqlDraft, setSqlDraft] = useState('');
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.healthCheck().then(() => setBackendOk(true)).catch(() => setBackendOk(false));
    api.getDatabases().then(setDatabases).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedDb) {
      api.getQueries(selectedDb).then((qs) => setQueries(sortQueries(qs))).catch(() => setQueries([]));
      setSelectedQueryId('');
      setQueryDetail(null);
      setResult(null);
      setError(null);
    }
  }, [selectedDb]);

  useEffect(() => {
    if (selectedQueryId && selectedDb) {
      api.getQueryDetail(selectedDb, selectedQueryId).then(setQueryDetail).catch(() => {});
      setResult(null);
      setError(null);
      setAnswer('');
      setSqlDraft('');
    }
  }, [selectedQueryId, selectedDb]);

  const selectedQuery = queries.find((q) => q.id === selectedQueryId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!answer.trim()) { setError('Please enter your answer'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.evaluateQuery(selectedDb, selectedQueryId, answer.trim());
      setResult(res);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (backendOk === false) {
    return <AuthGate><StatusBadge variant="error">Backend service connection failed</StatusBadge></AuthGate>;
  }

  return (
    <AuthGate>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">SQL Exercises</h1>
          <p className="mt-1 text-sm text-slate-500">Practice SQL alongside relational algebra to strengthen your database query skills.</p>
        </div>
        {backendOk && <StatusBadge variant="success">Backend service connected successfully</StatusBadge>}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <aside className="space-y-4">
            <div className="flex items-center gap-2">
              <DatabaseIcon className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Select Database</h2>
            </div>
            <select
              value={selectedDb}
              onChange={(e) => setSelectedDb(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary cursor-pointer"
            >
              <option value="">- Select -</option>
              {databases.map((db) => (
                <option key={db.name} value={db.name}>{db.name}</option>
              ))}
            </select>
            {selectedDb && <StatusBadge variant="success">Selected: {selectedDb}</StatusBadge>}
          </aside>

          <div className="md:col-span-3 space-y-6">
            {!selectedDb ? (
              <StatusBadge variant="warning">Please select a database from the sidebar first</StatusBadge>
            ) : queries.length === 0 ? (
              <StatusBadge variant="info">No practice queries available for this database</StatusBadge>
            ) : (
              <>
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <ClipboardList className="w-4 h-4 text-primary" />
                    <h2 className="text-lg font-semibold text-slate-700">Select Exercise</h2>
                  </div>
                  <select
                    value={selectedQueryId}
                    onChange={(e) => setSelectedQueryId(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary cursor-pointer"
                  >
                    <option value="">- Select a query -</option>
                    {queries.map((q) => {
                      const prompt = (q.prompt ?? '').length > 80 ? q.prompt!.slice(0, 77) + '...' : q.prompt;
                      return <option key={q.id} value={q.id}>{prompt} [{q.id}] - {difficultyLabel(q.difficulty)}</option>;
                    })}
                  </select>
                </section>

                {selectedQuery && queryDetail && (
                  <>
                    <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                      <div className="flex items-center gap-2">
                        <ClipboardList className="w-4 h-4 text-primary" />
                        <h2 className="text-base font-semibold text-slate-700">Exercise Problem</h2>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2 space-y-1.5 text-sm">
                          <p className="text-slate-600"><span className="font-semibold text-slate-700">Query ID:</span> {selectedQuery.id}</p>
                          <p className="text-slate-600"><span className="font-semibold text-slate-700">Query Description:</span> {selectedQuery.prompt}</p>
                          <p className="text-slate-600"><span className="font-semibold text-slate-700">Difficulty:</span> {difficultyLabel(selectedQuery.difficulty)}</p>
                          {selectedQuery.hints?.length ? (
                            <div>
                              <span className="font-semibold text-slate-700">Hints:</span>
                              <ul className="list-disc list-inside ml-2 text-slate-500">
                                {selectedQuery.hints.map((h, i) => <li key={i}>{h}</li>)}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                        <div>
                          {queryDetail.hints?.length ? (
                            <Collapsible title="Hints">
                              <ol className="list-decimal list-inside text-sm space-y-1 text-slate-600">
                                {queryDetail.hints.map((h, i) => <li key={i}>{h}</li>)}
                              </ol>
                            </Collapsible>
                          ) : null}
                        </div>
                      </div>
                    </section>

                    <form onSubmit={handleSubmit} className="space-y-3">
                      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700">
                        <Pencil className="w-4 h-4 text-primary" />
                        Your Relational Algebra Answer
                      </h2>
                      <textarea
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        placeholder="Enter your relational algebra expression..."
                        className="w-full h-36 px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary/30 focus:border-primary resize-y transition-colors"
                      />
                      <div className="flex justify-center">
                        <button
                          type="submit"
                          disabled={submitting}
                          className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          <Send className="w-4 h-4" />
                          {submitting ? 'Evaluating...' : 'Submit Answer'}
                        </button>
                      </div>
                    </form>

                    {error && <StatusBadge variant="error">{error}</StatusBadge>}

                    {result && (
                      <div className="space-y-4">
                        <StatusBadge variant="success">Answer submitted successfully!</StatusBadge>
                        <ResultViewer result={result} />

                        {(queryDetail.solution?.relational_algebra || queryDetail.solution?.sql) && (
                          <Collapsible title="View Standard Answers">
                            {queryDetail.solution?.relational_algebra && (
                              <div className="mb-3">
                                <p className="font-semibold text-sm text-slate-600 mb-1">Relational algebra expression:</p>
                                <pre className="bg-slate-50 p-3 rounded-lg text-sm font-mono overflow-x-auto text-slate-700">{queryDetail.solution.relational_algebra}</pre>
                              </div>
                            )}
                            {queryDetail.solution?.sql && (
                              <div>
                                <p className="font-semibold text-sm text-slate-600 mb-1">SQL query:</p>
                                <pre className="bg-slate-50 p-3 rounded-lg text-sm font-mono overflow-x-auto text-slate-700">{queryDetail.solution.sql}</pre>
                              </div>
                            )}
                          </Collapsible>
                        )}

                        {(queryDetail.expected_schema || queryDetail.expected_rows) && (
                          <Collapsible title="Expected Results">
                            {queryDetail.expected_schema && (
                              <p className="text-sm mb-2"><span className="font-semibold text-slate-600">Expected schema:</span> <span className="text-slate-500 font-mono text-xs">{queryDetail.expected_schema.join(', ')}</span></p>
                            )}
                            {queryDetail.expected_rows?.length ? <DataTable rows={queryDetail.expected_rows} /> : null}
                          </Collapsible>
                        )}
                      </div>
                    )}

                    <hr className="border-slate-200" />
                    <div>
                      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 mb-2">
                        <FileText className="w-4 h-4 text-slate-400" />
                        Your SQL Answer (optional)
                      </h2>
                      <textarea
                        value={sqlDraft}
                        onChange={(e) => setSqlDraft(e.target.value)}
                        placeholder="Write your SQL query here..."
                        className="w-full h-36 px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary/30 focus:border-primary resize-y transition-colors"
                      />
                    </div>

                    <Collapsible title="Learning Resources">
                      <div className="text-sm text-slate-600 space-y-3">
                        <div>
                          <h4 className="font-semibold text-slate-700">Relational Algebra Basics</h4>
                          <ul className="list-disc list-inside space-y-0.5 text-slate-500">
                            <li><strong>Projection (π):</strong> Select specific columns</li>
                            <li><strong>Selection (σ):</strong> Filter rows based on conditions</li>
                            <li><strong>Join (⋈):</strong> Combine two tables</li>
                            <li><strong>Union (∪):</strong> Combine results from two queries</li>
                            <li><strong>Difference (−):</strong> Subtract one query result from another</li>
                          </ul>
                        </div>
                        <div>
                          <h4 className="font-semibold text-slate-700">SQL Reminders</h4>
                          <ul className="list-disc list-inside space-y-0.5 text-slate-500">
                            <li>Use <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">SELECT ... FROM ...</code> to choose columns and tables</li>
                            <li>Filter rows with <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">WHERE</code> clauses</li>
                            <li>Combine tables using <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">JOIN</code> statements</li>
                            <li>Aggregate with <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">GROUP BY</code> and filter in <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">HAVING</code></li>
                          </ul>
                        </div>
                        <div>
                          <h4 className="font-semibold text-slate-700">Problem-Solving Tips</h4>
                          <ol className="list-decimal list-inside space-y-0.5 text-slate-500">
                            <li>Understand the problem: Identify the required output schema and filters</li>
                            <li>Analyze the data: Review available relations and key attributes</li>
                            <li>Break down the problem: Decompose complex queries into smaller steps</li>
                            <li>Build step by step: Draft the relational algebra, then translate to SQL</li>
                            <li>Verify results: Ensure your answer matches the expected schema and rows</li>
                          </ol>
                        </div>
                      </div>
                    </Collapsible>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </AuthGate>
  );
}
