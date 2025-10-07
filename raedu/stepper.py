from __future__ import annotations
from typing import Dict, Any, List
import pandas as pd
from pathlib import Path
from lark import Tree
from . import ra_ast as AST
from .ra_parser import parse as lark_parse
from .evaluator import eval as eval_node

DATASETS_DIR = Path(__file__).resolve().parent.parent / "datasets"

def _load_env() -> Dict[str, pd.DataFrame]:
    env: Dict[str, pd.DataFrame] = {}
    csv_files = sorted(DATASETS_DIR.glob("*.csv"))
    for path in csv_files:
        name = path.stem
        df = pd.read_csv(path)
        df = df.copy()
        df.columns = [c.lower() for c in df.columns]
        df["_prov"] = [[(name, int(i))] for i in range(len(df))]
        env[name.lower()] = df
    return env

def _flatten(obj):
    if isinstance(obj, AST.Node):
        return obj
    if isinstance(obj, list):
        return _flatten(obj[0]) if obj else obj
    if isinstance(obj, Tree):
        data = obj.data
        ch = [ _flatten(c) for c in obj.children ]
        if data == "projection":
            return ch[0]
        if data == "selection":
            return ch[0]
        if data == "rename":
            return ch[0]
        if data == "relation":
            return ch[0]
        if len(ch)==1:
            return ch[0]
        return ch[0]
    return obj

def parse(text: str) -> AST.Node:
    t = lark_parse(text)
    return _flatten(t)

def run(expression: str):
    env = _load_env()
    ast = parse(expression)
    steps: List[Dict[str, Any]] = []
    out = eval_node(ast, env, steps)
    trace = {
        "expression": expression,
        "steps": steps,
        "final_schema": [c for c in out.columns if c!="_prov"],
        "final_rows": len(out),
        "preview": out[[c for c in out.columns if c!="_prov"]].head(10).to_dict(orient="records"),
    }
    return out, trace
