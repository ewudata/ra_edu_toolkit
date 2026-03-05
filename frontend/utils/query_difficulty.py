"""Helpers for normalizing and ordering query difficulty levels."""

from __future__ import annotations

from typing import Any, Dict, List

_DIFFICULTY_ORDER = {"beginner": 0, "intermediate": 1, "difficult": 2}
_DIFFICULTY_ALIASES = {"advanced": "difficult"}


def normalize_difficulty(difficulty: Any) -> str:
    value = str(difficulty or "").strip().lower()
    normalized = _DIFFICULTY_ALIASES.get(value, value)
    if normalized in _DIFFICULTY_ORDER:
        return normalized
    return "unknown"


def difficulty_sort_rank(difficulty: Any) -> int:
    normalized = normalize_difficulty(difficulty)
    return _DIFFICULTY_ORDER.get(normalized, 99)


def difficulty_display_label(difficulty: Any) -> str:
    normalized = normalize_difficulty(difficulty)
    if normalized == "unknown":
        return "Unknown difficulty"
    return normalized.title()


def sort_queries_by_difficulty(queries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return a new query list sorted by difficulty, then by prompt/id."""
    return sorted(
        queries,
        key=lambda query: (
            difficulty_sort_rank(query.get("difficulty")),
            str(query.get("prompt") or "").lower(),
            str(query.get("id") or "").lower(),
        ),
    )
