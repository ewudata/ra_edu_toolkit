from __future__ import annotations
from typing import List, Dict, Any
import pandas as pd
import re
from . import ra_ast as AST

def _schema(df: pd.DataFrame) -> List[str]:
    return [c for c in df.columns if c != "_prov"]

def _cond_eval(cond: str, env: Dict[str, Any]) -> bool:
    py = cond.replace("AND","and").replace("OR","or").replace("NOT","not").replace("=", "==")
    def repl(m):
        name = m.group(0)
        if name in ("and","or","not","True","False"): return name
        key = name.split(".")[-1]
        return f"env.get({key!r})"
    py = re.sub(r"\b[A-Za-z_][A-Za-z0-9_\.]*\b", repl, py)
    try:
        return bool(eval(py, {"__builtins__": {}}, {"env": env}))
    except Exception:
        return False

def _product(L: pd.DataFrame, R: pd.DataFrame) -> pd.DataFrame:
    L = L.copy(); R = R.copy()
    L["_k"]=1; R["_k"]=1
    M = L.merge(R, on="_k", how="outer", suffixes=("","_r"))
    L.drop(columns=["_k"], inplace=True); R.drop(columns=["_k"], inplace=True)
    if "_prov_x" in M.columns:
        M["_prov"] = M["_prov_x"] + M["_prov_y"]
        M = M.drop(columns=[c for c in M.columns if c.endswith("_x") or c.endswith("_y")])
    elif "_prov_r" in M.columns:
        M["_prov"] = M["_prov"] + M["_prov_r"]
        M = M.drop(columns=["_prov_r"])
    return M

def _natural_join(L: pd.DataFrame, R: pd.DataFrame) -> pd.DataFrame:
    common = [c for c in L.columns if c in R.columns and c!="_prov"]
    if not common:
        return _product(L,R)
    M = L.merge(R, on=common, how="inner", suffixes=("","_r"))
    if "_prov_x" in M.columns:
        M["_prov"] = M["_prov_x"] + M["_prov_y"]
        M = M.drop(columns=[c for c in M.columns if c.endswith("_x") or c.endswith("_y")])
    elif "_prov_r" in M.columns:
        M["_prov"] = M["_prov"] + M["_prov_r"]
        M = M.drop(columns=["_prov_r"])
    return M

def _theta_join(L: pd.DataFrame, R: pd.DataFrame, cond: str) -> pd.DataFrame:
    P = _product(L,R)
    keeps=[]
    vis=[c for c in P.columns if c!="_prov"]
    for i,row in P.iterrows():
        env = {c: row[c] for c in vis}
        if _cond_eval(cond, env):
            keeps.append(i)
    return P.loc[keeps].reset_index(drop=True)

def eval(node: AST.Node, env: Dict[str, pd.DataFrame], steps: List[Dict[str, Any]]) -> pd.DataFrame:
    if isinstance(node, AST.Relation):
        df = env[node.name].copy()
        steps.append({"op":"rel","detail":node.name,"output_schema":_schema(df),"rows":len(df)})
        return df
    if isinstance(node, AST.Projection):
        inp = eval(node.sub, env, steps)
        out = inp[node.attrs + ["_prov"]].copy().drop_duplicates(subset=node.attrs).reset_index(drop=True)
        steps.append({"op":"π","detail":{"attrs":node.attrs},"input_schema":_schema(inp),"output_schema":_schema(out),
                      "delta":{"rows_before":len(inp),"rows_after":len(out),"note":"Projection drops non-listed attributes and removes duplicates."}})
        return out
    if isinstance(node, AST.Selection):
        inp = eval(node.sub, env, steps)
        vis=[c for c in inp.columns if c!="_prov"]
        keeps=[]
        for i,row in inp.iterrows():
            if _cond_eval(node.cond, {c:row[c] for c in vis}):
                keeps.append(i)
        out = inp.loc[keeps].reset_index(drop=True)
        steps.append({"op":"σ","detail":{"cond":node.cond},"input_schema":_schema(inp),"output_schema":_schema(out),
                      "delta":{"rows_before":len(inp),"rows_after":len(out),"note":"Selection keeps rows satisfying the predicate; schema unchanged."}})
        return out
    if isinstance(node, AST.Rename):
        inp = eval(node.sub, env, steps)
        m = {o:n for o,n in node.pairs}
        for o in m:
            if o not in inp.columns: raise ValueError(f"Cannot rename missing '{o}'")
        if any((n in inp.columns and n!=o) for o,n in node.pairs):
            raise ValueError("Rename target already exists")
        out = inp.rename(columns=m).copy()
        steps.append({"op":"ρ","detail":{"renames":node.pairs},"input_schema":_schema(inp),"output_schema":_schema(out)})
        return out
    if isinstance(node, AST.Join):
        L = eval(node.left, env, steps)
        R = eval(node.right, env, steps)
        if node.theta and node.theta.strip():
            out = _theta_join(L,R,node.theta)
            op = "⋈_θ"; detail = {"cond": node.theta}
        else:
            out = _natural_join(L,R)
            op = "⋈"; detail = {"on_common_names": True}
        steps.append({"op":op,"detail":detail,"input_schema":{"left":_schema(L),"right":_schema(R)},"output_schema":_schema(out),
                      "delta":{"rows_after":len(out)}})
        return out
    if isinstance(node, AST.Product):
        L = eval(node.left, env, steps); R = eval(node.right, env, steps)
        out = _product(L,R)
        steps.append({"op":"×","input_schema":{"left":_schema(L),"right":_schema(R)},"output_schema":_schema(out)})
        return out
    if isinstance(node, AST.Union):
        L = eval(node.left, env, steps); R = eval(node.right, env, steps)
        al, ar = _schema(L), _schema(R)
        if al != ar:
            raise ValueError(f"Union-compatibility failed: {al} vs {ar}")
        tmp = pd.concat([L[al+['_prov']], R[ar+['_prov']]], ignore_index=True)
        tmp = tmp.drop_duplicates(subset=al).reset_index(drop=True)
        steps.append({"op":"∪","input_schema":{"left":al,"right":ar},"output_schema":al,"delta":{"rows_after":len(tmp)}})
        return tmp
    if isinstance(node, AST.Difference):
        L = eval(node.left, env, steps); R = eval(node.right, env, steps)
        al, ar = _schema(L), _schema(R)
        if al != ar:
            raise ValueError(f"Difference requires identical schemas: {al} vs {ar}")
        merged = L.merge(R[ar], on=al, how="left", indicator=True)
        out = merged[merged["_merge"]=="left_only"].drop(columns=["_merge"]).reset_index(drop=True)
        out["_prov"] = L.loc[out.index, "_prov"].tolist() if len(out)>0 else []
        steps.append({"op":"−","input_schema":{"left":al,"right":ar},"output_schema":al,"delta":{"rows_after":len(out)}})
        return out
    raise TypeError(f"Unsupported node type: {type(node)}")