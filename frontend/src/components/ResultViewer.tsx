import type { EvaluationResult } from '../lib/api';
import DataTable from './DataTable';

interface Props {
  result: EvaluationResult;
}

export default function ResultViewer({ result }: Props) {
  const rows = result.rows ?? [];
  const schema = result.schema_eval ?? [];

  function downloadCsv() {
    if (!rows.length) return;
    const cols = schema.length ? schema : Object.keys(rows[0]);
    const header = cols.join(',');
    const body = rows.map((r) => cols.map((c) => {
      const v = r[c];
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'query_result.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-gray-800">{result.row_count ?? rows.length}</p>
          <p className="text-xs text-gray-500 uppercase">Rows</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-gray-800">{schema.length}</p>
          <p className="text-xs text-gray-500 uppercase">Columns</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-gray-800">{result.database ?? 'Unknown'}</p>
          <p className="text-xs text-gray-500 uppercase">Database</p>
        </div>
      </div>

      {schema.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-1">Result Schema</h4>
          <p className="text-sm text-gray-600">{schema.join(', ')}</p>
        </div>
      )}

      {rows.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-700">Query Results</h4>
          <DataTable rows={rows} columns={schema.length ? schema : undefined} />
          <button
            onClick={downloadCsv}
            className="text-sm px-4 py-1.5 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
          >
            Download CSV
          </button>
        </div>
      ) : (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 rounded-lg p-3 text-sm">
          Query result is empty
        </div>
      )}
    </div>
  );
}
