import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import AuthGate from '../components/AuthGate';
import StatusBadge from '../components/StatusBadge';
import Collapsible from '../components/Collapsible';
import SyntaxHelp from '../components/SyntaxHelp';

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
          <h1 className="text-3xl font-bold text-gray-900">🎓 Relational Algebra Education Toolkit</h1>
          <p className="mt-2 text-gray-600">
            Welcome to the Relational Algebra Education Toolkit!
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-2">
          <ul className="space-y-1.5 text-gray-700">
            <li>🗄️ <strong>Manage databases</strong> to import and organize learning data</li>
            <li>🧮 <strong>Practice relational algebra</strong> with guided, step-by-step exercises</li>
            <li>🧠 <strong>Build SQL skills</strong> alongside relational algebra understanding</li>
            <li>🔄 <strong>Translate</strong> between relational algebra and SQL using side-by-side references</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">🔗 System Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              {healthError ? (
                <StatusBadge variant="error">❌ Backend service connection failed: {healthError}</StatusBadge>
              ) : health ? (
                <StatusBadge variant="success">✅ Backend service is running normally — Status: {health}</StatusBadge>
              ) : (
                <StatusBadge variant="info">Checking backend...</StatusBadge>
              )}
            </div>
            <div>
              {dbError ? (
                <StatusBadge variant="warning">⚠️ Unable to get database list: {dbError}</StatusBadge>
              ) : dbNames.length > 0 ? (
                <StatusBadge variant="success">✅ Found {dbNames.length} databases: {dbNames.join(', ')}</StatusBadge>
              ) : (
                <StatusBadge variant="info">Loading databases...</StatusBadge>
              )}
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">🚀 Feature Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { icon: '🗄️', title: 'Database Manager', items: ['CSV/ZIP file import', 'SQL script import', 'Database browsing', 'Table structure viewing'] },
              { icon: '🧮', title: 'RA Exercises', items: ['Guided 3-step workflow', 'Pre-defined practice catalog', 'Custom expression workspace', 'Execution trace visualization'] },
              { icon: '🧠', title: 'SQL Exercises', items: ['Curated practice problems', 'Automated relational algebra checking', 'SQL solution references', 'Expected result walkthroughs'] },
              { icon: '🔄', title: 'RA ↔ SQL Reference', items: ['Side-by-side solution explorer', 'Expected schema and data previews', 'Translation tips and heuristics', 'Database-scoped exercise catalog'] },
            ].map((feature) => (
              <div key={feature.title} className="bg-white border border-gray-200 rounded-lg p-5">
                <h3 className="font-semibold text-gray-800 mb-2">{feature.icon} {feature.title}</h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  {feature.items.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <Collapsible title="📖 Detailed Usage Instructions">
          <div className="space-y-4 text-sm text-gray-700">
            <div>
              <h4 className="font-semibold mb-1">Startup Guide</h4>
              <ol className="list-decimal list-inside space-y-1">
                <li><strong>Start Backend Service:</strong> <code className="bg-gray-100 px-1 rounded">uvicorn backend.main:app --reload</code></li>
                <li><strong>Start Frontend Application:</strong> <code className="bg-gray-100 px-1 rounded">npm run dev</code> in frontend-react/</li>
                <li><strong>Access Application:</strong> Open <code className="bg-gray-100 px-1 rounded">http://localhost:5173</code> in your browser</li>
              </ol>
            </div>
            <SyntaxHelp database={dbNames[0]} />
            <div>
              <h4 className="font-semibold mb-1">Troubleshooting</h4>
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
