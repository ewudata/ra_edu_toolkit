from __future__ import annotations

import logging
import json
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


@dataclass
class ErrorExplanationResponse:
    explanation: str
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


def _chat_completion(
    *,
    base_url: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
) -> Dict[str, Any]:
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
        return response.json()
    except requests.RequestException as exc:
        raise LlmProviderError(f"LLM provider request failed: {exc}") from exc
    except ValueError as exc:
        raise LlmProviderError("LLM provider returned invalid JSON.") from exc


def _choice_text(payload: Dict[str, Any], *, empty_message: str) -> str:
    choices = payload.get("choices")
    if not choices:
        raise LlmProviderError("LLM provider returned no choices.")
    choice = choices[0]
    message = choice.get("message") or {}
    text = str(message.get("content") or choice.get("text") or "").strip()
    if not text:
        raise LlmProviderError(empty_message)
    return text


def _limit_words(text: str, max_words: int) -> str:
    words = text.split()
    if len(words) <= max_words:
        return text
    return " ".join(words[:max_words]).rstrip(".,;:") + "..."


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
    is_translation_check = evaluation_context.get("task") == "translation_check"

    if is_translation_check:
        system_prompt = (
            "You are a database education tutor reviewing one RA/SQL translation attempt. "
            "Give exactly one concise, actionable hint targeted at the student's main underlying error. "
            "Read the entire deterministic context before choosing the hint focus; do not stop at the first mismatched clause or schema difference. "
            "Use the deterministic context to identify the most important mismatch in schema, rows, clause, predicate, projection, join, alias, or set operation. "
            "Do not give general study advice. Do not list multiple possible problems. Do not reveal the full relational algebra solution, SQL solution, or exact final answer rows. "
            "Maximum 35 words."
        )
        user_prompt = "\n".join(
            [
                f"Database: {database}",
                f"Task prompt: {prompt}",
                f"Translation direction: {evaluation_context.get('direction') or 'unspecified'}",
                f"Source expression the student is translating: {evaluation_context.get('source_expression') or '(unavailable)'}",
                f"Canonical target expression for diagnosis only, do not reveal it: {evaluation_context.get('canonical_target_expression') or '(unavailable)'}",
                f"Student target expression: {student_expression or '(none yet)'}",
                f"Deterministic check summary: {evaluation_context}",
                "",
                "Return only the targeted hint text. Mention the most important concrete mismatch from the student's answer, not a broad checklist.",
            ]
        )
    else:
        system_prompt = (
            "You are a database education tutor helping a student learn relational algebra. "
            "Give one concise, actionable hint targeted at the student's main underlying error. "
            "Read the entire deterministic context before choosing the hint focus; do not stop at the first mismatch, schema difference, or operator name. "
            "Use the deterministic context to identify the most important mismatch in schema, rows, operator, predicate, projection, join, rename, or set operation. "
            "Do not give general study advice. Do not list multiple possible problems. Do not reveal the "
            "full relational algebra solution, SQL solution, or exact final answer rows. "
            "Maximum 35 words."
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
                "Return only the targeted hint text. Mention the most important concrete mismatch from the student's answer, not a broad checklist.",
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

    payload = _chat_completion(
        base_url=base_url,
        api_key=api_key,
        model=model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
    )

    hint = _limit_words(
        _choice_text(payload, empty_message="LLM provider returned an empty hint."),
        45,
    )
    return HintResponse(hint=hint, model=model)


def explain_ra_error(
    *,
    database: str,
    expression: str,
    error_context: Dict[str, Any],
    schema: List[Dict[str, Any]],
    grammar_help: str,
) -> ErrorExplanationResponse:
    base_url, api_key, model = _require_config()

    system_prompt = (
        "You are a database education tutor. Explain deterministic relational algebra "
        "parse/evaluation errors in student-friendly language. Do not grade correctness "
        "or provide a full solution. Return valid JSON with exactly two string keys: "
        "\"explanation\" and \"hint\". Keep each value to one short sentence, "
        "maximum 25 words each."
    )
    user_prompt = "\n".join(
        [
            f"Database: {database}",
            "Schema:",
            _format_schema(schema),
            "Supported relational algebra syntax:",
            grammar_help,
            f"Student expression: {expression}",
            f"Deterministic error context: {error_context}",
            "",
            "Return JSON only.",
        ]
    )
    prompt_log_message = (
        "Explaining RA error with LLM prompt\n"
        f"model={model}\n"
        f"database={database}\n"
        "system_prompt:\n"
        f"{system_prompt}\n"
        "user_prompt:\n"
        f"{user_prompt}"
    )
    logger.info(prompt_log_message)
    uvicorn_logger.info(prompt_log_message)

    payload = _chat_completion(
        base_url=base_url,
        api_key=api_key,
        model=model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
    )
    content = _choice_text(
        payload,
        empty_message="LLM provider returned an empty error explanation.",
    )

    try:
        parsed = json.loads(content)
        explanation = str(parsed.get("explanation") or "").strip()
        hint = str(parsed.get("hint") or "").strip()
    except (TypeError, ValueError, AttributeError):
        explanation = content
        hint = "Review the RA operator syntax and make the smallest correction before trying again."

    if not explanation:
        explanation = "The expression could not be parsed or evaluated."
    if not hint:
        hint = "Review the RA syntax near the reported error location."

    return ErrorExplanationResponse(
        explanation=_limit_words(explanation, 30),
        hint=_limit_words(hint, 30),
        model=model,
    )


def explain_sql_error(
    *,
    database: str,
    sql: str,
    error_context: Dict[str, Any],
    schema: List[Dict[str, Any]],
) -> ErrorExplanationResponse:
    base_url, api_key, model = _require_config()

    system_prompt = (
        "You are a database education tutor. Explain SQL execution errors in student-friendly language. "
        "Do not grade correctness or provide a full solution. Return valid JSON with exactly two string keys: "
        "\"explanation\" and \"hint\". Keep each value to one short sentence, maximum 25 words each."
    )
    user_prompt = "\n".join(
        [
            f"Database: {database}",
            "Schema:",
            _format_schema(schema),
            f"Student SQL: {sql}",
            f"Deterministic error context: {error_context}",
            "",
            "Return JSON only.",
        ]
    )
    prompt_log_message = (
        "Explaining SQL error with LLM prompt\n"
        f"model={model}\n"
        f"database={database}\n"
        "system_prompt:\n"
        f"{system_prompt}\n"
        "user_prompt:\n"
        f"{user_prompt}"
    )
    logger.info(prompt_log_message)
    uvicorn_logger.info(prompt_log_message)

    payload = _chat_completion(
        base_url=base_url,
        api_key=api_key,
        model=model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
    )
    content = _choice_text(
        payload,
        empty_message="LLM provider returned an empty SQL error explanation.",
    )

    try:
        parsed = json.loads(content)
        explanation = str(parsed.get("explanation") or "").strip()
        hint = str(parsed.get("hint") or "").strip()
    except (TypeError, ValueError, AttributeError):
        explanation = content
        hint = "Review the SQL syntax and table/column names before trying again."

    if not explanation:
        explanation = "The SQL statement could not be executed."
    if not hint:
        hint = "Check the table and column names against the schema."

    return ErrorExplanationResponse(
        explanation=_limit_words(explanation, 30),
        hint=_limit_words(hint, 30),
        model=model,
    )
