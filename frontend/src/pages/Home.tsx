import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import AuthGate from '../components/AuthGate';
import StatusBadge from '../components/StatusBadge';
import Collapsible from '../components/Collapsible';
import SyntaxHelp from '../components/SyntaxHelp';
import {
  Database,
  FunctionSquare,
  BrainCircuit,
  ArrowLeftRight,
  Activity,
  HardDrive,
  BookOpen,
} from 'lucide-react';

const FEATURES = [
  {
    icon: Database,
    title: 'Database Manager',
    to: '/databases',
    color: 'text-blue-600 bg-blue-50',
    items: ['CSV/ZIP file import', 'SQL script import', 'Database browsing', 'Table structure viewing'],
  },
  {
    icon: FunctionSquare,
    title: 'RA Exercises',
    to: '/ra-exercises',
    color: 'text-violet-600 bg-violet-50',
    items: ['Guided 3-step workflow', 'Pre-defined practice catalog', 'Custom expression workspace', 'Execution trace visualization'],
  },
  {
    icon: BrainCircuit,
    title: 'SQL Exercises',
    to: '/sql-exercises',
    color: 'text-amber-600 bg-amber-50',
    items: ['Curated practice problems', 'Automated RA checking', 'SQL solution references', 'Expected result walkthroughs'],
  },
  {
    icon: ArrowLeftRight,
    title: 'RA ↔ SQL Reference',
    to: '/ra-sql-reference',
    color: 'text-emerald-600 bg-emerald-50',
    items: ['Side-by-side solution explorer', 'Expected schema and data previews', 'Translation tips and heuristics', 'Database-scoped exercise catalog'],
  },
];

export default function Home() {
  const [health, setHealth] = useState<string | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [dbNames, setDbNames] = useState<string[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    api.healthCheck()
      .then((h) => setHealth(h.status))
      .catch((e) => setHealthError(String(e)));
    api.getDatabases()
      .then((dbs) => setDbNames(dbs.map((d) => d.name)))
      .catch((e) => setDbError(String(e)));
  }, []);

  return (
    <AuthGate>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Relational Algebra Education Toolkit</h1>
          <p className="mt-1.5 text-slate-500">
            Master relational algebra and SQL through hands-on practice, guided exercises, and side-by-side references.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-slate-700">Quick Start</h2>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-600">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
              <span><strong>Manage databases</strong> to import and organize learning data</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-500 mt-1.5 shrink-0" />
              <span><strong>Practice relational algebra</strong> with guided exercises</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
              <span><strong>Build SQL skills</strong> alongside RA understanding</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
              <span><strong>Translate</strong> between RA and SQL with references</span>
            </li>
          </ul>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-slate-700">System Status</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              {healthError ? (
                <StatusBadge variant="error">Backend service connection failed: {healthError}</StatusBadge>
              ) : health ? (
                <StatusBadge variant="success">Backend service is running — Status: {health}</StatusBadge>
              ) : (
                <StatusBadge variant="info">Checking backend...</StatusBadge>
              )}
            </div>
            <div>
              {dbError ? (
                <StatusBadge variant="warning">Unable to get database list: {dbError}</StatusBadge>
              ) : dbNames.length > 0 ? (
                <StatusBadge variant="success">
                  <span className="flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5" />
                    Found {dbNames.length} databases: {dbNames.join(', ')}
                  </span>
                </StatusBadge>
              ) : (
                <StatusBadge variant="info">Loading databases...</StatusBadge>
              )}
            </div>
          </div>
        </div>

        <div>
          <h2 className="font-semibold text-slate-700 mb-4">Feature Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <Link
                  key={feature.title}
                  to={feature.to}
                  className="group bg-white border border-slate-200 rounded-xl p-5 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${feature.color}`}>
                      <Icon className="w-[18px] h-[18px]" />
                    </div>
                    <h3 className="font-semibold text-slate-800 group-hover:text-primary transition-colors">{feature.title}</h3>
                  </div>
                  <ul className="text-sm text-slate-500 space-y-1">
                    {feature.items.map((item) => (
                      <li key={item} className="flex items-center gap-2">
                        <span className="w-1 h-1 rounded-full bg-slate-300" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </Link>
              );
            })}
          </div>
        </div>

        <Collapsible title="Detailed Usage Instructions">
          <div className="space-y-4 text-sm text-slate-600">
            <div>
              <h4 className="font-semibold text-slate-700 mb-1">Startup Guide</h4>
              <ol className="list-decimal list-inside space-y-1">
                <li><strong>Start Backend Service:</strong> <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">uvicorn backend.main:app --reload</code></li>
                <li><strong>Start Frontend Application:</strong> <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">npm run dev</code> in frontend-react/</li>
                <li><strong>Access Application:</strong> Open <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">http://localhost:5173</code> in your browser</li>
              </ol>
            </div>
            <SyntaxHelp database={dbNames[0]} />
            <div>
              <h4 className="font-semibold text-slate-700 mb-1">Troubleshooting</h4>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Backend connection failed:</strong> Ensure backend service is running</li>
                <li><strong>Query execution error:</strong> Check syntax and table names</li>
                <li><strong>Import failed:</strong> Ensure file format is correct and UTF-8 encoded</li>
              </ul>
            </div>
          </div>
        </Collapsible>
      </div>
    </AuthGate>
  );
}
