import { useState } from 'react';
import { ChevronDown, Eye } from 'lucide-react';
import type { TableInfo } from '../lib/api';
import DataTable from './DataTable';

interface Props {
  tableName: string;
  metadata?: TableInfo;
}

export default function TablePreview({ tableName, metadata }: Props) {
  const [open, setOpen] = useState(false);

  if (!metadata) {
    return (
      <div className="flex items-center gap-3 rounded-[18px] border border-transparent px-3 py-2 text-sm">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[#d2b190]" />
        <span className="font-medium text-[#6d4b31]">{tableName}</span>
      </div>
    );
  }

  const columns = metadata.columns ?? [];
  const sampleRows = metadata.sample_rows ?? [];
  const rowCountLabel = metadata.row_count != null ? `${metadata.row_count} rows` : 'Preview available';

  return (
    <div className="rounded-[20px] border border-[#e8efe7] bg-white/70 px-3 py-2 shadow-[0_6px_18px_rgba(24,39,75,0.04)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full cursor-pointer items-center gap-3 rounded-[16px] px-1 py-1 text-left transition-colors duration-200 hover:bg-[#f8fcfb]"
        aria-expanded={open}
      >
        <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-medium text-[#5c3b1f]">{tableName}</span>
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7c5433]">{rowCountLabel}</span>
          </div>
          <p className="mt-1 text-xs text-[#8b6a50]">
            {open ? 'Hide sample rows' : 'View sample rows and schema'}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-[#e1c8aa] bg-[#fff7eb] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#7c5433]">
          <Eye className="h-3.5 w-3.5" />
          Preview
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[#8b6a50] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-3 ml-5 rounded-[20px] border-2 border-[#e1c8aa] bg-[#fffaf1] p-3 shadow-[0_10px_24px_rgba(151,103,59,0.12)]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <p className="font-semibold uppercase tracking-[0.12em] text-[#7c5433]">
              Approx. rows: {metadata.row_count ?? 'Unknown'}
            </p>
            <p className="max-w-full truncate text-[#8b6a50]">
              Columns: {columns.length ? columns.map((col) => col.name).join(', ') : 'Unavailable'}
            </p>
          </div>
          {sampleRows.length > 0 ? (
            <DataTable
              rows={sampleRows}
              columns={columns.map((col) => col.name)}
              compact
              maxHeight="16rem"
            />
          ) : (
            <p className="text-sm italic text-[#7c5433]">No preview rows.</p>
          )}
        </div>
      )}
    </div>
  );
}
