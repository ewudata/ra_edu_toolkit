from __future__ import annotations
from typing import Any, List
from lark import Lark, Transformer, Token, Tree
from pathlib import Path
from . import ra_ast as AST

_GRAMMAR_PATH = Path(__file__).parent / "grammar" / "ra_grammar.lark"


class _ToAST(Transformer):
    def relation(self, items):
        return AST.Relation(str(items[0]).lower())

    def projection(self, items):
        # items = [PI, attr_list, sub]
        pi_token, attrs, sub = items
        if not isinstance(attrs, list):
            attrs = [str(attrs)]
        else:
            attrs = [str(a) for a in attrs]
        return AST.Projection([a.lower() for a in attrs], sub)

    def selection(self, items):
        # items = [SIGMA, cond, sub]
        sigma_token, cond, sub = items
        return AST.Selection(str(cond).strip(), sub)

    def rename(self, items):
        # items = [RHO, pairs, sub]
        rho_token, pairs, sub = items
        return AST.Rename(pairs, sub)

    def expr(self, items):
        if not items:
            raise ValueError("Expression produced no terms")

        node = items[0]
        idx = 1
        while idx < len(items):
            tok = items[idx]
            if not isinstance(tok, Token):
                idx += 1
                continue

            typ = tok.type
            if typ == "JOIN":
                idx += 1
                theta = None
                while idx < len(items) and not isinstance(items[idx], AST.Node):
                    current = items[idx]
                    if isinstance(current, str):
                        theta = current.strip() or None
                    idx += 1
                if idx >= len(items) or not isinstance(items[idx], AST.Node):
                    raise ValueError("JOIN requires a right-hand expression")
                right = items[idx]
                node = AST.Join(node, right, theta)
                idx += 1
                continue

            if idx + 1 >= len(items) or not isinstance(items[idx + 1], AST.Node):
                raise ValueError(f"Operator {typ} missing right-hand expression")

            right = items[idx + 1]
            if typ == "PRODUCT":
                node = AST.Product(node, right)
            elif typ == "UNION":
                node = AST.Union(node, right)
            elif typ == "DIFF":
                node = AST.Difference(node, right)
            elif typ == "INTERSECT":
                node = AST.Intersection(node, right)
            elif typ == "DIV":
                node = AST.Division(node, right)
            else:
                raise ValueError(f"Unsupported operator token: {typ}")
            idx += 2

        return node

    def attr_list(self, items):
        return [str(x).lower() for x in items]

    def rename_pair(self, items):
        old, new = items
        return (str(old).lower(), str(new).lower())

    def rename_list(self, items):
        return items

    def NAME(self, tk: Token):
        return str(tk)

    def COND(self, tk: Token):
        return str(tk)

    def __default__(self, data, children, meta):
        # Pass through for now; left-assoc binary ops will be handled by reducer
        return Tree(data, children)


def _build_parser():
    grammar = _GRAMMAR_PATH.read_text(encoding="utf-8")
    return Lark(grammar, parser="lalr", maybe_placeholders=False)


def _build_parser_fixed():
    grammar = _GRAMMAR_PATH.read_text(encoding="utf-8")
    return Lark(grammar, parser="lalr", maybe_placeholders=False)


_PARSER = _build_parser_fixed()


def parse(text: str):
    return _ToAST().transform(_PARSER.parse(text))
