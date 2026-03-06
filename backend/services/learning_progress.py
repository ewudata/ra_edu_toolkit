from __future__ import annotations

from .supabase import _request_json, _service_headers, _supabase_url


def upsert_query_mastery(*, user_id: str, database_name: str, query_id: str) -> None:
    _request_json(
        "POST",
        f"{_supabase_url()}/rest/v1/query_mastery",
        headers={
            **_service_headers(),
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        },
        params={"on_conflict": "user_id,database_name,query_id"},
        json_body={
            "user_id": user_id,
            "database_name": database_name,
            "query_id": query_id,
        },
    )


def list_mastered_query_ids(*, user_id: str, database_name: str) -> set[str]:
    payload = _request_json(
        "GET",
        f"{_supabase_url()}/rest/v1/query_mastery",
        headers=_service_headers(),
        params={
            "select": "query_id",
            "user_id": f"eq.{user_id}",
            "database_name": f"eq.{database_name}",
        },
    )
    if not isinstance(payload, list):
        return set()
    return {str(item.get("query_id") or "") for item in payload if item.get("query_id")}
