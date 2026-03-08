import { useEffect, useState, useCallback, useRef, type FormEvent } from 'react';
import { api, type Database, type TableInfo } from '../lib/api';
import AuthGate from '../components/AuthGate';
import StatusBadge from '../components/StatusBadge';
import Collapsible from '../components/Collapsible';
import TablePreview from '../components/TablePreview';

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
      setImportMsg({ type: 'success', text: `✅ Successfully imported database: ${result.name}` });
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
      setImportMsg({ type: 'success', text: `✅ Successfully imported database: ${result.name}` });
      form.reset();
      loadDatabases();
    } catch (e) {
      setImportMsg({ type: 'error', text: `Import failed: ${e}` });
    }
  }

  return (
    <AuthGate>
      <div className="space-y-8">
        <h1 className="text-3xl font-bold text-gray-900">🗄️ Database Manager</h1>

        {error && <StatusBadge variant="error">❌ Backend connection failed: {error}</StatusBadge>}
        {importMsg && (
          <StatusBadge variant={importMsg.type === 'success' ? 'success' : 'error'}>
            {importMsg.text}
          </StatusBadge>
        )}

        <section>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">📊 Existing Databases</h2>
          {loading ? (
            <div className="flex items-center gap-2 text-gray-500">
              <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
              Loading...
            </div>
          ) : databases.length === 0 ? (
            <StatusBadge variant="info">No databases available</StatusBadge>
          ) : (
            <div className="space-y-3">
              {databases.map((db) => (
                <Collapsible key={db.name} title={`🗃️ ${db.name} (${db.table_count} tables)`}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <h4 className="font-medium text-gray-700">Table list</h4>
                        <button
                          onClick={() => loadSchema(db.name)}
                          className="text-xs px-2.5 py-1 border border-gray-300 rounded hover:bg-gray-100 transition-colors"
                        >
                          {schemas[db.name] ? 'Refresh' : 'Load'} previews
                        </button>
                      </div>
                      {schemaErrors[db.name] && (
                        <p className="text-sm text-amber-700 mb-2">⚠️ Previews unavailable: {schemaErrors[db.name]}</p>
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
                      <h4 className="font-medium text-gray-700">Statistics</h4>
                      <p>• Table count: {db.table_count}</p>
                      <p>• Database name: {db.name}</p>
                      <p>• Default dataset: {db.is_default ? 'Yes' : 'No'}</p>
                      {!(db.is_default && PROTECTED.has(db.name.toLowerCase())) && (
                        <button
                          onClick={() => handleDelete(db)}
                          className="mt-2 text-sm px-3 py-1.5 border border-red-300 text-red-700 rounded-md hover:bg-red-50 transition-colors"
                        >
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

        <hr className="border-gray-200" />

        <section>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">📥 Import New Database</h2>

          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h3 className="font-semibold text-gray-800 mb-3">Import from ZIP File</h3>
              <Collapsible title="💡 ZIP Import Help">
                <div className="text-sm text-gray-600 space-y-2">
                  <p>ZIP file should contain multiple CSV files. Each CSV file represents a table. File name (without extension) will be used as table name.</p>
                  <pre className="bg-gray-50 p-3 rounded text-xs">{`database.zip\n├── students.csv\n├── courses.csv\n└── enrollments.csv`}</pre>
                </div>
              </Collapsible>
              <form onSubmit={handleZipImport} className="mt-3 space-y-3">
                <input ref={zipFileRef} type="file" accept=".zip" className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-gray-300 file:text-sm file:bg-gray-50 hover:file:bg-gray-100" />
                <input name="zipName" type="text" defaultValue="NewDatabase" className="block w-full sm:w-64 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Database name" />
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors font-medium">
                  Import ZIP Database
                </button>
              </form>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h3 className="font-semibold text-gray-800 mb-3">Import from SQL File</h3>
              <Collapsible title="💡 SQL Import Help">
                <div className="text-sm text-gray-600 space-y-1">
                  <p>File must be UTF-8 encoded. Should contain CREATE TABLE statements. May contain INSERT statements to insert data. Supports standard SQLite syntax.</p>
                </div>
              </Collapsible>
              <form onSubmit={handleSqlImport} className="mt-3 space-y-3">
                <input ref={sqlFileRef} type="file" accept=".sql" className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-gray-300 file:text-sm file:bg-gray-50 hover:file:bg-gray-100" />
                <input name="sqlName" type="text" defaultValue="SQLDatabase" className="block w-full sm:w-64 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Database name" />
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors font-medium">
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
