from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlencode

import requests


class SupabaseError(Exception):
    """Base class for Supabase integration errors."""


class SupabaseConfigError(SupabaseError):
    """Raised when required Supabase settings are missing."""


class SupabaseAuthError(SupabaseError):
    """Raised when Supabase auth fails."""


class SupabaseDatasetError(SupabaseError):
    """Raised when Supabase dataset metadata operations fail."""


class SupabaseStorageError(SupabaseError):
    """Raised when Supabase Storage operations fail."""


_OAUTH_STATE_TTL_SECONDS = 600


@dataclass
class DefaultDatasetRow:
    dataset_name: str
    bucket_name: str
    object_prefix: str
    enabled: bool


@dataclass
class UserDatasetRow:
    database_name: str
    source_type: str
    bucket_name: str
    object_prefix: str
    is_default: bool
    hidden: bool


def _required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise SupabaseConfigError(f"Missing required environment variable: {name}")
    return value


def _supabase_url() -> str:
    raw = _required_env("SUPABASE_URL").rstrip("/")
    if raw.startswith("http://") or raw.startswith("https://"):
        return raw
    return f"https://{raw}.supabase.co"


def _anon_key() -> str:
    return _required_env("SUPABASE_ANON_KEY")


def _service_role_key() -> str:
    return _required_env("SUPABASE_SERVICE_ROLE_KEY")


def _backend_base_url() -> str:
    return os.getenv("BACKEND_BASE_URL", "http://localhost:8000").rstrip("/")


def _oauth_state_secret() -> bytes:
    value = _required_env("OAUTH_STATE_SECRET")
    return value.encode("utf-8")


def _default_user_bucket() -> str:
    return os.getenv("SUPABASE_USER_DATASETS_BUCKET", "ra-user-datasets").strip()


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _b64url_decode(raw: str) -> bytes:
    padding = "=" * ((4 - len(raw) % 4) % 4)
    return base64.urlsafe_b64decode(raw + padding)


def _join_prefix(prefix: str, name: str) -> str:
    p = prefix.strip("/")
    n = name.strip("/")
    if not p:
        return n
    if not n:
        return p
    return f"{p}/{n}"


def _service_headers() -> Dict[str, str]:
    key = _service_role_key()
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
    }


def _request_json(
    method: str,
    url: str,
    *,
    headers: Optional[Dict[str, str]] = None,
    params: Optional[Dict[str, str]] = None,
    json_body: Optional[Any] = None,
    data: Optional[bytes] = None,
    timeout: int = 20,
    error_cls: type[SupabaseError] = SupabaseError,
    error_message: str = "Supabase request failed.",
) -> Any:
    response = requests.request(
        method,
        url,
        headers=headers,
        params=params,
        json=json_body,
        data=data,
        timeout=timeout,
    )
    if response.status_code >= 400:
        detail = response.text.strip() or error_message
        raise error_cls(detail)
    if not response.content:
        return {}
    try:
        return response.json()
    except ValueError as exc:
        raise error_cls("Supabase response was not valid JSON.") from exc


def _request_bytes(
    method: str,
    url: str,
    *,
    headers: Optional[Dict[str, str]] = None,
    params: Optional[Dict[str, str]] = None,
    timeout: int = 20,
    error_cls: type[SupabaseError] = SupabaseError,
    error_message: str = "Supabase request failed.",
) -> bytes:
    response = requests.request(
        method,
        url,
        headers=headers,
        params=params,
        timeout=timeout,
    )
    if response.status_code >= 400:
        detail = response.text.strip() or error_message
        raise error_cls(detail)
    return response.content


def _generate_code_verifier() -> str:
    return secrets.token_urlsafe(64)


def _code_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")


def _encode_oauth_context(*, verifier: str, frontend_redirect: str) -> str:
    payload = {
        "v": verifier,
        "r": frontend_redirect,
        "e": int(time.time()) + _OAUTH_STATE_TTL_SECONDS,
    }
    payload_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    signature = hmac.new(
        _oauth_state_secret(), payload_bytes, hashlib.sha256
    ).digest()
    return f"{_b64url_encode(payload_bytes)}.{_b64url_encode(signature)}"


def _decode_oauth_context(context_token: str) -> Tuple[str, str]:
    parts = context_token.split(".", 1)
    if len(parts) != 2:
        raise SupabaseAuthError("OAuth context format is invalid.")

    payload_raw, signature_raw = parts
    try:
        payload_bytes = _b64url_decode(payload_raw)
        signature = _b64url_decode(signature_raw)
    except Exception as exc:
        raise SupabaseAuthError("OAuth context could not be decoded.") from exc

    expected_signature = hmac.new(
        _oauth_state_secret(), payload_bytes, hashlib.sha256
    ).digest()
    if not hmac.compare_digest(signature, expected_signature):
        raise SupabaseAuthError("OAuth context signature is invalid.")

    try:
        payload = json.loads(payload_bytes.decode("utf-8"))
    except Exception as exc:
        raise SupabaseAuthError("OAuth context payload is invalid.") from exc

    expires_at = int(payload.get("e", 0))
    if expires_at < int(time.time()):
        raise SupabaseAuthError("OAuth context has expired.")

    verifier = str(payload.get("v") or "")
    frontend_redirect = str(payload.get("r") or "")
    if not verifier or not frontend_redirect:
        raise SupabaseAuthError("OAuth context payload is incomplete.")
    return verifier, frontend_redirect


def build_google_oauth_url(frontend_redirect: str) -> str:
    verifier = _generate_code_verifier()
    context_token = _encode_oauth_context(
        verifier=verifier, frontend_redirect=frontend_redirect
    )
    callback_query = urlencode({"ctx": context_token})
    callback_url = f"{_backend_base_url()}/auth/google/callback?{callback_query}"
    query = urlencode(
        {
            "provider": "google",
            "redirect_to": callback_url,
            "code_challenge": _code_challenge(verifier),
            "code_challenge_method": "s256",
        }
    )
    return f"{_supabase_url()}/auth/v1/authorize?{query}"


def exchange_google_oauth_code(
    code: str, context_token: str
) -> tuple[Dict[str, Any], str]:
    verifier, frontend_redirect = _decode_oauth_context(context_token)
    payload = _request_json(
        "POST",
        f"{_supabase_url()}/auth/v1/token?grant_type=pkce",
        headers={
            "apikey": _anon_key(),
            "Content-Type": "application/json",
        },
        json_body={"auth_code": code, "code_verifier": verifier},
        error_cls=SupabaseAuthError,
        error_message="Failed to exchange Google OAuth code.",
    )
    return payload, frontend_redirect


def verify_access_token(access_token: str) -> Dict[str, Any]:
    payload = _request_json(
        "GET",
        f"{_supabase_url()}/auth/v1/user",
        headers={
            "apikey": _anon_key(),
            "Authorization": f"Bearer {access_token}",
        },
        error_cls=SupabaseAuthError,
        error_message="Invalid access token.",
    )
    return {
        "id": payload.get("id"),
        "email": payload.get("email"),
        "raw": payload,
    }


def list_default_datasets() -> List[DefaultDatasetRow]:
    payload = _request_json(
        "GET",
        f"{_supabase_url()}/rest/v1/default_datasets",
        headers=_service_headers(),
        params={
            "select": "dataset_name,bucket_name,object_prefix,enabled",
            "enabled": "eq.true",
            "order": "dataset_name.asc",
        },
        error_cls=SupabaseDatasetError,
        error_message="Failed to list default datasets.",
    )
    if not isinstance(payload, list):
        return []
    rows: List[DefaultDatasetRow] = []
    for item in payload:
        rows.append(
            DefaultDatasetRow(
                dataset_name=str(item.get("dataset_name") or ""),
                bucket_name=str(item.get("bucket_name") or ""),
                object_prefix=str(item.get("object_prefix") or ""),
                enabled=bool(item.get("enabled", True)),
            )
        )
    return [row for row in rows if row.dataset_name and row.bucket_name]


def list_user_datasets(user_id: str) -> List[UserDatasetRow]:
    payload = _request_json(
        "GET",
        f"{_supabase_url()}/rest/v1/user_datasets",
        headers=_service_headers(),
        params={
            "select": "database_name,source_type,bucket_name,object_prefix,is_default,hidden",
            "user_id": f"eq.{user_id}",
            "order": "database_name.asc",
        },
        error_cls=SupabaseDatasetError,
        error_message="Failed to list user datasets.",
    )
    if not isinstance(payload, list):
        return []
    rows: List[UserDatasetRow] = []
    for item in payload:
        rows.append(
            UserDatasetRow(
                database_name=str(item.get("database_name") or ""),
                source_type=str(item.get("source_type") or "user"),
                bucket_name=str(item.get("bucket_name") or _default_user_bucket()),
                object_prefix=str(item.get("object_prefix") or ""),
                is_default=bool(item.get("is_default", False)),
                hidden=bool(item.get("hidden", False)),
            )
        )
    return [row for row in rows if row.database_name]


def upsert_user_dataset(
    *,
    user_id: str,
    database_name: str,
    source_type: str,
    bucket_name: str,
    object_prefix: str,
    is_default: bool,
    hidden: bool,
) -> None:
    _request_json(
        "POST",
        f"{_supabase_url()}/rest/v1/user_datasets",
        headers={
            **_service_headers(),
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        },
        params={"on_conflict": "user_id,database_name"},
        json_body={
            "user_id": user_id,
            "database_name": database_name,
            "source_type": source_type,
            "bucket_name": bucket_name,
            "object_prefix": object_prefix,
            "is_default": is_default,
            "hidden": hidden,
        },
        error_cls=SupabaseDatasetError,
        error_message="Failed to upsert user dataset metadata.",
    )


def delete_user_dataset(user_id: str, database_name: str) -> None:
    _request_json(
        "DELETE",
        f"{_supabase_url()}/rest/v1/user_datasets",
        headers=_service_headers(),
        params={
            "user_id": f"eq.{user_id}",
            "database_name": f"eq.{database_name}",
        },
        error_cls=SupabaseDatasetError,
        error_message="Failed to delete user dataset metadata.",
    )


def storage_list_objects(bucket: str, prefix: str) -> List[str]:
    payload = _request_json(
        "POST",
        f"{_supabase_url()}/storage/v1/object/list/{bucket}",
        headers={
            **_service_headers(),
            "Content-Type": "application/json",
        },
        json_body={
            "prefix": prefix.strip("/"),
            "limit": 1000,
            "offset": 0,
            "sortBy": {"column": "name", "order": "asc"},
        },
        error_cls=SupabaseStorageError,
        error_message="Failed to list storage objects.",
    )
    if not isinstance(payload, list):
        return []
    files: List[str] = []
    for item in payload:
        name = str(item.get("name") or "").strip()
        item_id = item.get("id")
        if name and item_id:
            files.append(name)
    return files


def storage_download_object(bucket: str, object_path: str) -> bytes:
    path = object_path.strip("/")
    return _request_bytes(
        "GET",
        f"{_supabase_url()}/storage/v1/object/{bucket}/{path}",
        headers=_service_headers(),
        error_cls=SupabaseStorageError,
        error_message="Failed to download storage object.",
    )


def storage_upload_object(
    *,
    bucket: str,
    object_path: str,
    content: bytes,
    content_type: str,
    upsert: bool = True,
) -> None:
    path = object_path.strip("/")
    headers = {
        **_service_headers(),
        "Content-Type": content_type,
        "x-upsert": "true" if upsert else "false",
    }
    _request_json(
        "POST",
        f"{_supabase_url()}/storage/v1/object/{bucket}/{path}",
        headers=headers,
        data=content,
        error_cls=SupabaseStorageError,
        error_message="Failed to upload storage object.",
    )


def storage_delete_prefix(bucket: str, prefix: str) -> None:
    names = storage_list_objects(bucket, prefix)
    if not names:
        return
    objects = [_join_prefix(prefix, name) for name in names]
    _request_json(
        "DELETE",
        f"{_supabase_url()}/storage/v1/object/{bucket}",
        headers={
            **_service_headers(),
            "Content-Type": "application/json",
        },
        json_body=objects,
        error_cls=SupabaseStorageError,
        error_message="Failed to delete storage objects.",
    )
