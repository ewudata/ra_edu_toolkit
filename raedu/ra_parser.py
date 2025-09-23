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
        # items = [attr_list, sub]
        attrs, sub = items
        if not isinstance(attrs, list):
            attrs = [str(attrs)]
        else:
            attrs = [str(a) for a in attrs]
        return AST.Projection(attrs, sub)

    def selection(self, items):
        cond = str(items[0]).strip()
        sub = items[1]
        return AST.Selection(cond, sub)

    def rename(self, items):
        pairs = items[0]
        sub = items[1]
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
    grammar = _GRAmMAR_PATH.read_text(encoding="utf-8")
    return Lark(grammar, parser="lalr", maybe_placeholders=False)

# Fix: correct variable name
def _build_parser_fixed():
    grammar = _GRAMMAR_PATH.read_text(encoding="utf-8")
    return Lark(grammar, parser="lalr", maybe_placeholders=False)

_PARSER = _build_parser_fixed()

def parse(text: str):
    return _ToAST().transform(_PARSER.parse(text))