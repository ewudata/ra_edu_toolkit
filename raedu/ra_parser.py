from __future__ import annotations
from typing import Any, List
from lark import Lark, Transformer, Token, Tree
from pathlib import Path
from . import ra_ast as AST

_GRAMMAR_PATH = Path(__file__).parent / "grammar" / "ra_grammar.lark"


class _ToAST(Transformer):
    def relation(self, items):
        return AST.Relation(str(items[0]))

    def projection(self, items):
        # items = [PI, attr_list, sub]
        pi_token, attrs, sub = items
        if not isinstance(attrs, list):
            attrs = [str(attrs)]
        else:
            attrs = [str(a) for a in attrs]
        return AST.Projection(attrs, sub)

    def selection(self, items):
        # items = [SIGMA, cond, sub]
        sigma_token, cond, sub = items
        return AST.Selection(str(cond).strip(), sub)

    def rename(self, items):
        # items = [RHO, pairs, sub]
        rho_token, pairs, sub = items
        return AST.Rename(pairs, sub)

    def attr_list(self, items):
        return [str(x) for x in items]

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
