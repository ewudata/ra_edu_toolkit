interface Props {
  rows: Record<string, unknown>[];
  columns?: string[];
  compact?: boolean;
  maxHeight?: string;
}

export default function DataTable({ rows, columns, compact, maxHeight }: Props) {
  if (!rows.length) return <p className="text-sm text-slate-400 italic">No data.</p>;

  const cols = columns ?? Object.keys(rows[0]);

  return (
    <div className="overflow-auto border border-slate-200 rounded-lg" style={maxHeight ? { maxHeight } : undefined}>
      <table className={`min-w-full divide-y divide-slate-200 ${compact ? 'text-xs' : 'text-sm'}`}>
        <thead className="bg-slate-50 sticky top-0">
          <tr>
            {cols.map((col) => (
              <th key={col} className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-primary-50/40 transition-colors">
              {cols.map((col) => (
                <td key={col} className="px-3 py-1.5 whitespace-nowrap text-slate-700">
                  {row[col] == null ? <span className="text-slate-300 italic">NULL</span> : String(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
