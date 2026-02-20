"""
API client for communicating with backend FastAPI service
"""

import os
from typing import Any, Dict, List, Optional

import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class APIClientError(Exception):
    """Custom exception for API client errors."""

    def __init__(
        self,
        message: str,
        *,
        status_code: Optional[int] = None,
        detail: Optional[Any] = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.detail = detail


class APIClient:
    def __init__(self, base_url: Optional[str] = None):
        # Use provided base_url or get from environment
        self.base_url = (
            base_url or os.getenv("BACKEND_BASE_URL", "http://localhost:8000")
        ).rstrip("/")
        self._auth_token: Optional[str] = None

    def set_auth_token(self, token: Optional[str]) -> None:
        self._auth_token = token.strip() if token else None

    def clear_auth_token(self) -> None:
        self._auth_token = None

    def _make_request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        """Send HTTP request"""
        url = f"{self.base_url}{endpoint}"
        headers = dict(kwargs.pop("headers", {}) or {})
        if self._auth_token:
            headers["Authorization"] = f"Bearer {self._auth_token}"
        if headers:
            kwargs["headers"] = headers
        try:
            response = requests.request(method, url, **kwargs)
            response.raise_for_status()
            if response.status_code == 204 or not response.content:
                return {}
            return response.json()
        except requests.exceptions.HTTPError as e:
            status_code = e.response.status_code if e.response else None
            detail_data: Optional[Any] = None

            if e.response is not None:
                try:
                    payload = e.response.json()
                    if isinstance(payload, dict):
                        detail_data = payload.get("detail", payload)
                except ValueError:
                    detail_data = None

                if detail_data is None:
                    text = e.response.text.strip()
                    detail_data = text or None

            message = str(e)
            if isinstance(detail_data, dict):
                message = detail_data.get("message") or message
            elif isinstance(detail_data, str):
                message = detail_data or message

            raise APIClientError(
                message,
                status_code=status_code,
                detail=detail_data,
            ) from e
        except requests.exceptions.RequestException as e:
            raise APIClientError(str(e), detail=str(e)) from e

    def get_databases(self) -> List[Dict[str, Any]]:
        """Get available database list"""
        return self._make_request("GET", "/databases")

    def get_database_schema(
        self, database: str, sample_rows: int = 5
    ) -> Dict[str, Any]:
        """Get schema metadata and preview rows for a database."""
        params = {"sample_rows": sample_rows}
        return self._make_request(
            "GET", f"/databases/{database}/schema", params=params
        )

    def import_database_from_zip(self, name: str, file_path: str) -> Dict[str, Any]:
        """Import database from ZIP file"""
        with open(file_path, "rb") as f:
            files = {"file": f}
            data = {"name": name}
            return self._make_request(
                "POST", "/databases/import/zip", files=files, data=data
            )

    def import_database_from_sql(self, name: str, file_path: str) -> Dict[str, Any]:
        """Import database from SQL file"""
        with open(file_path, "rb") as f:
            files = {"file": f}
            data = {"name": name}
            return self._make_request(
                "POST", "/databases/import/sql", files=files, data=data
            )

    def delete_database(self, database: str) -> Dict[str, Any]:
        """Delete database."""
        return self._make_request("DELETE", f"/databases/{database}")

    def get_queries(self, database: str) -> List[Dict[str, Any]]:
        """Get query list for specified database"""
        return self._make_request("GET", f"/databases/{database}/queries")

    def get_query_detail(self, database: str, query_id: str) -> Dict[str, Any]:
        """Get query details"""
        return self._make_request("GET", f"/databases/{database}/queries/{query_id}")

    def evaluate_query(
        self, database: str, query_id: str, expression: str
    ) -> Dict[str, Any]:
        """Evaluate query expression"""
        data = {"expression": expression}
        return self._make_request(
            "POST", f"/databases/{database}/queries/{query_id}/evaluate", json=data
        )

    def evaluate_custom_query(self, database: str, expression: str) -> Dict[str, Any]:
        """Evaluate custom query expression without query_id"""
        data = {"expression": expression}
        return self._make_request("POST", f"/databases/{database}/evaluate", json=data)

    def health_check(self) -> Dict[str, Any]:
        """Health check"""
        return self._make_request("GET", "/health")

    def get_google_login_url(self, frontend_redirect: str) -> str:
        """Get backend-generated Google OAuth URL."""
        payload = self._make_request(
            "GET", "/auth/google/start", params={"frontend_redirect": frontend_redirect}
        )
        auth_url = payload.get("auth_url")
        if not auth_url:
            raise APIClientError("Backend did not return Google OAuth URL.")
        return str(auth_url)
