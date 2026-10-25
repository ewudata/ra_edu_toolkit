"""Operator-supplied AI disclosure, required before any model call."""
from __future__ import annotations

import hashlib
import json
import os

from fastapi import APIRouter, Depends, Header, HTTPException

from ..services.auth import require_current_user

router = APIRouter(prefix="/ai", tags=["ai privacy"])


def privacy_details() -> dict:
    details = {
        "service": os.getenv("LLM_SERVICE_NAME", "").strip(),
        "data_policy": os.getenv("LLM_DATA_POLICY", "").strip(),
        "policy_url": os.getenv("LLM_PRIVACY_URL", "").strip(),
        "shared_data": "The current answer, relevant exercise and schema, and diagnostic summaries. Walkthroughs use the exercise solution without your answer. Names and text you enter may contain personal information.",
    }
    reviewed = os.getenv("LLM_PRIVACY_REVIEWED", "false").lower() == "true"
    details["available"] = bool(reviewed and details["service"] and details["data_policy"])
    fingerprint = {**details, "endpoint": os.getenv("LLM_BASE_URL", ""), "model": os.getenv("LLM_MODEL", ""), "enabled": os.getenv("LLM_ENABLED", "True")}
    details["version"] = hashlib.sha256(json.dumps(fingerprint, sort_keys=True).encode()).hexdigest()
    return details


@router.get("/privacy", dependencies=[Depends(require_current_user)])
def get_privacy():
    return privacy_details()


def require_ai_disclosure(x_ai_disclosure: str | None = Header(default=None)):
    details = privacy_details()
    if not details["available"]:
        raise HTTPException(503, "AI help is unavailable until the operator has configured and reviewed its data-sharing policy.")
    if x_ai_disclosure != details["version"]:
        raise HTTPException(428, "Review the current AI data-sharing explanation before requesting AI help.")
