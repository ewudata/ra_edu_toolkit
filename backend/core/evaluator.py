from __future__ import annotations
from typing import List, Dict, Any
import pandas as pd
import re
import builtins
from . import ra_ast as AST


def _schema(df: pd.DataFrame) -> List[str]:
    return [c for c in df.columns if c != "_prov"]


def _preview(df: pd.DataFrame, limit: int = 10) -> List[Dict[str, Any]]:
    cols = [c for c in df.columns if c != "_prov"]
    if not cols:
        return []
    return df[cols].head(limit).to_dict(orient="records")


_IDENT_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_.]*")


def _replace_identifiers(expr: str) -> str:
    result: List[str] = []
    i = 0
    n = len(expr)
    while i < n:
        ch = expr[i]
        if ch in "'\"":
            quote = ch
            j = i + 1
            while j < n:
                if expr[j] == "\\" and j + 1 < n:
                    j += 2
                    continue
                if expr[j] == quote:
                    j += 1
                    break
                j += 1
            result.append(expr[i:j])
            i = j
            continue

        match = _IDENT_RE.match(expr, i)
        if match:
            token = match.group(0)
            lowered = token.lower()
            if lowered in ("and", "or", "not"):
                result.append(lowered)
            elif lowered == "true":
                result.append("True")
            elif lowered == "false":
                result.append("False")
            else:
                key = lowered.split(".")[-1]
                result.append(f"env.get({key!r})")
            i = match.end()
        else:
            result.append(ch)
            i += 1
    return "".join(result)


def _cond_eval(cond: str, env: Dict[str, Any]) -> bool:
    py = cond
    py = re.sub(r"\bAND\b", "and", py, flags=re.IGNORECASE)
    py = re.sub(r"\bOR\b", "or", py, flags=re.IGNORECASE)
    py = re.sub(r"\bNOT\b", "not", py, flags=re.IGNORECASE)
    # Only convert standalone equality operators; avoid touching >=, <=, !=, ==.
    py = re.sub(r"(?<![<>=!])=(?!=)", "==", py)

    env_ci = {str(k).lower(): v for k, v in env.items()}
    py = _replace_identifiers(py)
    try:
        return bool(builtins.eval(py, {"__builtins__": {}}, {"env": env_ci}))
    except Exception as e:
        print(f"Error evaluating condition: {e}")
        print(f"Condition: {cond}")
        print(f"Environment: {env}")
        print(f"Python code: {py}")
        return False


def _product(L: pd.DataFrame, R: pd.DataFrame) -> pd.DataFrame:
    L = L.copy()
    R = R.copy()
    L["_k"] = 1
    R["_k"] = 1
    M = L.merge(R, on="_k", how="outer", suffixes=("", "_r"))
    if "_k" in M.columns:
        M = M.drop(columns=["_k"])
    L.drop(columns=["_k"], inplace=True)
    R.drop(columns=["_k"], inplace=True)
    if "_prov_x" in M.columns:
        M["_prov"] = M["_prov_x"] + M["_prov_y"]
        M = M.drop(
            columns=[c for c in M.columns if c.endswith("_x") or c.endswith("_y")]
        )
    elif "_prov_r" in M.columns:
        M["_prov"] = M["_prov"] + M["_prov_r"]
        M = M.drop(columns=["_prov_r"])
    return M


def _natural_join(L: pd.DataFrame, R: pd.DataFrame) -> pd.DataFrame:
    common = [c for c in L.columns if c in R.columns and c != "_prov"]
    if not common:
        return _product(L, R)
    M = L.merge(R, on=common, how="inner", suffixes=("", "_r"))
    if "_prov_x" in M.columns:
        M["_prov"] = M["_prov_x"] + M["_prov_y"]
        M = M.drop(
            columns=[c for c in M.columns if c.endswith("_x") or c.endswith("_y")]
        )
    elif "_prov_r" in M.columns:
        M["_prov"] = M["_prov"] + M["_prov_r"]
        M = M.drop(columns=["_prov_r"])
    return M


def _theta_join(L: pd.DataFrame, R: pd.DataFrame, cond: str) -> pd.DataFrame:
    P = _product(L, R)
    keeps = []
    vis = [c for c in P.columns if c != "_prov"]
    for i, row in P.iterrows():
        env = {c: row[c] for c in vis}
        if _cond_eval(cond, env):
            keeps.append(i)
    return P.loc[keeps].reset_index(drop=True)


def _intersection(L: pd.DataFrame, R: pd.DataFrame) -> pd.DataFrame:
    schema = _schema(L)
    left = L[schema + ["_prov"]].drop_duplicates(subset=schema)
    right = R[schema + ["_prov"]].drop_duplicates(subset=schema)
    merged = left.merge(right, on=schema, how="inner", suffixes=("_l", "_r"))
    if merged.empty:
        return pd.DataFrame(columns=schema + ["_prov"])
    prov_left = "_prov_l"
    prov_right = "_prov_r"
    if prov_left in merged.columns and prov_right in merged.columns:
        merged["_prov"] = merged[prov_left] + merged[prov_right]
        merged = merged.drop(columns=[prov_left, prov_right])
    merged = merged.drop_duplicates(subset=schema).reset_index(drop=True)
    return merged


def _division(
    dividend: pd.DataFrame,
    divisor: pd.DataFrame,
    quotient_attrs: List[str],
    divisor_attrs: List[str],
) -> pd.DataFrame:
    if not quotient_attrs:
        raise ValueError("Division requires the divisor to exclude at least one dividend attribute")

    candidates = dividend[quotient_attrs].drop_duplicates().reset_index(drop=True)
    if candidates.empty:
        return pd.DataFrame(columns=quotient_attrs + ["_prov"])

    required = divisor[divisor_attrs].drop_duplicates().reset_index(drop=True)
    if required.empty:
        prov = (
            dividend.groupby(quotient_attrs)["_prov"]
            .agg(lambda series: sum(series, []))
            .reset_index()
        )
        result = candidates.merge(prov, on=quotient_attrs, how="left")
        if "_prov" not in result.columns:
            result["_prov"] = [[] for _ in range(len(result))]
        result["_prov"] = result["_prov"].apply(lambda v: v if isinstance(v, list) else [])
        return result.reset_index(drop=True)

    expected = candidates.merge(required, how="cross")
    actual = dividend[quotient_attrs + divisor_attrs].drop_duplicates()
    coverage = expected.merge(
        actual, on=quotient_attrs + divisor_attrs, how="left", indicator=True
    )
    missing = coverage[coverage["_merge"] == "left_only"]
    if not missing.empty:
        disqualified = missing[quotient_attrs].drop_duplicates()
        valid = candidates.merge(disqualified, on=quotient_attrs, how="left", indicator=True)
        valid = valid[valid["_merge"] == "left_only"].drop(columns=["_merge"])
    else:
        valid = candidates.copy()

    valid = valid.reset_index(drop=True)
    if valid.empty:
        return pd.DataFrame(columns=quotient_attrs + ["_prov"])

    prov = (
        dividend.groupby(quotient_attrs)["_prov"].agg(lambda series: sum(series, []))
        .reset_index()
    )
    result = valid.merge(prov, on=quotient_attrs, how="left")
    if "_prov" not in result.columns:
        result["_prov"] = [[] for _ in range(len(result))]
    result["_prov"] = result["_prov"].apply(lambda v: v if isinstance(v, list) else [])
    return result.reset_index(drop=True)


def eval(
    node: AST.Node, env: Dict[str, pd.DataFrame], steps: List[Dict[str, Any]]
) -> pd.DataFrame:
    if isinstance(node, AST.Relation):
        key = node.name.lower()
        if key not in env:
            available = ", ".join(sorted(env.keys())) or "<none>"
            raise KeyError(
                f"Relation '{node.name}' not found. Available relations: {available}"
            )
        df = env[key].copy()
        steps.append(
            {
                "op": "rel",
                "detail": node.name,
                "output_schema": _schema(df),
                "rows": len(df),
                "preview": _preview(df),
            }
        )
        return df
    if isinstance(node, AST.Projection):
        inp = eval(node.sub, env, steps)
        out = (
            inp[node.attrs + ["_prov"]]
            .copy()
            .drop_duplicates(subset=node.attrs)
            .reset_index(drop=True)
        )
        steps.append(
            {
                "op": "π",
                "detail": {"attrs": node.attrs},
                "input_schema": _schema(inp),
                "output_schema": _schema(out),
                "delta": {
                    "rows_before": len(inp),
                    "rows_after": len(out),
                    "note": "Projection drops non-listed attributes and removes duplicates.",
                },
                "preview": _preview(out),
            }
        )
        return out
    if isinstance(node, AST.Selection):
        inp = eval(node.sub, env, steps)
        vis = [c for c in inp.columns if c != "_prov"]
        keeps = []
        for i, row in inp.iterrows():
            if _cond_eval(node.cond, {c: row[c] for c in vis}):
                keeps.append(i)
        out = inp.loc[keeps].reset_index(drop=True)
        steps.append(
            {
                "op": "σ",
                "detail": {"cond": node.cond},
                "input_schema": _schema(inp),
                "output_schema": _schema(out),
                "delta": {
                    "rows_before": len(inp),
                    "rows_after": len(out),
                    "note": "Selection keeps rows satisfying the predicate; schema unchanged.",
                },
                "preview": _preview(out),
            }
        )
        return out
    if isinstance(node, AST.Rename):
        inp = eval(node.sub, env, steps)
        m = {o: n for o, n in node.pairs}
        for o in m:
            if o not in inp.columns:
                raise ValueError(f"Cannot rename missing '{o}'")
        if any((n in inp.columns and n != o) for o, n in node.pairs):
            raise ValueError("Rename target already exists")
        out = inp.rename(columns=m).copy()
        steps.append(
            {
                "op": "ρ",
                "detail": {"renames": node.pairs},
                "input_schema": _schema(inp),
                "output_schema": _schema(out),
                "preview": _preview(out),
            }
        )
        return out
    if isinstance(node, AST.Join):
        L = eval(node.left, env, steps)
        R = eval(node.right, env, steps)
        if node.theta and node.theta.strip():
            out = _theta_join(L, R, node.theta)
            op = "⋈_θ"
            detail = {"cond": node.theta}
        else:
            out = _natural_join(L, R)
            op = "⋈"
            detail = {"on_common_names": True}
        steps.append(
            {
                "op": op,
                "detail": detail,
                "input_schema": {"left": _schema(L), "right": _schema(R)},
                "output_schema": _schema(out),
                "delta": {"rows_after": len(out)},
                "preview": _preview(out),
            }
        )
        return out
    if isinstance(node, AST.Product):
        L = eval(node.left, env, steps)
        R = eval(node.right, env, steps)
        out = _product(L, R)
        steps.append(
            {
                "op": "×",
                "input_schema": {"left": _schema(L), "right": _schema(R)},
                "output_schema": _schema(out),
                "preview": _preview(out),
            }
        )
        return out
    if isinstance(node, AST.Union):
        L = eval(node.left, env, steps)
        R = eval(node.right, env, steps)
        al, ar = _schema(L), _schema(R)
        if al != ar:
            raise ValueError(f"Union-compatibility failed: {al} vs {ar}")
        tmp = pd.concat([L[al + ["_prov"]], R[ar + ["_prov"]]], ignore_index=True)
        tmp = tmp.drop_duplicates(subset=al).reset_index(drop=True)
        steps.append(
            {
                "op": "∪",
                "input_schema": {"left": al, "right": ar},
                "output_schema": al,
                "delta": {"rows_after": len(tmp)},
                "preview": _preview(tmp),
            }
        )
        return tmp
    if isinstance(node, AST.Difference):
        L = eval(node.left, env, steps)
        R = eval(node.right, env, steps)
        al, ar = _schema(L), _schema(R)
        if al != ar:
            raise ValueError(f"Difference requires identical schemas: {al} vs {ar}")
        merged = L.merge(R[ar], on=al, how="left", indicator=True)
        out = (
            merged[merged["_merge"] == "left_only"]
            .drop(columns=["_merge"])
            .reset_index(drop=True)
        )
        out["_prov"] = L.loc[out.index, "_prov"].tolist() if len(out) > 0 else []
        steps.append(
            {
                "op": "−",
                "input_schema": {"left": al, "right": ar},
                "output_schema": al,
                "delta": {"rows_after": len(out)},
                "preview": _preview(out),
            }
        )
        return out
    if isinstance(node, AST.Intersection):
        L = eval(node.left, env, steps)
        R = eval(node.right, env, steps)
        al, ar = _schema(L), _schema(R)
        if al != ar:
            raise ValueError(f"Intersection requires identical schemas: {al} vs {ar}")
        out = _intersection(L, R)
        steps.append(
            {
                "op": "∩",
                "input_schema": {"left": al, "right": ar},
                "output_schema": _schema(out),
                "delta": {"rows_after": len(out)},
                "preview": _preview(out),
            }
        )
        return out
    if isinstance(node, AST.Division):
        dividend = eval(node.left, env, steps)
        divisor = eval(node.right, env, steps)
        dividend_schema = _schema(dividend)
        divisor_schema = _schema(divisor)
        if not set(divisor_schema).issubset(dividend_schema):
            raise ValueError(
                "Division requires divisor attributes to be a subset of dividend attributes"
            )
        quotient_attrs = [c for c in dividend_schema if c not in divisor_schema]
        out = _division(dividend, divisor, quotient_attrs, divisor_schema)
        steps.append(
            {
                "op": "÷",
                "detail": {
                    "quotient_attrs": quotient_attrs,
                    "divisor_attrs": divisor_schema,
                },
                "input_schema": {
                    "left": dividend_schema,
                    "right": divisor_schema,
                },
                "output_schema": _schema(out),
                "delta": {"rows_after": len(out)},
                "preview": _preview(out),
            }
        )
        return out
    raise TypeError(f"Unsupported node type: {type(node)}")
