import React from "react";

type Step = {
  op: string;
  detail?: any;
  input_schema?: any;
  output_schema: string[];
  delta?: any;
  note?: string;
  rows?: number;
  preview?: Record<string, any>[];
};

type Trace = {
  expression: string;
  steps: Step[];
  final_schema: string[];
  final_rows: number;
  preview: Record<string, any>[];
};

type Props = { trace: Trace };

// Minimal component that renders a timeline of steps.
const RAPlayback: React.FC<Props> = ({ trace }) => {
  return (
    <div className="p-4 space-y-4">
      <div className="text-xl font-bold">Relational Algebra Stepper</div>
      <div className="text-sm text-gray-600">Expression: <code>{trace.expression}</code></div>

      <ol className="space-y-3">
        {trace.steps.map((s, i) => (
          <li key={i} className="border rounded-xl p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Step {i+1}: {s.op}</div>
              {s.rows !== undefined && <div className="text-xs">rows: {s.rows}</div>}
            </div>
            <div className="text-xs mt-1">
              {s.detail && <pre className="bg-gray-50 p-2 rounded">{JSON.stringify(s.detail, null, 2)}</pre>}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2 text-xs">
              {s.input_schema && (
                <div>
                  <div className="font-medium">Input schema</div>
                  <pre className="bg-gray-50 p-2 rounded">{JSON.stringify(s.input_schema, null, 2)}</pre>
                </div>
              )}
              <div>
                <div className="font-medium">Output schema</div>
                <pre className="bg-gray-50 p-2 rounded">{JSON.stringify(s.output_schema, null, 2)}</pre>
              </div>
            </div>
            {s.delta && (
              <div className="mt-2 text-xs">
                <div className="font-medium">Delta</div>
                <pre className="bg-gray-50 p-2 rounded">{JSON.stringify(s.delta, null, 2)}</pre>
              </div>
            )}
            {Array.isArray(s.preview) && s.preview.length > 0 && (
              <div className="mt-2 text-xs">
                <div className="font-medium">Preview (up to 10 rows)</div>
                <pre className="bg-gray-50 p-2 rounded">{JSON.stringify(s.preview, null, 2)}</pre>
              </div>
            )}
            {s.note && <div className="mt-2 text-xs italic">{s.note}</div>}
          </li>
        ))}
      </ol>

      <div className="mt-4">
        <div className="font-semibold">Final Preview ({trace.final_rows} rows)</div>
        <div className="overflow-auto border rounded">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                {trace.final_schema.map(h => <th key={h} className="px-2 py-1 text-left border-b">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {trace.preview.map((row, i) => (
                <tr key={i}>
                  {trace.final_schema.map(h => <td key={h} className="px-2 py-1 border-b">{String(row[h])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default RAPlayback;
