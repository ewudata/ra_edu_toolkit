import type { TraceStep } from '../lib/api';
import Collapsible from './Collapsible';
import DataTable from './DataTable';

const OP_DISPLAY_NAMES: Record<string, string> = {
  rel: 'Relation Lookup',
  'π': 'Projection',
  'σ': 'Selection',
  'ρ': 'Rename',
  '⋈': 'Natural Join',
  '⋈_θ': 'Theta Join',
  '×': 'Cartesian Product',
  '∪': 'Union',
  '−': 'Difference',
  '∩': 'Intersection',
  '÷': 'Division',
};

function formatOpLabel(step: TraceStep): string {
  const op = step.op;
  if (!op) return 'Unknown Operation';
  const friendly = OP_DISPLAY_NAMES[op];
  if (op === 'rel') {
    const detail = step.detail;
    let name: string | undefined;
    if (typeof detail === 'string') name = detail;
    else if (detail && typeof detail === 'object') name = (detail as Record<string, string>).name ?? (detail as Record<string, string>).relation;
    if (name) return `${friendly ?? 'Relation Lookup'} (${name})`;
  }
  return friendly ? (friendly === op ? friendly : `${friendly} (${op})`) : op;
}

function formatSchema(schema: unknown): string {
  if (!schema) return '—';
  if (Array.isArray(schema)) return schema.join(', ');
  if (typeof schema === 'object') return Object.entries(schema as Record<string, unknown>).map(([k, v]) => `${k}: ${formatSchema(v)}`).join('; ');
  return String(schema);
}

function formatDetail(detail: unknown): string {
  if (detail == null) return '';
  if (typeof detail === 'object' && !Array.isArray(detail)) return Object.entries(detail as Record<string, unknown>).map(([k, v]) => `${k}: ${v}`).join('; ');
  if (Array.isArray(detail)) return detail.map(String).join(', ');
  return String(detail);
}

function extractRowCount(step: TraceStep): number | null {
  if (step.rows != null) return Number(step.rows);
  if (step.delta) {
    for (const key of ['rows_after', 'rows_before']) {
      const val = (step.delta as Record<string, unknown>)[key];
      if (val != null) return Number(val);
    }
  }
  return null;
}

interface Props {
  trace: TraceStep[];
  title?: string;
}

export default function TraceViewer({ trace, title = '🔍 Execution Trace' }: Props) {
  if (!trace.length) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-800">{title}</h3>

      <div className="overflow-auto border border-gray-200 rounded-lg">
        <table className="min-w-full text-sm divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">Step</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">Operation</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">Output Schema</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">Rows</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {trace.map((step, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-700">{i + 1}</td>
                <td className="px-3 py-2 text-gray-700">{formatOpLabel(step)}</td>
                <td className="px-3 py-2 text-gray-700">{formatSchema(step.output_schema)}</td>
                <td className="px-3 py-2 text-gray-700">{extractRowCount(step) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        {trace.map((step, i) => (
          <Collapsible key={i} title={`Step ${i + 1}: ${formatOpLabel(step)}`}>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-4">
                {step.input_schema && (
                  <div>
                    <span className="font-medium text-gray-600">Input Schema:</span>{' '}
                    <span className="text-gray-800">{formatSchema(step.input_schema)}</span>
                  </div>
                )}
                {step.output_schema && (
                  <div>
                    <span className="font-medium text-gray-600">Output Schema:</span>{' '}
                    <span className="text-gray-800">{formatSchema(step.output_schema)}</span>
                  </div>
                )}
              </div>
              {formatDetail(step.detail) && (
                <div>
                  <span className="font-medium text-gray-600">Detail:</span>{' '}
                  <span className="text-gray-800">{formatDetail(step.detail)}</span>
                </div>
              )}
              {extractRowCount(step) != null && (
                <div>
                  <span className="font-medium text-gray-600">Rows:</span>{' '}
                  <span className="text-gray-800">{extractRowCount(step)}</span>
                </div>
              )}
              <div>
                <p className="font-medium text-gray-600 mb-1">Output (up to 10 records):</p>
                {step.preview?.length ? (
                  <DataTable rows={step.preview} compact />
                ) : (
                  <p className="text-gray-400 italic text-xs">No preview rows for this step.</p>
                )}
              </div>
            </div>
          </Collapsible>
        ))}
      </div>
    </div>
  );
}
