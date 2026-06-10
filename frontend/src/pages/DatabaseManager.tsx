import { useEffect, useId, useState, useCallback, useRef, type FormEvent } from 'react';
import { api, type Database, type TableInfo } from '../lib/api';
import StatusBadge from '../components/StatusBadge';
import Collapsible from '../components/Collapsible';
import TablePreview from '../components/TablePreview';
import { Database as DatabaseIcon, FileArchive, FileCode, FolderPlus, HardDrive, LayoutList, RefreshCw, Trash2, Upload } from 'lucide-react';
import { getWorkingDatabase, setWorkingDatabase } from '../lib/workingDatabase';

const PROTECTED = new Set(['sales', 'university']);
type WorkspaceMode = 'browse' | 'import';

export default function DatabaseManager() {
  const zipFileInputId = useId();
  const zipNameInputId = useId();
  const sqlFileInputId = useId();
  const sqlNameInputId = useId();
  const [databases, setDatabases] = useState<Database[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schemas, setSchemas] = useState<Record<string, Record<string, TableInfo>>>({});
  const [schemaErrors, setSchemaErrors] = useState<Record<string, string>>({});
  const [catalogMsg, setCatalogMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [importMsg, setImportMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedDb, setSelectedDb] = useState(() => getWorkingDatabase());
  const [mode, setMode] = useState<WorkspaceMode>('browse');

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

  useEffect(() => {
    if (loading || !selectedDb || databases.length === 0) return;
    if (!databases.some((db) => db.name === selectedDb)) {
      setSelectedDb('');
      setWorkingDatabase('');
    }
  }, [databases, loading, selectedDb]);

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

  function hideSchema(dbName: string) {
    setSchemas((prev) => {
      const next = { ...prev };
      delete next[dbName];
      return next;
    });
    setSchemaErrors((prev) => {
      const next = { ...prev };
      delete next[dbName];
      return next;
    });
  }

  async function handleDelete(db: Database) {
    try {
      await api.deleteDatabase(db.name);
      setCatalogMsg({ type: 'success', text: db.is_default ? `Hidden shared dataset: ${db.name}` : `Deleted database: ${db.name}` });
      if (selectedDb === db.name) {
        setSelectedDb('');
        setWorkingDatabase('');
      }
      await loadDatabases();
    } catch (e) {
      setCatalogMsg({ type: 'error', text: `Delete failed: ${e}` });
    }
  }

  function formatImportError(err: unknown, attemptedName: string) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('is a shared default name and cannot be overwritten')) {
      return `Database '${attemptedName}' already exists`;
    }
    return message;
  }

  async function handleZipImport(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = (form.elements.namedItem('zipName') as HTMLInputElement).value.trim();
    const file = zipFileRef.current?.files?.[0];
    if (!file || !name) return;
    setImportMsg(null);
    try {
      const result = await api.importDatabaseFromZip(name, file);
      setImportMsg({ type: 'success', text: `Successfully imported database: ${result.name}` });
      form.reset();
      setSelectedDb(result.name);
      setWorkingDatabase(result.name);
      setMode('browse');
      await loadDatabases();
    } catch (e) {
      setImportMsg({ type: 'error', text: `Import failed: ${formatImportError(e, name)}` });
    }
  }

  async function handleSqlImport(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = (form.elements.namedItem('sqlName') as HTMLInputElement).value.trim();
    const file = sqlFileRef.current?.files?.[0];
    if (!file || !name) return;
    setImportMsg(null);
    try {
      const result = await api.importDatabaseFromSql(name, file);
      setImportMsg({ type: 'success', text: `Successfully imported database: ${result.name}` });
      form.reset();
      setSelectedDb(result.name);
      setWorkingDatabase(result.name);
      setMode('browse');
      await loadDatabases();
    } catch (e) {
      setImportMsg({ type: 'error', text: `Import failed: ${formatImportError(e, name)}` });
    }
  }

  const selectedDbInfo = databases.find((db) => db.name === selectedDb);
  const shell = 'space-y-5 rounded-[28px] bg-[linear-gradient(180deg,rgba(246,245,253,0.72)_0%,rgba(244,246,252,0.84)_52%,rgba(247,250,249,0.9)_100%)] p-3 sm:p-4';
  const hero = 'rounded-[26px] border border-[#dde1f0] bg-[linear-gradient(135deg,#f5f4ff_0%,#eef2ff_52%,#eef7f4_100%)] p-6 text-[#3f4761] shadow-[0_14px_34px_rgba(123,128,173,0.1)]';
  const blockCard = 'rounded-[24px] border border-[#dfe2f0] bg-[rgba(255,255,255,0.82)] p-5 shadow-[0_12px_28px_rgba(123,128,173,0.08)]';
  const softCard = 'rounded-[20px] border border-[#e4e7f2] bg-[rgba(255,255,255,0.9)] p-5 shadow-[0_8px_22px_rgba(123,128,173,0.06)]';
  const sectionLabel = 'text-xs font-semibold uppercase tracking-[0.22em] text-[#615a96]';
  const sectionTitle = 'text-xl font-semibold text-[#3f4761]';
  const secondaryButton = 'app-secondary-btn';
  const primaryButton = 'app-primary-btn disabled:opacity-50';
  const textInput = 'app-input block w-full rounded-2xl bg-white/92 px-4 py-3 text-sm';
  const datasetButtonBase = 'flex w-full cursor-pointer items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition-colors';
  const selectedDbProtected = !!selectedDbInfo?.is_default && PROTECTED.has(selectedDbInfo.name.toLowerCase());
  const selectedDbSharedStatus = selectedDbInfo?.is_default
    ? selectedDbProtected ? 'Yes; protected from deletion' : 'Yes'
    : 'No';

  return (
    <div className={shell}>
      <section className={hero}>
        <div className="space-y-3">
          <p className="text-sm font-bold uppercase tracking-[0.28em] text-[#615a96]">Academic Practice Studio</p>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#3f4761] sm:text-4xl">Database Manager</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#475467] sm:text-base">
              Import datasets, inspect tables, and manage the databases used throughout the toolkit.
            </p>
          </div>
        </div>
      </section>

      {error && <StatusBadge variant="error">Could not load the backend service: {error}</StatusBadge>}

      <section className={blockCard}>
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="app-icon-tile flex h-12 w-12 items-center justify-center rounded-[18px]">
                <DatabaseIcon className="app-icon-glyph h-5 w-5" />
              </div>
              <div>
                <p className={sectionLabel}>Manager Setup</p>
                <h2 className={sectionTitle}>Choose a database workspace</h2>
              </div>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-[#475467]">
              Pick a database to inspect its tables and metadata, or switch to import mode to add a new dataset.
            </p>
          </div>
          <div className="rounded-[20px] border border-[#e4e7f2] bg-[rgba(255,255,255,0.82)] p-4 shadow-[0_8px_20px_rgba(123,128,173,0.06)]">
            <label htmlFor="database-manager-select" className="mb-2 block text-sm font-semibold text-[#344054]">Database collection</label>
            <select
              id="database-manager-select"
              value={mode === 'browse' ? selectedDb : ''}
              onChange={(e) => {
                const nextDb = e.target.value;
                setSelectedDb(nextDb);
                setWorkingDatabase(nextDb);
                if (nextDb) setMode('browse');
              }}
              className="app-input w-full cursor-pointer rounded-2xl bg-white/92 px-4 py-3 text-sm"
              disabled={loading || databases.length === 0}
            >
              <option value="">{loading ? 'Loading databases...' : '- Select a database -'}</option>
              {databases.map((db) => (
                <option key={db.name} value={db.name}>{db.name} ({db.table_count} tables)</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className={`${blockCard} space-y-4 xl:sticky xl:top-32 xl:self-start`}>
          <div className="flex items-center gap-3">
            <div className="app-icon-tile-soft flex h-10 w-10 items-center justify-center rounded-[14px]">
              <HardDrive className="app-icon-glyph-soft h-5 w-5" />
            </div>
            <div>
              <p className={sectionLabel}>Database Rail</p>
              <h2 className="text-lg font-semibold text-[#3f4761]">Workspace catalog</h2>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2.5 rounded-2xl border border-[#d7eee7] bg-white/72 px-3 py-3 text-[#475467]">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#74c8b8] border-t-transparent" />
              <span className="text-sm">Loading databases...</span>
            </div>
          ) : databases.length === 0 ? (
            <StatusBadge variant="info">No databases have been imported yet.</StatusBadge>
          ) : (
            <div className="space-y-2">
              {databases.map((db) => (
                <button
                  key={db.name}
                  type="button"
                  onClick={() => {
                    setSelectedDb(db.name);
                    setWorkingDatabase(db.name);
                    setMode('browse');
                  }}
                  className={`${datasetButtonBase} ${
                    mode === 'browse' && selectedDb === db.name
                      ? 'border-[#87d7c8] bg-[#f3fbf8] text-[#214c45]'
                      : 'border-[#e4e7f2] bg-white/78 text-[#3d6f67] hover:bg-[#f8fcfb]'
                  }`}
                >
                  <DatabaseIcon className="app-icon-glyph-soft h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{db.name}</span>
                    <span className="block text-xs font-medium text-[#667085]">{db.table_count} tables</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="space-y-3 border-t border-[#e5e7eb] pt-4">
            <p className={sectionLabel}>Actions</p>
            <button
              type="button"
              onClick={() => setMode('import')}
              className={`${datasetButtonBase} ${
                mode === 'import'
                  ? 'border-[#87d7c8] bg-[#f3fbf8] text-[#214c45]'
                  : 'border-[#e4e7f2] bg-white/78 text-[#3d6f67] hover:bg-[#f8fcfb]'
              }`}
            >
              <FolderPlus className="app-icon-glyph-soft h-4 w-4" />
              Add database
            </button>
          </div>
        </aside>

        <div className="min-w-0 space-y-5">
          {catalogMsg && (
            <StatusBadge variant={catalogMsg.type === 'success' ? 'success' : 'error'}>
              {catalogMsg.text}
            </StatusBadge>
          )}
          {importMsg && (
            <StatusBadge variant={importMsg.type === 'success' ? 'success' : 'error'}>
              {importMsg.text}
            </StatusBadge>
          )}

          {loading && mode === 'browse' ? (
            <section className={`${softCard} flex items-center gap-2.5 py-4 text-[#475467]`}>
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#74c8b8] border-t-transparent" />
              <span className="text-sm">Loading databases...</span>
            </section>
          ) : mode === 'browse' && selectedDbInfo ? (
            <section className={`${blockCard} space-y-5`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="app-icon-tile flex h-10 w-10 items-center justify-center rounded-[14px]">
                    <LayoutList className="app-icon-glyph h-5 w-5" />
                  </div>
                  <div>
                    <p className={sectionLabel}>Selected Database</p>
                    <h2 className={sectionTitle}>{selectedDbInfo.name}</h2>
                  </div>
                </div>
                <div className="rounded-full border border-[#d7eee7] bg-white/76 px-3 py-1 text-xs font-semibold text-[#3d6f67]">
                  {selectedDbInfo.table_count} tables
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.65fr)]">
                <div className={`${softCard} space-y-3`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className={sectionLabel}>Tables</p>
                      <h3 className="text-base font-semibold text-[#3f4761]">Schema preview</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (schemas[selectedDbInfo.name]) {
                          hideSchema(selectedDbInfo.name);
                          return;
                        }
                        void loadSchema(selectedDbInfo.name);
                      }}
                      className={`${secondaryButton} !rounded-xl !px-2.5 !py-1 text-xs`}
                    >
                      <RefreshCw className="h-3 w-3" />
                      {schemas[selectedDbInfo.name] ? 'Hide' : 'Load'} table details
                    </button>
                  </div>
                  {schemaErrors[selectedDbInfo.name] && (
                    <StatusBadge variant="warning">Table details unavailable: {schemaErrors[selectedDbInfo.name]}</StatusBadge>
                  )}
                  <div className="space-y-0.5">
                    {selectedDbInfo.tables.map((table) => (
                      <TablePreview
                        key={table}
                        tableName={table}
                        metadata={schemas[selectedDbInfo.name]?.[table]}
                      />
                    ))}
                  </div>
                </div>

                <div className={`${softCard} space-y-4 text-sm`}>
                  <div>
                    <p className={sectionLabel}>Details</p>
                    <h3 className="text-base font-semibold text-[#3f4761]">Dataset summary</h3>
                  </div>
                  <div className="space-y-2 text-[#475467]">
                    <p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#8cb7aa]" /> Database name: {selectedDbInfo.name}</p>
                    <p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#8cb7aa]" /> Table count: {selectedDbInfo.table_count}</p>
                    <p className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#8cb7aa]" />
                      Shared starter dataset: {selectedDbSharedStatus}
                    </p>
                  </div>
                  {!selectedDbProtected && (
                    <button
                      type="button"
                      onClick={() => handleDelete(selectedDbInfo)}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-2xl border border-[#e4c8cc] bg-[#fff2f3] px-4 py-2 text-sm font-semibold text-[#8b5e68] transition-colors duration-200 hover:bg-[#fde7ea]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {selectedDbInfo.is_default ? `Hide ${selectedDbInfo.name}` : `Delete ${selectedDbInfo.name}`}
                    </button>
                  )}
                </div>
              </div>
            </section>
          ) : mode === 'browse' ? (
            <section className={`${blockCard} space-y-2`}>
              <p className={sectionLabel}>Workspace</p>
              <h2 className={sectionTitle}>Choose a working database</h2>
              <p className="max-w-2xl text-sm leading-6 text-[#475467]">
                Select a database from the rail to inspect its tables, metadata, and management controls.
              </p>
            </section>
          ) : (
            <section className={`${blockCard} space-y-4`}>
              <div className="flex items-center gap-3">
                <div className="app-icon-tile flex h-11 w-11 items-center justify-center rounded-[16px]">
                  <Upload className="app-icon-glyph h-5 w-5" />
                </div>
                <div>
                  <p className={sectionLabel}>Import</p>
                  <h2 className={sectionTitle}>Add a new database</h2>
                </div>
              </div>
              <p className="max-w-3xl text-sm leading-6 text-[#475467]">
                Import a dataset from table files or from a SQL script and make it available across the app.
              </p>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className={softCard}>
                  <div className="mb-3 flex items-center gap-2">
                    <FileArchive className="app-icon-glyph h-4 w-4" />
                    <h3 className="font-display text-xl text-[#3f4761]">Import from a ZIP file</h3>
                  </div>
                  <Collapsible title="ZIP format help">
                    <div className="space-y-2 text-sm text-[#475467]">
                      <p>The ZIP file should contain one or more CSV files. Each CSV becomes a table, and the file name becomes the table name.</p>
                      <pre className="app-code p-3 text-xs text-[#344054]">{`database.zip\n├── students.csv\n├── courses.csv\n└── enrollments.csv`}</pre>
                    </div>
                  </Collapsible>
                  <form onSubmit={handleZipImport} className="mt-3 space-y-3">
                    <div className="space-y-2">
                      <label htmlFor={zipFileInputId} className="block text-sm font-semibold text-[#344054]">ZIP file</label>
                      <input id={zipFileInputId} ref={zipFileRef} type="file" accept=".zip" className="block w-full text-sm text-[#475467] file:mr-3 file:cursor-pointer file:rounded-2xl file:border file:border-[#cbeae3] file:bg-[#f3fbf8] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#3d6f67]" />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor={zipNameInputId} className="block text-sm font-semibold text-[#344054]">Database name</label>
                      <input id={zipNameInputId} name="zipName" type="text" defaultValue="" className={`${textInput} sm:w-64`} placeholder="Database name" />
                    </div>
                    <button type="submit" className={primaryButton}>
                      <Upload className="h-4 w-4" />
                      Import ZIP dataset
                    </button>
                  </form>
                </div>

                <div className={softCard}>
                  <div className="mb-3 flex items-center gap-2">
                    <FileCode className="app-icon-glyph h-4 w-4" />
                    <h3 className="font-display text-xl text-[#3f4761]">Import from a SQL file</h3>
                  </div>
                  <Collapsible title="SQL format help">
                    <div className="space-y-1 text-sm text-[#475467]">
                      <p>The file must be UTF-8 encoded and use SQLite-compatible SQL. It should include <code>CREATE TABLE</code> statements and can also include <code>INSERT</code> statements.</p>
                    </div>
                  </Collapsible>
                  <form onSubmit={handleSqlImport} className="mt-3 space-y-3">
                    <div className="space-y-2">
                      <label htmlFor={sqlFileInputId} className="block text-sm font-semibold text-[#344054]">SQL file</label>
                      <input id={sqlFileInputId} ref={sqlFileRef} type="file" accept=".sql" className="block w-full text-sm text-[#475467] file:mr-3 file:cursor-pointer file:rounded-2xl file:border file:border-[#cbeae3] file:bg-[#f3fbf8] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#3d6f67]" />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor={sqlNameInputId} className="block text-sm font-semibold text-[#344054]">Database name</label>
                      <input id={sqlNameInputId} name="sqlName" type="text" defaultValue="" className={`${textInput} sm:w-64`} placeholder="Database name" />
                    </div>
                    <button type="submit" className={primaryButton}>
                      <Upload className="h-4 w-4" />
                      Import SQL dataset
                    </button>
                  </form>
                </div>
              </div>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
