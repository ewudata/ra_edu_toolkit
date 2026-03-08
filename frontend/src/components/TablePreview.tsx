import { useState } from 'react';
import type { TableInfo } from '../lib/api';

interface Props {
  tableName: string;
  metadata?: TableInfo;
}

export default function TablePreview({ tableName, metadata }: Props) {
  const [hovered, setHovered] = useState(false);

  if (!metadata) {
    return (
      <div className="flex items-baseline gap-2 py-0.5 text-sm">
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#d2b190]" />
        <span className="font-medium text-[#6d4b31]">{tableName}</span>
      </div>
    );
  }

  const columns = metadata.columns ?? [];
  const sampleRows = metadata.sample_rows ?? [];

  return (
    <div className="relative flex items-baseline gap-2 text-sm py-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
      <span
        className="font-medium text-[#5c3b1f] cursor-help"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {tableName}
        {metadata.row_count != null && (
          <span className="ml-1.5 text-xs font-normal text-[#9b8167]">({metadata.row_count} rows)</span>
        )}
      </span>

      {hovered && (
        <div className="absolute z-50 top-6 left-4 max-h-64 max-w-lg overflow-auto rounded-[20px] border-2 border-[#e1c8aa] bg-[#fffaf1] p-3 shadow-[0_10px_24px_rgba(151,103,59,0.16)]">
          {metadata.row_count != null && (
            <p className="mb-2 text-xs text-[#9b8167]">Approx. rows: {metadata.row_count}</p>
          )}
          <table className="text-xs border-collapse min-w-[200px]">
            <thead>
              <tr className="bg-[#fff1d8]">
                {columns.map((col) => (
                  <th key={col.name} className="whitespace-nowrap border border-[#ead7b8] px-2 py-1 text-left font-semibold text-[#6d4b31]">
                    {col.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sampleRows.length > 0 ? (
                sampleRows.map((row, i) => (
                  <tr key={i}>
                    {columns.map((col) => (
                      <td key={col.name} className="whitespace-nowrap border border-[#ead7b8] px-2 py-1 text-[#6d4b31]">
                        {row[col.name] == null ? <span className="italic text-[#c6b39b]">NULL</span> : String(row[col.name])}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length || 1} className="border border-[#ead7b8] px-2 py-1 italic text-[#9b8167]">
                    No preview rows
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
