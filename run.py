#!/usr/bin/env python3
import sys
import json
from pathlib import Path
import pandas as pd

from raedu.stepper import run


def main():
    if len(sys.argv) < 2:
        print('Usage: python run.py "<RA expression>"')
        sys.exit(1)
    expr = sys.argv[1]
    df, trace = run(expr)
    print("Expression:", expr)
    print("Final schema:", trace["final_schema"])
    print("Final rows:", trace["final_rows"])
    print(pd.DataFrame(trace["preview"]))
    outdir = Path("output")
    outdir.mkdir(exist_ok=True, parents=True)
    with open(outdir / "trace.json", "w", encoding="utf-8") as f:
        json.dump(trace, f, indent=2, ensure_ascii=False)
    df[trace["final_schema"]].to_csv(outdir / "result.csv", index=False)
    print("Saved JSON trace to output/trace.json and CSV to output/result.csv")


if __name__ == "__main__":
    main()
