from __future__ import annotations
from dataclasses import dataclass
from typing import List, Tuple, Optional

@dataclass
class Node: ...
@dataclass
class Relation(Node):
    name: str
@dataclass
class Projection(Node):
    attrs: List[str]
    sub: Node
@dataclass
class Selection(Node):
    cond: str
    sub: Node
@dataclass
class Rename(Node):
    pairs: List[Tuple[str,str]]
    sub: Node
@dataclass
class Join(Node):
    left: Node
    right: Node
    theta: Optional[str] = None
@dataclass
class Product(Node):
    left: Node
    right: Node
@dataclass
class Union(Node):
    left: Node
    right: Node
@dataclass
class Difference(Node):
    left: Node
    right: Node