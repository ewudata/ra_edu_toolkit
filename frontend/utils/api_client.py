"""
API 客户端用于与后端 FastAPI 服务通信
"""

import requests
from typing import List, Dict, Any, Optional
import json


class APIClient:
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url.rstrip("/")

    def _make_request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        """发送 HTTP 请求"""
        url = f"{self.base_url}{endpoint}"
        try:
            response = requests.request(method, url, **kwargs)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f"API request failed: {e}")

    def get_databases(self) -> List[Dict[str, Any]]:
        """获取可用数据库列表"""
        return self._make_request("GET", "/databases")

    def import_database_from_zip(self, name: str, file_path: str) -> Dict[str, Any]:
        """从 ZIP 文件导入数据库"""
        with open(file_path, "rb") as f:
            files = {"file": f}
            data = {"name": name}
            return self._make_request(
                "POST", "/databases/import/zip", files=files, data=data
            )

    def import_database_from_sql(self, name: str, file_path: str) -> Dict[str, Any]:
        """从 SQL 文件导入数据库"""
        with open(file_path, "rb") as f:
            files = {"file": f}
            data = {"name": name}
            return self._make_request(
                "POST", "/databases/import/sql", files=files, data=data
            )

    def get_queries(self, database: str) -> List[Dict[str, Any]]:
        """获取指定数据库的查询列表"""
        return self._make_request("GET", f"/databases/{database}/queries")

    def get_query_detail(self, database: str, query_id: str) -> Dict[str, Any]:
        """获取查询详情"""
        return self._make_request("GET", f"/databases/{database}/queries/{query_id}")

    def evaluate_query(
        self, database: str, query_id: str, expression: str
    ) -> Dict[str, Any]:
        """评估查询表达式"""
        data = {"expression": expression}
        return self._make_request(
            "POST", f"/databases/{database}/queries/{query_id}/evaluate", json=data
        )

    def health_check(self) -> Dict[str, Any]:
        """健康检查"""
        return self._make_request("GET", "/health")
