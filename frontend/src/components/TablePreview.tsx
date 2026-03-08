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
      <div className="flex items-baseline gap-1.5 text-sm">
        <span className="text-gray-400">•</span>
        <span className="font-medium text-gray-700">{tableName}</span>
      </div>
    );
  }

  const columns = metadata.columns ?? [];
  const sampleRows = metadata.sample_rows ?? [];

  return (
    <div className="relative flex items-baseline gap-1.5 text-sm">
      <span className="text-gray-400">•</span>
      <span
        className="font-medium text-gray-700 cursor-help"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {tableName}
        {metadata.row_count != null && (
          <span className="text-gray-400 font-normal ml-1">({metadata.row_count} rows)</span>
        )}
      </span>

      {hovered && (
        <div className="absolute z-50 top-6 left-4 bg-white border border-gray-200 rounded-lg shadow-lg p-3 max-w-lg max-h-64 overflow-auto">
          {metadata.row_count != null && (
            <p className="text-xs text-gray-500 mb-2">Approx. rows: {metadata.row_count}</p>
          )}
          <table className="text-xs border-collapse min-w-[200px]">
            <thead>
              <tr className="bg-gray-50">
                {columns.map((col) => (
                  <th key={col.name} className="border border-gray-200 px-2 py-1 text-left font-semibold whitespace-nowrap">
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
                      <td key={col.name} className="border border-gray-200 px-2 py-1 whitespace-nowrap">
                        {row[col.name] == null ? <span className="text-gray-400">NULL</span> : String(row[col.name])}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length || 1} className="border border-gray-200 px-2 py-1 text-gray-400 italic">
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
