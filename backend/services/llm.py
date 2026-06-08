from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import requests

logger = logging.getLogger(__name__)
uvicorn_logger = logging.getLogger("uvicorn.error")


class LlmConfigurationError(RuntimeError):
    """Raised when the LLM provider is not configured."""


class LlmProviderError(RuntimeError):
    """Raised when the LLM provider request fails."""


@dataclass
class HintResponse:
    hint: str
    model: str


def _llm_base_url() -> str:
    return os.getenv("LLM_BASE_URL", "").rstrip("/")


def _llm_api_key() -> str:
    return os.getenv("LLM_API_KEY", "")


def _llm_model() -> str:
    return os.getenv("LLM_MODEL", "gemma4:e4b-mlx")


def _llm_enabled() -> bool:
    return os.getenv("LLM_ENABLED", "True").lower() in {"1", "true", "yes", "on"}


def _require_config() -> tuple[str, str, str]:
    if not _llm_enabled():
        raise LlmConfigurationError("LLM features are disabled.")
    base_url = _llm_base_url()
    api_key = _llm_api_key()
    model = _llm_model()
    if not base_url or not api_key or not model:
        raise LlmConfigurationError(
            "LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL must be configured."
        )
    return base_url, api_key, model


def _format_schema(schema: List[Dict[str, Any]]) -> str:
    lines: List[str] = []
    for table in schema:
        columns = table.get("columns", [])
        column_names = [
            str(column.get("name", "")).strip()
            for column in columns
            if str(column.get("name", "")).strip()
        ]
        lines.append(f"- {table.get('name')}: ({', '.join(column_names)})")
    return "\n".join(lines) if lines else "- No schema available"


def generate_ra_hint(
    *,
    database: str,
    prompt: str,
    difficulty: Optional[str],
    expected_operators: List[str],
    schema: List[Dict[str, Any]],
    student_expression: Optional[str],
    evaluation_context: Dict[str, Any],
) -> HintResponse:
    base_url, api_key, model = _require_config()

    system_prompt = (
        "You are a database education tutor helping a student learn relational algebra. "
        "Give one concise, actionable hint. Do not reveal the full relational algebra "
        "solution, SQL solution, or exact final answer rows. Focus on the next concept "
        "the student should check. Keep the response under 90 words."
    )
    user_prompt = "\n".join(
        [
            f"Database: {database}",
            f"Prompt: {prompt}",
            f"Difficulty: {difficulty or 'unspecified'}",
            f"Expected operator families: {', '.join(expected_operators) or 'unspecified'}",
            "Schema:",
            _format_schema(schema),
            f"Student expression: {student_expression or '(none yet)'}",
            f"Deterministic evaluation context: {evaluation_context}",
            "",
            "Return only the hint text.",
        ]
    )
    prompt_log_message = (
        "Generating RA hint with LLM prompt\n"
        f"model={model}\n"
        f"database={database}\n"
        "system_prompt:\n"
        f"{system_prompt}\n"
        "user_prompt:\n"
        f"{user_prompt}"
    )
    logger.info(prompt_log_message)
    uvicorn_logger.info(prompt_log_message)

    try:
        response = requests.post(
            f"{base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.3,
                "max_tokens": 512,
            },
            timeout=60,
        )
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        raise LlmProviderError(f"LLM provider request failed: {exc}") from exc
    except ValueError as exc:
        raise LlmProviderError("LLM provider returned invalid JSON.") from exc

    choices = payload.get("choices")
    if not choices:
        raise LlmProviderError("LLM provider returned no choices.")
    choice = choices[0]
    message = choice.get("message") or {}
    hint = str(message.get("content") or choice.get("text") or "").strip()
    if not hint:
        raise LlmProviderError("LLM provider returned an empty hint.")
    return HintResponse(hint=hint, model=model)
