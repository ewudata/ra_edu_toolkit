interface Props {
  rows: Record<string, unknown>[];
  columns?: string[];
  compact?: boolean;
  maxHeight?: string;
}

export default function DataTable({ rows, columns, compact, maxHeight }: Props) {
  if (!rows.length) return <p className="text-sm italic text-[#9b8167]">No data.</p>;

  const cols = columns ?? Object.keys(rows[0]);

  return (
    <div className="overflow-auto rounded-[20px] border-2 border-[#e1c8aa] bg-[#fffaf1]" style={maxHeight ? { maxHeight } : undefined}>
      <table className={`min-w-full divide-y divide-[#ead7b8] ${compact ? 'text-xs' : 'text-sm'}`}>
        <thead className="sticky top-0 bg-[#fff1d8]">
          <tr>
            {cols.map((col) => (
              <th key={col} className="whitespace-nowrap px-3 py-2 text-left font-semibold text-[#6d4b31]">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f2e1c7] bg-white/95">
          {rows.map((row, i) => (
            <tr key={i} className="transition-colors hover:bg-[#fff4df]">
              {cols.map((col) => (
                <td key={col} className="whitespace-nowrap px-3 py-1.5 text-[#5c3b1f]">
                  {row[col] == null ? <span className="italic text-[#c6b39b]">NULL</span> : String(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
