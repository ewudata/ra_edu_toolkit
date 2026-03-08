import { Rows3, Columns3, Database, Download } from 'lucide-react';
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
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Rows3, value: result.row_count ?? rows.length, label: 'Rows' },
          { icon: Columns3, value: schema.length, label: 'Columns' },
          { icon: Database, value: result.database ?? 'Unknown', label: 'Database' },
        ].map(({ icon: Icon, value, label }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-lg p-4 text-center">
            <Icon className="w-4 h-4 text-primary mx-auto mb-1.5" />
            <p className="text-xl font-bold text-slate-800">{value}</p>
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">{label}</p>
          </div>
        ))}
      </div>

      {schema.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-600 mb-1">Result Schema</h4>
          <p className="text-sm text-slate-500 font-mono">{schema.join(', ')}</p>
        </div>
      )}

      {rows.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-600">Query Results</h4>
          <DataTable rows={rows} columns={schema.length ? schema : undefined} />
          <button
            onClick={downloadCsv}
            className="inline-flex items-center gap-1.5 text-sm px-4 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer text-slate-600"
          >
            <Download className="w-3.5 h-3.5" />
            Download CSV
          </button>
        </div>
      ) : (
        <div className="bg-sky-50 border border-sky-200 text-sky-700 rounded-lg p-3 text-sm">
          Query result is empty
        </div>
      )}
    </div>
  );
}
