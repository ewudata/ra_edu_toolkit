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
      <div className="flex items-baseline gap-2 text-sm py-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0 mt-1.5" />
        <span className="font-medium text-slate-600">{tableName}</span>
      </div>
    );
  }

  const columns = metadata.columns ?? [];
  const sampleRows = metadata.sample_rows ?? [];

  return (
    <div className="relative flex items-baseline gap-2 text-sm py-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
      <span
        className="font-medium text-slate-700 cursor-help"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {tableName}
        {metadata.row_count != null && (
          <span className="text-slate-400 font-normal ml-1.5 text-xs">({metadata.row_count} rows)</span>
        )}
      </span>

      {hovered && (
        <div className="absolute z-50 top-6 left-4 bg-white border border-slate-200 rounded-lg shadow-lg p-3 max-w-lg max-h-64 overflow-auto">
          {metadata.row_count != null && (
            <p className="text-xs text-slate-400 mb-2">Approx. rows: {metadata.row_count}</p>
          )}
          <table className="text-xs border-collapse min-w-[200px]">
            <thead>
              <tr className="bg-slate-50">
                {columns.map((col) => (
                  <th key={col.name} className="border border-slate-200 px-2 py-1 text-left font-semibold text-slate-600 whitespace-nowrap">
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
                      <td key={col.name} className="border border-slate-200 px-2 py-1 whitespace-nowrap text-slate-600">
                        {row[col.name] == null ? <span className="text-slate-300 italic">NULL</span> : String(row[col.name])}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length || 1} className="border border-slate-200 px-2 py-1 text-slate-400 italic">
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
