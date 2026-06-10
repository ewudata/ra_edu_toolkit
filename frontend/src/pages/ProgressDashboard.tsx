import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Database, type OperatorProgressItem, type OperatorProgressResponse } from '../lib/api';
import { getWorkingDatabase, setWorkingDatabase } from '../lib/workingDatabase';
import { BarChart3, CheckCircle2, Circle, Database as DatabaseIcon } from 'lucide-react';

const OPERATOR_INFO: Record<string, { label: string; symbol: string }> = {
  selection: { label: 'Selection', symbol: 'σ' },
  projection: { label: 'Projection', symbol: 'π' },
  rename: { label: 'Rename', symbol: 'ρ' },
  intersection: { label: 'Set Intersection', symbol: '∩' },
  union: { label: 'Set Union', symbol: '∪' },
  difference: { label: 'Set Difference', symbol: '−' },
  'cartesian product': { label: 'Cartesian Product', symbol: '×' },
  'natural join': { label: 'Natural Join', symbol: '⋈' },
  division: { label: 'Division', symbol: '÷' },
};

function operatorLabel(op: string): string {
  return OPERATOR_INFO[op]?.label ?? op.charAt(0).toUpperCase() + op.slice(1);
}

function operatorSymbol(op: string): string {
  return OPERATOR_INFO[op]?.symbol ?? op;
}

function MasteryBadge({ mastered, attempted, total }: { mastered: number; attempted: number; total: number }) {
  if (mastered === total && total > 0) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-[#d1fae5] px-2.5 py-0.5 text-xs font-semibold text-[#065f46]">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        Mastered
      </span>
    );
  }
  if (attempted > 0) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-[#fef3c7] px-2.5 py-0.5 text-xs font-semibold text-[#92400e]">
        In Progress
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 rounded-full bg-[#f3f4f6] px-2.5 py-0.5 text-xs font-semibold text-[#6b7280]">
      <Circle className="h-3 w-3" aria-hidden="true" />
      Not started
    </span>
  );
}

function OperatorCard({ item }: { item: OperatorProgressItem }) {
  const pct = Math.round((item.mastered / Math.max(item.total, 1)) * 100);
  const symbol = operatorSymbol(item.operator);
  const label = operatorLabel(item.operator);

  return (
    <div className="flex flex-col gap-3 rounded-[20px] border border-[#e4e7f2] bg-white/90 p-5 shadow-[0_6px_18px_rgba(123,128,173,0.07)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,#ede9fe_0%,#dbeafe_100%)] text-lg font-semibold text-[#4f46e5]">
            {symbol}
          </div>
          <div>
            <p className="font-semibold text-[#374151]">{label}</p>
            <p className="text-xs text-[#6b7280]">
              {item.mastered} mastered · {item.attempted - item.mastered > 0 ? `${item.attempted - item.mastered} in progress · ` : ''}{item.total - item.attempted} not started
            </p>
          </div>
        </div>
        <MasteryBadge mastered={item.mastered} attempted={item.attempted} total={item.total} />
      </div>

      <div className="space-y-1">
        <div className="h-2 w-full overflow-hidden rounded-full bg-[#f3f4f6]">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#8ddfd2_0%,#6ee7b7_100%)] transition-all duration-500"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label} progress: ${pct}%`}
          />
        </div>
        <p className="text-right text-xs font-medium text-[#6b7280]">{pct}%</p>
      </div>
    </div>
  );
}

export default function ProgressDashboard() {
  const dbSelectId = useId();
  const [databases, setDatabases] = useState<Database[]>([]);
  const [selectedDb, setSelectedDb] = useState(() => getWorkingDatabase());
  const [progress, setProgress] = useState<OperatorProgressResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getDatabases().then((dbs) => {
      setDatabases(dbs);
      const catalogDbs = new Set(dbs.filter((d) => d.has_catalog).map((d) => d.name));
      if (selectedDb && !catalogDbs.has(selectedDb)) {
        setSelectedDb('');
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedDb) {
      setProgress(null);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .getOperatorProgress(selectedDb)
      .then(setProgress)
      .catch((e: Error) => setError(e.message ?? 'Failed to load progress'))
      .finally(() => setLoading(false));
  }, [selectedDb]);

  const handleDbChange = (db: string) => {
    setSelectedDb(db);
    setWorkingDatabase(db);
    setProgress(null);
  };

  const masteredOps = progress?.items.filter((i) => i.mastered === i.total && i.total > 0).length ?? 0;
  const attemptedOps = progress?.items.filter((i) => i.attempted > 0).length ?? 0;
  const totalOps = progress?.items.length ?? 0;
  const overallPct = progress
    ? Math.round((progress.mastered_queries / Math.max(progress.total_queries, 1)) * 100)
    : 0;

  const shell =
    'space-y-6 rounded-[28px] bg-[linear-gradient(180deg,rgba(246,245,253,0.72)_0%,rgba(244,246,252,0.84)_52%,rgba(247,250,249,0.9)_100%)] p-4 sm:p-6';
  const card =
    'rounded-[24px] border border-[#dfe2f0] bg-[rgba(255,255,255,0.82)] p-5 shadow-[0_12px_28px_rgba(123,128,173,0.08)]';
  const sectionLabel = 'text-xs font-semibold uppercase tracking-[0.22em] text-[#615a96]';

  return (
    <div className={shell}>
      <section className="rounded-[26px] border border-[#dde1f0] bg-[linear-gradient(135deg,#f5f4ff_0%,#eef2ff_52%,#eef7f4_100%)] p-6 text-[#3f4761] shadow-[0_14px_34px_rgba(123,128,173,0.1)]">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,#c7d2fe_0%,#a5f3fc_100%)] shadow-[0_8px_16px_rgba(141,223,210,0.28)]">
            <BarChart3 className="h-6 w-6 text-[#4f46e5]" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.28em] text-[#615a96]">Learning Progress</p>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-[#3f4761] sm:text-4xl">
              My Progress
            </h1>
          </div>
        </div>
      </section>

      <section className={card}>
        <p className={sectionLabel}>Database</p>
        <div className="mt-2 flex items-center gap-3">
          <DatabaseIcon className="h-4 w-4 shrink-0 text-[#615a96]" aria-hidden="true" />
          <label htmlFor={dbSelectId} className="sr-only">Select database</label>
          <select
            id={dbSelectId}
            value={selectedDb ?? ''}
            onChange={(e) => handleDbChange(e.target.value)}
            className="app-select w-full max-w-xs"
          >
            <option value="" disabled>Select a database…</option>
            {databases.map((db) => (
              <option key={db.name} value={db.name} disabled={!db.has_catalog}>
                {db.name}{!db.has_catalog ? ' (no practice queries)' : ''}
              </option>
            ))}
          </select>
        </div>
      </section>

      {selectedDb && (
        <>
          {loading && (
            <p className="text-center text-sm text-[#6b7280]">Loading progress…</p>
          )}

          {error && (
            <p className="rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          {progress && !loading && (
            <>
              <section className={card}>
                <p className={sectionLabel}>Overall</p>
                <div className="mt-3 flex flex-wrap gap-6">
                  <div className="text-center">
                    <p className="font-display text-4xl font-semibold text-[#3f4761]">
                      {progress.attempted_queries}
                      <span className="text-2xl text-[#9ca3af]"> / {progress.total_queries}</span>
                    </p>
                    <p className="mt-1 text-xs text-[#6b7280]">Queries attempted</p>
                  </div>
                  <div className="text-center">
                    <p className="font-display text-4xl font-semibold text-[#3f4761]">
                      {progress.mastered_queries}
                      <span className="text-2xl text-[#9ca3af]"> / {progress.total_queries}</span>
                    </p>
                    <p className="mt-1 text-xs text-[#6b7280]">Queries mastered</p>
                  </div>
                  <div className="text-center">
                    <p className="font-display text-4xl font-semibold text-[#3f4761]">
                      {attemptedOps}
                      <span className="text-2xl text-[#9ca3af]"> / {totalOps}</span>
                    </p>
                    <p className="mt-1 text-xs text-[#6b7280]">Operators attempted</p>
                  </div>
                  <div className="text-center">
                    <p className="font-display text-4xl font-semibold text-[#3f4761]">
                      {masteredOps}
                      <span className="text-2xl text-[#9ca3af]"> / {totalOps}</span>
                    </p>
                    <p className="mt-1 text-xs text-[#6b7280]">Operators fully covered</p>
                  </div>
                </div>

                <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-[#f3f4f6]">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#8ddfd2_0%,#6ee7b7_100%)] transition-all duration-700"
                    style={{ width: `${overallPct}%` }}
                    role="progressbar"
                    aria-valuenow={overallPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Overall progress: ${overallPct}%`}
                  />
                </div>
              </section>

              <section className={card}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className={sectionLabel}>Operators</p>
                    <h2 className="mt-1 text-xl font-semibold text-[#3f4761]">Progress by operator</h2>
                  </div>
                  <Link
                    to="/ra-exercises"
                    className="app-primary-btn shrink-0 !rounded-2xl !px-4 !py-2"
                  >
                    Go practice
                  </Link>
                </div>
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {progress.items.map((item) => (
                    <OperatorCard key={item.operator} item={item} />
                  ))}
                </div>
              </section>
            </>
          )}

          {progress && progress.items.length === 0 && !loading && (
            <p className="text-center text-sm text-[#6b7280]">
              No practice queries found for <strong>{selectedDb}</strong>.
            </p>
          )}
        </>
      )}
    </div>
  );
}
