#!/usr/bin/env python3
import sys
import json
from html import escape
from pathlib import Path
import pandas as pd

from api.evaluate_ra.stepper import run


def _json_pretty(value):
    if value is None:
        return ""
    return json.dumps(value, indent=2, ensure_ascii=False)


def _write_trace_html(trace, path: Path) -> None:
    expression = escape(trace.get("expression", ""))
    steps = trace.get("steps", [])
    final_schema = trace.get("final_schema", [])
    final_rows = trace.get("final_rows", 0)
    preview = trace.get("preview", [])

    def _wrap_pre(value, fallback="{}"):
        if value is None:
            pretty = fallback
        else:
            pretty = _json_pretty(value)
        return escape(pretty)

    rows_html = []
    for idx, step in enumerate(steps, start=1):
        detail = step.get("detail")
        detail_html = ""
        if detail is not None:
            detail_html = f"""
      <div style=\"margin-top:8px;\">
        <strong>Detail</strong>
        <pre>{_wrap_pre(detail, fallback="null")}</pre>
      </div>"""

        input_schema = step.get("input_schema")
        output_schema = step.get("output_schema")
        delta = step.get("delta")
        rows = step.get("rows")
        step_preview = step.get("preview")
        rows_str = f"Rows: {rows}" if rows is not None else ""
        input_html = ""
        if input_schema is not None:
            input_html = f"""
        <div>
          <strong>Input schema</strong>
          <pre>{_wrap_pre(input_schema)}</pre>
        </div>"""

        delta_html = ""
        if delta is not None:
            delta_html = f"""
      <div style=\"margin-top:8px;\">
        <strong>Delta</strong>
        <pre>{_wrap_pre(delta)}</pre>
      </div>"""

        preview_html = ""
        if isinstance(step_preview, list) and step_preview:
            preview_html = f"""
      <div style=\"margin-top:8px;\">
        <strong>Preview (up to 10 rows)</strong>
        <pre>{_wrap_pre(step_preview, fallback="[]")}</pre>
      </div>"""

        output_html = f"""
        <div>
          <strong>Output schema</strong>
          <pre>{_wrap_pre(output_schema)}</pre>
        </div>"""

        rows_html.append(
            f"""
    <div class=\"card\">
      <div class=\"step-title\">Step {idx}: {escape(str(step.get('op', '')))}</div>
      <div class=\"muted\">{rows_str}</div>
{detail_html}
      <div class=\"grid\">
{input_html}
{output_html}
      </div>
{delta_html}
{preview_html}
      <div class=\"muted\">{escape(str(step.get('note', '')))}</div>
    </div>"""
        )

    if not rows_html:
        rows_html.append("<div class=\"card\"><div class=\"muted\">No steps recorded.</div></div>")

    header = """\
<!DOCTYPE html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>RA Stepper — Trace Viewer</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 24px; }
    .card { border: 1px solid #ddd; border-radius: 12px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);}
    .muted { color: #666; font-size: 0.9rem; }
    code, pre { background: #f7f7f7; border-radius: 8px; padding: 4px 6px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid #eee; padding: 6px 8px; text-align: left; }
    th { background: #fafafa; }
    h1 { margin-top: 0; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .pill { display: inline-block; padding: 2px 8px; border: 1px solid #ddd; border-radius: 999px; font-size: 0.8rem; margin-left: 8px; }
    .step-title { font-weight: 600; }
  </style>
</head>
<body>
  <h1>Relational Algebra Stepper</h1>
  <div class=\"muted\">Expression: <code>{expression}</code></div>

  <h2>Steps</h2>
"""

    table_rows = []
    if preview:
        for row in preview:
            if final_schema:
                cells = "".join(
                    f"<td>{escape(str(row.get(col, '')))}</td>" for col in final_schema
                )
            else:
                cells = f"<td>{escape(str(row))}</td>"
            table_rows.append(f"        <tr>{cells}</tr>")
    else:
        table_rows.append("        <tr><td colspan=\"{0}\">No preview rows.</td></tr>".format(len(final_schema) or 1))

    table_head = "".join(f"<th>{escape(str(col))}</th>" for col in final_schema)
    if not table_head:
        table_head = "<th>result</th>"

    footer = f"""
  <h2>Final Preview <span class=\"pill\">{final_rows} rows</span></h2>
  <div class=\"card\">
    <table>
      <thead>
        <tr>{table_head}</tr>
      </thead>
      <tbody>
{''.join(table_rows)}
      </tbody>
    </table>
  </div>
</body>
</html>
"""

    html = header + "\n" + "\n".join(rows_html) + "\n" + footer
    path.write_text(html, encoding="utf-8")


def main():
    if len(sys.argv) < 2:
        print('Usage: python run.py "<RA expression>" [database]')
        sys.exit(1)
    expr = sys.argv[1]
    database = sys.argv[2] if len(sys.argv) > 2 else None
    df, trace = run(expr, database=database)
    print("Expression:", expr)
    print("Final schema:", trace["final_schema"])
    print("Final rows:", trace["final_rows"])
    print(pd.DataFrame(trace["preview"]))
    outdir = Path("output")
    outdir.mkdir(exist_ok=True, parents=True)
    with open(outdir / "trace.json", "w", encoding="utf-8") as f:
        json.dump(trace, f, indent=2, ensure_ascii=False)
    df[trace["final_schema"]].to_csv(outdir / "result.csv", index=False)
    _write_trace_html(trace, Path("ra_trace_viewer.html"))
    print("Saved JSON trace to output/trace.json and CSV to output/result.csv")


if __name__ == "__main__":
    main()
