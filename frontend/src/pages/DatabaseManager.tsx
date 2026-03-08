import { useEffect, useState, useCallback, useRef, type FormEvent } from 'react';
import { api, type Database, type TableInfo } from '../lib/api';
import AuthGate from '../components/AuthGate';
import StatusBadge from '../components/StatusBadge';
import Collapsible from '../components/Collapsible';
import TablePreview from '../components/TablePreview';
import { HardDrive, Upload, FileArchive, FileCode, Trash2, RefreshCw, Info } from 'lucide-react';

const PROTECTED = new Set(['sales', 'university', 'testdb']);

export default function DatabaseManager() {
  const [databases, setDatabases] = useState<Database[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schemas, setSchemas] = useState<Record<string, Record<string, TableInfo>>>({});
  const [schemaErrors, setSchemaErrors] = useState<Record<string, string>>({});
  const [importMsg, setImportMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const zipFileRef = useRef<HTMLInputElement>(null);
  const sqlFileRef = useRef<HTMLInputElement>(null);

  const loadDatabases = useCallback(async () => {
    try {
      setLoading(true);
      await api.healthCheck();
      const dbs = await api.getDatabases();
      setDatabases(dbs);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDatabases(); }, [loadDatabases]);

  async function loadSchema(dbName: string) {
    try {
      const schema = await api.getDatabaseSchema(dbName, 5);
      setSchemas((prev) => ({
        ...prev,
        [dbName]: Object.fromEntries(schema.tables.map((t) => [t.name, t])),
      }));
      setSchemaErrors((prev) => { const n = { ...prev }; delete n[dbName]; return n; });
    } catch (e) {
      setSchemaErrors((prev) => ({ ...prev, [dbName]: String(e) }));
    }
  }

  async function handleDelete(db: Database) {
    try {
      await api.deleteDatabase(db.name);
      setImportMsg({ type: 'success', text: db.is_default ? `Hidden shared dataset: ${db.name}` : `Deleted database: ${db.name}` });
      loadDatabases();
    } catch (e) {
      setImportMsg({ type: 'error', text: `Delete failed: ${e}` });
    }
  }

  async function handleZipImport(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = (form.elements.namedItem('zipName') as HTMLInputElement).value.trim();
    const file = zipFileRef.current?.files?.[0];
    if (!file || !name) return;
    try {
      const result = await api.importDatabaseFromZip(name, file);
      setImportMsg({ type: 'success', text: `Successfully imported database: ${result.name}` });
      form.reset();
      loadDatabases();
    } catch (e) {
      setImportMsg({ type: 'error', text: `Import failed: ${e}` });
    }
  }

  async function handleSqlImport(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = (form.elements.namedItem('sqlName') as HTMLInputElement).value.trim();
    const file = sqlFileRef.current?.files?.[0];
    if (!file || !name) return;
    try {
      const result = await api.importDatabaseFromSql(name, file);
      setImportMsg({ type: 'success', text: `Successfully imported database: ${result.name}` });
      form.reset();
      loadDatabases();
    } catch (e) {
      setImportMsg({ type: 'error', text: `Import failed: ${e}` });
    }
  }

  return (
    <AuthGate>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Database Manager</h1>
          <p className="mt-1 text-sm text-slate-500">Import, browse, and manage your learning databases.</p>
        </div>

        {error && <StatusBadge variant="error">Backend connection failed: {error}</StatusBadge>}
        {importMsg && (
          <StatusBadge variant={importMsg.type === 'success' ? 'success' : 'error'}>
            {importMsg.text}
          </StatusBadge>
        )}

        <section>
          <div className="flex items-center gap-2 mb-4">
            <HardDrive className="w-4 h-4 text-primary" />
            <h2 className="text-lg font-semibold text-slate-700">Existing Databases</h2>
          </div>
          {loading ? (
            <div className="flex items-center gap-2.5 text-slate-500 py-4">
              <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
              <span className="text-sm">Loading databases...</span>
            </div>
          ) : databases.length === 0 ? (
            <StatusBadge variant="info">No databases available</StatusBadge>
          ) : (
            <div className="space-y-3">
              {databases.map((db) => (
                <Collapsible key={db.name} title={`${db.name} (${db.table_count} tables)`}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <h4 className="text-sm font-medium text-slate-600">Table list</h4>
                        <button
                          onClick={() => loadSchema(db.name)}
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors cursor-pointer text-slate-500"
                        >
                          <RefreshCw className="w-3 h-3" />
                          {schemas[db.name] ? 'Refresh' : 'Load'} previews
                        </button>
                      </div>
                      {schemaErrors[db.name] && (
                        <StatusBadge variant="warning">Previews unavailable: {schemaErrors[db.name]}</StatusBadge>
                      )}
                      <div className="space-y-0.5">
                        {db.tables.map((table) => (
                          <TablePreview
                            key={table}
                            tableName={table}
                            metadata={schemas[db.name]?.[table]}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2 text-sm">
                      <h4 className="font-medium text-slate-600">Statistics</h4>
                      <div className="space-y-1 text-slate-500">
                        <p className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-slate-300" /> Table count: {db.table_count}</p>
                        <p className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-slate-300" /> Database name: {db.name}</p>
                        <p className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-slate-300" /> Default dataset: {db.is_default ? 'Yes' : 'No'}</p>
                      </div>
                      {!(db.is_default && PROTECTED.has(db.name.toLowerCase())) && (
                        <button
                          onClick={() => handleDelete(db)}
                          className="mt-2 inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {db.is_default ? `Hide ${db.name}` : `Delete ${db.name}`}
                        </button>
                      )}
                    </div>
                  </div>
                </Collapsible>
              ))}
            </div>
          )}
        </section>

        <hr className="border-slate-200" />

        <section>
          <div className="flex items-center gap-2 mb-4">
            <Upload className="w-4 h-4 text-primary" />
            <h2 className="text-lg font-semibold text-slate-700">Import New Database</h2>
          </div>

          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileArchive className="w-4 h-4 text-blue-500" />
                <h3 className="font-semibold text-slate-700">Import from ZIP File</h3>
              </div>
              <Collapsible title="ZIP Import Help">
                <div className="text-sm text-slate-500 space-y-2">
                  <p>ZIP file should contain multiple CSV files. Each CSV file represents a table. File name (without extension) will be used as table name.</p>
                  <pre className="bg-slate-50 p-3 rounded-lg text-xs font-mono text-slate-600">{`database.zip\n├── students.csv\n├── courses.csv\n└── enrollments.csv`}</pre>
                </div>
              </Collapsible>
              <form onSubmit={handleZipImport} className="mt-3 space-y-3">
                <input ref={zipFileRef} type="file" accept=".zip" className="block w-full text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-slate-200 file:text-sm file:bg-slate-50 file:text-slate-600 hover:file:bg-slate-100 file:cursor-pointer" />
                <input name="zipName" type="text" defaultValue="NewDatabase" className="block w-full sm:w-64 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" placeholder="Database name" />
                <button type="submit" className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary-dark transition-colors font-medium cursor-pointer">
                  <Upload className="w-4 h-4" />
                  Import ZIP Database
                </button>
              </form>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileCode className="w-4 h-4 text-emerald-500" />
                <h3 className="font-semibold text-slate-700">Import from SQL File</h3>
              </div>
              <Collapsible title="SQL Import Help">
                <div className="text-sm text-slate-500 space-y-1">
                  <p>File must be UTF-8 encoded. Should contain CREATE TABLE statements. May contain INSERT statements to insert data. Supports standard SQLite syntax.</p>
                </div>
              </Collapsible>
              <form onSubmit={handleSqlImport} className="mt-3 space-y-3">
                <input ref={sqlFileRef} type="file" accept=".sql" className="block w-full text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-slate-200 file:text-sm file:bg-slate-50 file:text-slate-600 hover:file:bg-slate-100 file:cursor-pointer" />
                <input name="sqlName" type="text" defaultValue="SQLDatabase" className="block w-full sm:w-64 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" placeholder="Database name" />
                <button type="submit" className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary-dark transition-colors font-medium cursor-pointer">
                  <Upload className="w-4 h-4" />
                  Import SQL Database
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </AuthGate>
  );
}
