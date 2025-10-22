from __future__ import annotations

from dataclasses import dataclass


class ServiceError(Exception):
    """Base class for service-layer errors."""


class DatabaseNotFound(ServiceError):
    """Raised when a requested database directory cannot be located."""


class QueryNotFound(ServiceError):
    """Raised when a requested exercise/query id is missing."""


@dataclass
class ParseError(ServiceError):
    """Structured parse error for relational algebra expressions."""

    message: str
    expression: str
    line: int | None = None
    column: int | None = None
    context: str | None = None

    def __str__(self) -> str:  # pragma: no cover - formatting helper
        location = ""
        if self.line is not None and self.column is not None:
            location = f" (line {self.line}, column {self.column})"
        return f"{self.message}{location}"


class EvaluationError(ServiceError):
    """Raised when evaluating a relational algebra expression fails unexpectedly."""
