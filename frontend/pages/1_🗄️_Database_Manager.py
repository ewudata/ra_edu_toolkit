"""
Database Manager Page
"""

import html
import os
import sys
from typing import Any, Dict, Optional

import streamlit as st

# Add frontend path to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.api_client import APIClient, APIClientError
from utils.auth import require_authentication


PREVIEW_CACHE_KEY = "db_preview_cache"
PREVIEW_ERROR_KEY = "db_preview_errors"


@st.cache_data(ttl=30, show_spinner=False)
def _cached_health_check(base_url: str, auth_token: Optional[str]) -> Dict[str, Any]:
    client = APIClient(base_url=base_url)
    client.set_auth_token(auth_token)
    return client.health_check()


@st.cache_data(ttl=30, show_spinner=False)
def _cached_get_databases(base_url: str, auth_token: Optional[str]) -> Dict[str, Any]:
    client = APIClient(base_url=base_url)
    client.set_auth_token(auth_token)
    return {"databases": client.get_databases()}


def _render_table_preview_html(
    table_name: str,
    metadata: Optional[Dict[str, Any]],
) -> str:
    """Build HTML snippet for a table name with hover preview."""

    safe_name = html.escape(table_name)
    if not metadata:
        return (
            "<div class='table-preview-item'>"
            "<span class='table-preview-bullet'>&bull;</span>"
            f"<span class='table-preview-label'>{safe_name}</span>"
            "</div>"
        )

    columns = metadata.get("columns") or []
    column_names = [col.get("name", "") for col in columns]
    safe_headers = "".join(
        f"<th>{html.escape(str(col.get('name', '')))}</th>" for col in columns
    )
    sample_rows = metadata.get("sample_rows") or []
    row_count = metadata.get("row_count")

    if not columns:
        safe_headers = "<th>value</th>"

    if sample_rows:
        rows_html_parts = []
        for row in sample_rows:
            if columns:
                cell_html = []
                for col_name in column_names:
                    value = row.get(col_name)
                    display_value = "NULL" if value is None else str(value)
                    cell_html.append(f"<td>{html.escape(display_value)}</td>")
                cells = "".join(cell_html)
            else:
                display_value = "NULL" if row is None else str(row)
                cells = f"<td>{html.escape(display_value)}</td>"
            rows_html_parts.append(f"<tr>{cells}</tr>")
        rows_html = "".join(rows_html_parts)
    else:
        colspan = max(len(columns), 1)
        rows_html = (
            f"<tr><td colspan='{colspan}'><em>No preview rows available</em></td></tr>"
        )

    meta_text = (
        f"<div class='table-preview-meta'>Approx. rows: {row_count}</div>"
        if row_count is not None
        else ""
    )

    return (
        "<div class='table-preview-item'>"
        "<span class='table-preview-bullet'>&bull;</span>"
        "<span class='table-preview-container'>"
        f"<span class='table-preview-label'>{safe_name}</span>"
        "<div class='table-preview-popup'>"
        f"{meta_text}"
        "<table class='table-preview-table'>"
        f"<thead><tr>{safe_headers}</tr></thead>"
        f"<tbody>{rows_html}</tbody>"
        "</table>"
        "</div>"
        "</span>"
        "</div>"
    )


def _fetch_database_preview(api_client: APIClient, database_name: str) -> None:
    preview_cache = st.session_state.setdefault(PREVIEW_CACHE_KEY, {})
    preview_errors = st.session_state.setdefault(PREVIEW_ERROR_KEY, {})

    try:
        schema_response = api_client.get_database_schema(database_name, sample_rows=5)
        preview_cache[database_name] = {
            table_info["name"]: table_info
            for table_info in schema_response.get("tables", [])
        }
        preview_errors.pop(database_name, None)
    except (APIClientError, Exception) as exc:
        preview_errors[database_name] = str(exc)
        preview_cache.pop(database_name, None)


def _clear_preview_cache(database_name: Optional[str] = None) -> None:
    if database_name is None:
        st.session_state.pop(PREVIEW_CACHE_KEY, None)
        st.session_state.pop(PREVIEW_ERROR_KEY, None)
        return

    preview_cache = st.session_state.get(PREVIEW_CACHE_KEY, {})
    preview_errors = st.session_state.get(PREVIEW_ERROR_KEY, {})
    preview_cache.pop(database_name, None)
    preview_errors.pop(database_name, None)


def _clear_db_list_cache() -> None:
    _cached_health_check.clear()
    _cached_get_databases.clear()


def main():
    st.set_page_config(
        page_title="Database Manager - RA Education Toolkit",
        page_icon="🗄️",
        layout="wide",
    )

    st.title("🗄️ Database Manager")
    st.markdown("---")

    # Initialize API client
    api_client = APIClient()
    if not require_authentication(api_client):
        return

    # Check backend connection
    try:
        auth_token = st.session_state.get("auth_token")
        _cached_health_check(api_client.base_url, auth_token)
        st.success("✅ Backend service connected successfully")
    except APIClientError as e:
        st.error(f"❌ Backend service connection failed: {e}")
        st.info(
            "Please ensure the backend service is running (uvicorn backend.main:app --reload)"
        )
        return
    except Exception as e:
        st.error(f"❌ Backend service connection failed: {e}")
        st.info(
            "Please ensure the backend service is running (uvicorn backend.main:app --reload)"
        )
        return

    # Get database list
    try:
        auth_token = st.session_state.get("auth_token")
        databases_payload = _cached_get_databases(api_client.base_url, auth_token)
        databases = databases_payload.get("databases", [])
    except APIClientError as e:
        st.error(f"Failed to get database list: {e}")
        return
    except Exception as e:
        st.error(f"Failed to get database list: {e}")
        return

    # Inject styles for table previews
    st.markdown(
        """
        <style>
        .table-preview-item {
            position: relative;
            display: flex;
            align-items: baseline;
            gap: 0.35rem;
            margin-bottom: 0.3rem;
        }
        .table-preview-bullet {
            color: inherit;
            line-height: 1;
        }
        .table-preview-container {
            position: relative;
            display: inline-block;
        }
        .table-preview-label {
            cursor: help;
            font-weight: 500;
        }
        .table-preview-popup {
            display: none;
            position: absolute;
            top: 1.45rem;
            left: 0;
            z-index: 999;
            background-color: rgba(255, 255, 255, 0.98);
            border: 1px solid rgba(0, 0, 0, 0.1);
            border-radius: 6px;
            box-shadow: 0 6px 18px rgba(15, 23, 42, 0.2);
            padding: 0.75rem;
            max-width: 520px;
            max-height: 260px;
            overflow: auto;
        }
        .table-preview-container:hover .table-preview-popup,
        .table-preview-container:focus-within .table-preview-popup {
            display: block;
        }
        .table-preview-meta {
            font-size: 0.75rem;
            color: #475569;
            margin-bottom: 0.5rem;
        }
        .table-preview-table {
            border-collapse: collapse;
            font-size: 0.75rem;
            width: max-content;
            min-width: 240px;
        }
        .table-preview-table th,
        .table-preview-table td {
            border: 1px solid rgba(148, 163, 184, 0.6);
            padding: 0.25rem 0.4rem;
            text-align: left;
            white-space: nowrap;
        }
        .table-preview-table thead {
            background-color: rgba(148, 163, 184, 0.12);
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    # Ensure default session state for import forms
    if "zip_name_input" not in st.session_state:
        st.session_state["zip_name_input"] = "NewDatabase"
    if "sql_name_input" not in st.session_state:
        st.session_state["sql_name_input"] = "SQLDatabase"

    if st.session_state.pop("reset_zip_form", False):
        st.session_state["zip_name_input"] = "NewDatabase"
        st.session_state.pop("zip_file_uploader", None)
    if st.session_state.pop("reset_sql_form", False):
        st.session_state["sql_name_input"] = "SQLDatabase"
        st.session_state.pop("sql_file_uploader", None)

    st.session_state.setdefault(PREVIEW_CACHE_KEY, {})
    st.session_state.setdefault(PREVIEW_ERROR_KEY, {})

    # Display existing databases
    st.header("📊 Existing Databases")

    if databases:
        for db in databases:
            db_name = db["name"]
            with st.expander(f"🗃️ {db_name} ({db['table_count']} tables)"):
                col1, col2 = st.columns(2)

                with col1:
                    preview_cache = st.session_state[PREVIEW_CACHE_KEY]
                    preview_errors = st.session_state[PREVIEW_ERROR_KEY]
                    preview_loaded = db_name in preview_cache

                    if preview_loaded:
                        if st.button("Refresh table previews", key=f"refresh_{db_name}"):
                            _fetch_database_preview(api_client, db_name)
                    else:
                        if st.button("Load table previews", key=f"load_{db_name}"):
                            _fetch_database_preview(api_client, db_name)
                            preview_loaded = db_name in st.session_state[PREVIEW_CACHE_KEY]

                    table_metadata: Dict[str, Dict[str, Any]] = st.session_state[
                        PREVIEW_CACHE_KEY
                    ].get(db_name, {})
                    preview_error: Optional[str] = st.session_state[
                        PREVIEW_ERROR_KEY
                    ].get(db_name)

                    st.write("**Table list:**")
                    if preview_error:
                        st.warning(
                            f"Table previews unavailable: {preview_error}",
                            icon="⚠️",
                        )
                    elif not preview_loaded:
                        st.info("Load table previews to view schema and sample rows.")
                    for table in db["tables"]:
                        st.markdown(
                            _render_table_preview_html(
                                table, table_metadata.get(table)
                            ),
                            unsafe_allow_html=True,
                        )

                with col2:
                    st.write("**Statistics:**")
                    st.write(f"• Table count: {db['table_count']}")
                    st.write(f"• Database name: {db['name']}")
                    st.write(
                        f"• Default dataset: {'Yes' if db.get('is_default') else 'No'}"
                    )
                    action_label = (
                        f"Hide {db['name']}"
                        if db.get("is_default")
                        else f"Delete {db['name']}"
                    )
                    if st.button(
                        action_label,
                        key=f"delete_db_{db['name']}",
                    ):
                        try:
                            api_client.delete_database(db_name)
                            _clear_preview_cache(db_name)
                            _clear_db_list_cache()
                            if db.get("is_default"):
                                st.success(f"Hidden shared dataset: {db_name}")
                            else:
                                st.success(f"Deleted database: {db_name}")
                            st.rerun()
                        except Exception as e:
                            st.error(f"Delete failed: {e}")
    else:
        st.info("No databases available")

    st.markdown("---")

    # Database import functionality
    st.header("📥 Import New Database")

    # ZIP file import
    st.subheader("Import from ZIP File")
    zip_message = st.session_state.pop("zip_import_success", None)
    if zip_message:
        st.success(zip_message)
    with st.expander("💡 ZIP Import Help"):
        st.markdown(
            """\
### ZIP File Format Requirements

- ZIP file should contain multiple CSV files
- Each CSV file represents a table
- File name (without extension) will be used as table name
- Nested directory structure is not supported

### Example File Structure

```
database.zip
├── students.csv
├── courses.csv
└── enrollments.csv
```
"""
        )
    uploaded_zip = st.file_uploader(
        "Select a ZIP file containing CSV files",
        type=["zip"],
        help="ZIP file should contain multiple CSV files, each representing a table",
        key="zip_file_uploader",
    )

    if uploaded_zip:
        zip_name = st.text_input("Database name", key="zip_name_input")

        if st.button("Import ZIP Database"):
            try:
                # Save uploaded file
                zip_path = f"/tmp/{uploaded_zip.name}"
                with open(zip_path, "wb") as f:
                    f.write(uploaded_zip.getbuffer())

                # Call API to import
                result = api_client.import_database_from_zip(zip_name, zip_path)
                st.session_state["zip_import_success"] = (
                    f"✅ Successfully imported database: {result['name']}"
                )
                _clear_preview_cache()
                _clear_db_list_cache()
                st.session_state["reset_zip_form"] = True
                st.rerun()

            except APIClientError as e:
                if e.status_code == 400:
                    st.error(
                        "Import failed: The ZIP file does not meet the expected format. "
                        "Please review the ZIP Import Help section above for details on the expected file structure."
                    )
                else:
                    st.error(f"Import failed: {e}")
            except Exception as e:
                st.error(f"Import failed: {e}")

    st.markdown("---")

    # SQL file import #####
    st.subheader("Import from SQL File")
    sql_message = st.session_state.pop("sql_import_success", None)
    if sql_message:
        st.success(sql_message)
    with st.expander("💡 SQL Import Help"):
        st.markdown(
            """\
### SQL File Format Requirements

- File must be UTF-8 encoded
- Should contain CREATE TABLE statements
- May contain INSERT statements to insert data
- Supports standard SQLite syntax
"""
        )
    uploaded_sql = st.file_uploader(
        "Select SQL script file",
        type=["sql"],
        help="SQL file should contain CREATE TABLE and INSERT statements",
        key="sql_file_uploader",
    )

    if uploaded_sql:
        sql_name = st.text_input("Database name", key="sql_name_input")

        if st.button("Import SQL Database"):
            try:
                # Save uploaded file
                sql_path = f"/tmp/{uploaded_sql.name}"
                with open(sql_path, "wb") as f:
                    f.write(uploaded_sql.getbuffer())

                # Call API to import
                result = api_client.import_database_from_sql(sql_name, sql_path)
                st.session_state["sql_import_success"] = (
                    f"✅ Successfully imported database: {result['name']}"
                )
                _clear_preview_cache()
                _clear_db_list_cache()
                st.session_state["reset_sql_form"] = True
                st.rerun()

            except APIClientError as e:
                if e.status_code == 400:
                    detail = e.detail if isinstance(e.detail, dict) else {}
                    detail_message = detail.get("message") or str(e)
                    line_info = detail.get("line")
                    statement_preview = detail.get("statement")

                    error_text = (
                        f"Import failed near line {line_info}: {detail_message}"
                        if line_info is not None
                        else f"Import failed: {detail_message}"
                    )
                    st.error(
                        f"{error_text} Visit the SQL Import Help section above for details on the expected file structure."
                    )
                    if statement_preview:
                        st.markdown("**Problematic SQL snippet:**")
                        st.code(statement_preview, language="sql")
                else:
                    st.error(f"Import failed: {e}")
            except Exception as e:
                st.error(f"Import failed: {e}")

if __name__ == "__main__":
    main()
