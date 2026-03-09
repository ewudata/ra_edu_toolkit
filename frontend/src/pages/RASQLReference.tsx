import { useEffect, useState } from 'react';
import { api, type Database, type Query } from '../lib/api';
import StatusBadge from '../components/StatusBadge';
import Collapsible from '../components/Collapsible';
import DataTable from '../components/DataTable';
import { sortQueries, difficultyLabel } from '../lib/difficulty';
import {
  Database as DatabaseIcon,
  BookOpen,
} from 'lucide-react';

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
    return <StatusBadge variant="error">Backend service connection failed</StatusBadge>;
  }

  const shell = 'space-y-6 rounded-[28px] bg-[linear-gradient(180deg,rgba(246,245,253,0.72)_0%,rgba(244,246,252,0.84)_52%,rgba(247,250,249,0.9)_100%)] p-4 sm:p-6';
  const hero = 'rounded-[26px] border border-[#dde1f0] bg-[linear-gradient(135deg,#f5f4ff_0%,#eef2ff_52%,#eef7f4_100%)] p-6 text-[#3f4761] shadow-[0_14px_34px_rgba(123,128,173,0.1)]';
  const blockCard = 'rounded-[24px] border border-[#dfe2f0] bg-[rgba(255,255,255,0.82)] p-5 shadow-[0_12px_28px_rgba(123,128,173,0.08)]';
  const sectionLabel = 'text-xs font-semibold uppercase tracking-[0.22em] text-[#615a96]';
  const sectionTitle = 'text-xl font-semibold text-[#3f4761]';
  const iconTile = 'app-icon-tile flex h-12 w-12 items-center justify-center rounded-[18px]';
  const textInput = 'app-input w-full rounded-2xl bg-white/92 px-4 py-3 text-sm cursor-pointer';
  const secondaryButton = 'app-secondary-btn';

  return (
    <div className={shell}>
      <section className={hero}>
        <div className="space-y-3">
          <p className="text-sm font-bold uppercase tracking-[0.28em] text-[#615a96]">Academic Practice Studio</p>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#3f4761] sm:text-4xl">RA ↔ SQL Reference</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#475467] sm:text-base">
              Explore side-by-side relational algebra and SQL solutions to build intuition for translating between both representations.
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className={`${blockCard} space-y-4`}>
          <div className="flex items-center gap-3">
            <div className={iconTile}>
              <DatabaseIcon className="app-icon-glyph h-5 w-5" />
            </div>
            <div>
              <p className={sectionLabel}>Setup</p>
              <h2 className={sectionTitle}>Select Database</h2>
            </div>
          </div>
          <p className="text-sm leading-6 text-[#475467]">
            Choose a dataset to load cataloged exercises, expected results, and paired reference solutions.
          </p>
          <select
            value={selectedDb}
            onChange={(e) => {
              setSelectedDb(e.target.value);
              setDetails({});
            }}
            className={textInput}
          >
            <option value="">- Select -</option>
            {databases.map((db) => (
              <option key={db.name} value={db.name}>{db.name}</option>
            ))}
          </select>
        </aside>

        <div className="space-y-4">
          {!selectedDb ? (
            <StatusBadge variant="info">Select a database from the setup panel to continue.</StatusBadge>
          ) : queries.length === 0 ? (
            <StatusBadge variant="info">This database does not have any cataloged exercises yet.</StatusBadge>
          ) : (
            <>
              <div className={blockCard}>
                <div className="flex items-center gap-3">
                  <div className={iconTile}>
                    <BookOpen className="app-icon-glyph h-5 w-5" />
                  </div>
                  <div>
                    <p className={sectionLabel}>Reference Catalog</p>
                    <h2 className={sectionTitle}>
                      Exercises for <code className="rounded-xl border border-[#cbeae3] bg-[#f3fbf8] px-2 py-1 text-sm font-mono text-[#3d6f67]">{selectedDb}</code>
                    </h2>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                {queries.map((q) => {
                  const prompt = (q.prompt ?? q.id ?? '').length > 80 ? `${(q.prompt ?? '').slice(0, 77)}...` : q.prompt;
                  const detail = details[q.id];
                  return (
                    <Collapsible key={q.id} title={`${prompt} · ${difficultyLabel(q.difficulty)}`}>
                      <div className="space-y-4" onMouseEnter={() => loadDetail(q.id)}>
                        <p className="text-sm text-[#475467]"><span className="font-semibold text-[#344054]">Prompt:</span> {q.prompt ?? 'No prompt provided.'}</p>
                        {q.hints?.length ? (
                          <div className="text-sm">
                            <span className="font-semibold text-[#344054]">Hints:</span>
                            <ul className="ml-2 list-disc list-inside text-[#475467]">
                              {q.hints.map((h, i) => <li key={i}>{h}</li>)}
                            </ul>
                          </div>
                        ) : null}

                        {!detail ? (
                          <button
                            onClick={() => loadDetail(q.id)}
                            className={secondaryButton}
                          >
                            Load solutions...
                          </button>
                        ) : (
                          <>
                            {(detail.expected_schema || detail.expected_rows) && (
                              <Collapsible title="Expected Result">
                                {detail.expected_schema && (
                                  <p className="mb-2 text-sm"><span className="font-semibold text-[#344054]">Schema:</span> <span className="font-mono text-xs text-[#475467]">{detail.expected_schema.join(', ')}</span></p>
                                )}
                                {detail.expected_rows?.length ? <DataTable rows={detail.expected_rows} /> : null}
                              </Collapsible>
                            )}

                            {detail.solution ? (
                              <div className="space-y-3">
                                {detail.solution.relational_algebra && (
                                  <div>
                                    <p className="mb-1 text-sm font-semibold text-[#344054]">Relational algebra expression:</p>
                                    <pre className="app-code overflow-x-auto p-3 text-sm text-[#344054]">{detail.solution.relational_algebra}</pre>
                                  </div>
                                )}
                                {detail.solution.sql && (
                                  <div>
                                    <p className="mb-1 text-sm font-semibold text-[#344054]">SQL query:</p>
                                    <pre className="app-code overflow-x-auto p-3 text-sm text-[#344054]">{detail.solution.sql}</pre>
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

          <div className={blockCard}>
            <Collapsible title="Translation Tips">
              <div className="space-y-1.5 text-sm text-[#475467]">
                <p className="flex items-start gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#74c8b8]" /> <span><strong className="text-[#344054]">Start with structure:</strong> Outline the relational algebra operators required, then identify their SQL counterparts.</span></p>
                <p className="flex items-start gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#74c8b8]" /> <span><strong className="text-[#344054]">Selection ↔ WHERE:</strong> Translate selections (σ) into WHERE clauses.</span></p>
                <p className="flex items-start gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#74c8b8]" /> <span><strong className="text-[#344054]">Projection ↔ SELECT:</strong> Projections (π) map to SELECT column lists.</span></p>
                <p className="flex items-start gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#74c8b8]" /> <span><strong className="text-[#344054]">Joins:</strong> Natural joins or specific join conditions translate to explicit JOIN ... ON ... clauses.</span></p>
                <p className="flex items-start gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#74c8b8]" /> <span><strong className="text-[#344054]">Set operations:</strong> Union (∪), difference (−), and intersection (∩) correspond to UNION, EXCEPT, and INTERSECT.</span></p>
                <p className="flex items-start gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#74c8b8]" /> <span><strong className="text-[#344054]">Aggregation:</strong> Use GROUP BY and HAVING to mirror grouping operators.</span></p>
              </div>
            </Collapsible>
          </div>
        </div>
      </div>
    </div>
  );
}
