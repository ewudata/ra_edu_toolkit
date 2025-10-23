from __future__ import annotations
from typing import Dict, Any, List, Optional
from lark import Tree
from . import ra_ast as AST
from .ra_parser import parse as lark_parse
from .evaluator import eval as eval_node
from ..services import datasets as datasets_service


def load_databases() -> List[str]:
    """Return all available database names under datasets root."""

    return [summary.name for summary in datasets_service.list_databases()]

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

def run(expression: str, database: Optional[str] = None):
    if database is None:
        candidates = datasets_service.list_databases()
        if len(candidates) != 1:
            opts = ", ".join(summary.name for summary in candidates) or "<none>"
            raise ValueError(
                "Database not specified. "
                "Use run(expression, database='name') or select one available database. "
                f"Available: {opts}"
            )
        database = candidates[0].name

    env = datasets_service.load_database_env(database)
    ast = parse(expression)
    steps: List[Dict[str, Any]] = []
    out = eval_node(ast, env, steps)
    trace = {
        "expression": expression,
        "database": database,
        "steps": steps,
        "final_schema": [c for c in out.columns if c!="_prov"],
        "final_rows": len(out),
        "preview": out[[c for c in out.columns if c!="_prov"]].head(10).to_dict(orient="records"),
    }
    return out, trace
