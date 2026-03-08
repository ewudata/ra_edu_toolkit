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
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {[
          { icon: Rows3, value: result.row_count ?? rows.length, label: 'Rows' },
          { icon: Columns3, value: schema.length, label: 'Columns' },
          { icon: Database, value: result.database ?? 'Unknown', label: 'Database' },
        ].map(({ icon: Icon, value, label }) => (
          <div key={label} className="app-soft-block p-4 text-center">
            <Icon className="mx-auto mb-1.5 h-4 w-4 text-primary" />
            <p className="text-xl font-bold text-[#5c3b1f]">{value}</p>
            <p className="text-[11px] uppercase tracking-wide text-[#9b8167]">{label}</p>
          </div>
        ))}
      </div>

      {schema.length > 0 && (
        <div>
          <h4 className="mb-1 text-sm font-semibold text-[#6d4b31]">Result Schema</h4>
          <p className="font-mono text-sm text-[#7b5a42]">{schema.join(', ')}</p>
        </div>
      )}

      {rows.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-[#6d4b31]">Query Results</h4>
          <DataTable rows={rows} columns={schema.length ? schema : undefined} />
          <button
            onClick={downloadCsv}
            className="app-secondary-btn text-sm"
          >
            <Download className="w-3.5 h-3.5" />
            Download CSV
          </button>
        </div>
      ) : (
        <div className="rounded-[18px] border-2 border-[#e4c49a] bg-[#fff5e7] p-3 text-sm text-[#7c5433]">
          Query result is empty
        </div>
      )}
    </div>
  );
}
