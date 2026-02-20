from __future__ import annotations

import os
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from ..services.supabase import (
    SupabaseAuthError,
    SupabaseConfigError,
    build_google_oauth_url,
    exchange_google_oauth_code,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _frontend_base_url() -> str:
    return os.getenv("FRONTEND_BASE_URL", "http://localhost:8501").rstrip("/")


class GoogleAuthStartResponse(BaseModel):
    auth_url: str


@router.get("/google/start", response_model=GoogleAuthStartResponse)
def google_start(
    frontend_redirect: str = Query(default="http://localhost:8501"),
) -> GoogleAuthStartResponse:
    try:
        auth_url = build_google_oauth_url(frontend_redirect)
    except SupabaseConfigError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)
        ) from exc
    return GoogleAuthStartResponse(auth_url=auth_url)


@router.get("/google/callback")
def google_callback(
    code: str | None = Query(default=None),
    ctx: str | None = Query(default=None),
    error: str | None = Query(default=None),
    error_description: str | None = Query(default=None),
):
    if error:
        destination = (
            f"{_frontend_base_url()}/?"
            f"{urlencode({'auth_error': error_description or error})}"
        )
        return RedirectResponse(url=destination, status_code=status.HTTP_302_FOUND)

    if not code or not ctx:
        destination = (
            f"{_frontend_base_url()}/?"
            f"{urlencode({'auth_error': 'Missing OAuth callback parameters (code/ctx).'})}"
        )
        return RedirectResponse(url=destination, status_code=status.HTTP_302_FOUND)

    try:
        payload, frontend_redirect = exchange_google_oauth_code(code, ctx)
    except SupabaseConfigError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)
        ) from exc
    except SupabaseAuthError as exc:
        destination = f"{_frontend_base_url()}/?{urlencode({'auth_error': str(exc)})}"
        return RedirectResponse(url=destination, status_code=status.HTTP_302_FOUND)

    user = payload.get("user") or {}
    token = payload.get("access_token")
    if not token:
        destination = (
            f"{frontend_redirect.rstrip('/')}/?"
            f"{urlencode({'auth_error': 'OAuth completed without access token.'})}"
        )
        return RedirectResponse(url=destination, status_code=status.HTTP_302_FOUND)

    redirect_query = urlencode(
        {
            "auth_token": token,
            "auth_email": user.get("email") or "",
        }
    )
    target = f"{frontend_redirect.rstrip('/')}/?{redirect_query}"
    return RedirectResponse(url=target, status_code=status.HTTP_302_FOUND)
