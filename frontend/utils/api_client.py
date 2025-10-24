"""
API client for communicating with backend FastAPI service
"""

import requests
import os
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class APIClient:
    def __init__(self, base_url: Optional[str] = None):
        # Use provided base_url or get from environment
        self.base_url = (
            base_url or os.getenv("BACKEND_BASE_URL", "http://localhost:8000")
        ).rstrip("/")

    def _make_request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        """Send HTTP request"""
        url = f"{self.base_url}{endpoint}"
        try:
            response = requests.request(method, url, **kwargs)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f"API request failed: {e}")

    def get_databases(self) -> List[Dict[str, Any]]:
        """Get available database list"""
        return self._make_request("GET", "/databases")

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

    def health_check(self) -> Dict[str, Any]:
        """Health check"""
        return self._make_request("GET", "/health")
