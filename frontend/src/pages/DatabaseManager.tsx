import { useEffect, useState, useCallback, useRef, type FormEvent } from 'react';
import { api, type Database, type TableInfo } from '../lib/api';
import StatusBadge from '../components/StatusBadge';
import Collapsible from '../components/Collapsible';
import TablePreview from '../components/TablePreview';
import { HardDrive, Upload, FileArchive, FileCode, Trash2, RefreshCw } from 'lucide-react';

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
      setSchemaErrors((prev) => {
        const next = { ...prev };
        delete next[dbName];
        return next;
      });
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

  const shell = 'space-y-6 rounded-[28px] bg-[linear-gradient(180deg,rgba(246,245,253,0.72)_0%,rgba(244,246,252,0.84)_52%,rgba(247,250,249,0.9)_100%)] p-4 sm:p-6';
  const hero = 'rounded-[26px] border border-[#dde1f0] bg-[linear-gradient(135deg,#f5f4ff_0%,#eef2ff_52%,#eef7f4_100%)] p-6 text-[#3f4761] shadow-[0_14px_34px_rgba(123,128,173,0.1)]';
  const blockCard = 'rounded-[24px] border border-[#dfe2f0] bg-[rgba(255,255,255,0.82)] p-5 shadow-[0_12px_28px_rgba(123,128,173,0.08)]';
  const softCard = 'rounded-[20px] border border-[#e4e7f2] bg-[rgba(255,255,255,0.9)] p-5 shadow-[0_8px_22px_rgba(123,128,173,0.06)]';
  const sectionLabel = 'text-xs font-semibold uppercase tracking-[0.22em] text-[#7d77ad]';
  const sectionTitle = 'text-xl font-semibold text-[#3f4761]';
  const iconTile = 'flex h-12 w-12 items-center justify-center rounded-[18px] border border-[#d8d4fb] bg-[#f1f0ff]';
  const secondaryButton = 'inline-flex items-center justify-center gap-2 rounded-2xl border border-[#d8dded] bg-[rgba(255,255,255,0.88)] px-4 py-2 text-sm font-semibold text-[#55607d] transition-colors duration-200 hover:bg-[#f3f4fd] cursor-pointer';
  const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-2xl border border-[#7b75c2] bg-[#7f78c7] px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#6e68b1] disabled:opacity-50 cursor-pointer';
  const textInput = 'block w-full rounded-2xl border border-[#d8dded] bg-white/92 px-4 py-3 text-sm text-[#3f4761] focus:border-[#9791e0] focus:outline-none focus:ring-4 focus:ring-[rgba(199,195,242,0.5)] transition-colors';

  return (
    <div className={shell}>
      <section className={hero}>
        <div className="space-y-3">
          <p className="text-sm font-bold uppercase tracking-[0.28em] text-[#7d77ad]">Academic Practice Studio</p>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#3f4761] sm:text-4xl">Database Manager</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#68718c] sm:text-base">
              Import, browse, and manage your learning databases in the same study-ready workspace used across the toolkit.
            </p>
          </div>
        </div>
      </section>

      {error && <StatusBadge variant="error">Backend connection failed: {error}</StatusBadge>}
      {importMsg && (
        <StatusBadge variant={importMsg.type === 'success' ? 'success' : 'error'}>
          {importMsg.text}
        </StatusBadge>
      )}

      <section className={blockCard}>
        <div className="mb-4 flex items-center gap-3">
          <div className={iconTile}>
            <HardDrive className="h-5 w-5 text-[#6e68b1]" />
          </div>
          <div>
            <p className={sectionLabel}>Catalog</p>
            <h2 className={sectionTitle}>Existing databases</h2>
          </div>
        </div>
        <p className="mb-4 max-w-3xl text-sm leading-6 text-[#68718c]">
          Review available datasets, inspect their relations, and remove non-protected collections when they are no longer needed.
        </p>
        {loading ? (
          <div className={`${softCard} flex items-center gap-2.5 py-4 text-[#68718c]`}>
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#7f78c7] border-t-transparent" />
            <span className="text-sm">Loading databases...</span>
          </div>
        ) : databases.length === 0 ? (
          <StatusBadge variant="info">No databases available</StatusBadge>
        ) : (
          <div className="space-y-3">
            {databases.map((db) => (
              <Collapsible key={db.name} title={`${db.name} (${db.table_count} tables)`}>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <h4 className="text-sm font-medium text-[#55607d]">Table list</h4>
                      <button
                        onClick={() => loadSchema(db.name)}
                        className={`${secondaryButton} !rounded-xl !px-2.5 !py-1 text-xs`}
                      >
                        <RefreshCw className="h-3 w-3" />
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
                  <div className={`${softCard} space-y-2 text-sm`}>
                    <h4 className="font-medium text-[#55607d]">Statistics</h4>
                    <div className="space-y-1 text-[#68718c]">
                      <p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#8cb7aa]" /> Table count: {db.table_count}</p>
                      <p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#8cb7aa]" /> Database name: {db.name}</p>
                      <p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#8cb7aa]" /> Default dataset: {db.is_default ? 'Yes' : 'No'}</p>
                    </div>
                    {!(db.is_default && PROTECTED.has(db.name.toLowerCase())) && (
                      <button
                        onClick={() => handleDelete(db)}
                        className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-2xl border border-[#e4c8cc] bg-[#fff2f3] px-4 py-2 text-sm font-semibold text-[#8b5e68] transition-colors duration-200 hover:bg-[#fde7ea]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
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

      <section className={blockCard}>
        <div className="mb-4 flex items-center gap-3">
          <div className={iconTile}>
            <Upload className="h-5 w-5 text-[#6e68b1]" />
          </div>
          <div>
            <p className={sectionLabel}>Import</p>
            <h2 className={sectionTitle}>Import new database</h2>
          </div>
        </div>
        <p className="mb-4 max-w-3xl text-sm leading-6 text-[#68718c]">
          Add new practice datasets from ZIP or SQL sources without leaving the same page-level study layout.
        </p>

        <div className="space-y-4">
          <div className={softCard}>
            <div className="mb-3 flex items-center gap-2">
              <FileArchive className="h-4 w-4 text-[#6e68b1]" />
              <h3 className="font-display text-xl text-[#3f4761]">Import from ZIP File</h3>
            </div>
            <Collapsible title="ZIP Import Help">
              <div className="space-y-2 text-sm text-[#68718c]">
                <p>ZIP file should contain multiple CSV files. Each CSV file represents a table. File name (without extension) will be used as table name.</p>
                <pre className="app-code p-3 text-xs text-[#55607d]">{`database.zip\n├── students.csv\n├── courses.csv\n└── enrollments.csv`}</pre>
              </div>
            </Collapsible>
            <form onSubmit={handleZipImport} className="mt-3 space-y-3">
              <input ref={zipFileRef} type="file" accept=".zip" className="block w-full text-sm text-[#68718c] file:mr-3 file:cursor-pointer file:rounded-2xl file:border file:border-[#d8dded] file:bg-[#f6f5ff] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#55607d]" />
              <input name="zipName" type="text" defaultValue="NewDatabase" className={`${textInput} sm:w-64`} placeholder="Database name" />
              <button type="submit" className={primaryButton}>
                <Upload className="h-4 w-4" />
                Import ZIP Database
              </button>
            </form>
          </div>

          <div className={softCard}>
            <div className="mb-3 flex items-center gap-2">
              <FileCode className="h-4 w-4 text-[#6e68b1]" />
              <h3 className="font-display text-xl text-[#3f4761]">Import from SQL File</h3>
            </div>
            <Collapsible title="SQL Import Help">
              <div className="space-y-1 text-sm text-[#68718c]">
                <p>File must be UTF-8 encoded. Should contain CREATE TABLE statements. May contain INSERT statements to insert data. Supports standard SQLite syntax.</p>
              </div>
            </Collapsible>
            <form onSubmit={handleSqlImport} className="mt-3 space-y-3">
              <input ref={sqlFileRef} type="file" accept=".sql" className="block w-full text-sm text-[#68718c] file:mr-3 file:cursor-pointer file:rounded-2xl file:border file:border-[#d8dded] file:bg-[#f6f5ff] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#55607d]" />
              <input name="sqlName" type="text" defaultValue="SQLDatabase" className={`${textInput} sm:w-64`} placeholder="Database name" />
              <button type="submit" className={primaryButton}>
                <Upload className="h-4 w-4" />
                Import SQL Database
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
