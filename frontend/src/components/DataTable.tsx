interface Props {
  rows: Record<string, unknown>[];
  columns?: string[];
  compact?: boolean;
  maxHeight?: string;
}

export default function DataTable({ rows, columns, compact, maxHeight }: Props) {
  if (!rows.length) return <p className="text-sm text-gray-500 italic">No data.</p>;

  const cols = columns ?? Object.keys(rows[0]);

  return (
    <div className={`overflow-auto border border-gray-200 rounded-lg ${maxHeight ? '' : ''}`} style={maxHeight ? { maxHeight } : undefined}>
      <table className={`min-w-full divide-y divide-gray-200 ${compact ? 'text-xs' : 'text-sm'}`}>
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            {cols.map((col) => (
              <th key={col} className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {cols.map((col) => (
                <td key={col} className="px-3 py-1.5 whitespace-nowrap text-gray-700">
                  {row[col] == null ? <span className="text-gray-400">NULL</span> : String(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
