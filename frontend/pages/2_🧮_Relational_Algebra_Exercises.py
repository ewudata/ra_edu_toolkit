"""Relational Algebra Exercises Page"""

import html
import streamlit as st
import sys
import os
from typing import Any, Dict, Optional

# Add frontend path to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.api_client import APIClient
from components.query_input import query_input_component
from components.result_viewer import (
    result_viewer_component,
    error_display_component,
)
from components.trace_visualizer import (
    trace_visualizer_component,
    execution_summary_component,
)
from components.query_selector import query_selector_component


def _render_table_preview_html(
    table_name: str,
    metadata: Optional[Dict[str, Any]],
) -> str:
    """Build HTML snippet for a table name with optional hover preview."""

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


def main():
    st.set_page_config(
        page_title="Relational Algebra Exercises - RA Education Toolkit",
        page_icon="🧮",
        layout="wide",
    )

    st.title("🧮 Relational Algebra Exercises")
    st.markdown(
        "Explore datasets, review available practice material, and choose how you want to work with relational algebra expressions."
    )
    st.markdown("---")

    api_client = APIClient()

    try:
        api_client.health_check()
        st.success("✅ Backend service connected successfully")
    except Exception as exc:
        st.error(f"❌ Backend service connection failed: {exc}")
        st.info(
            "Please ensure the backend service is running (uvicorn backend.main:app --reload)"
        )
        return

    # Initialize session state
    if "selected_database" not in st.session_state:
        st.session_state.selected_database = None
    if "practice_mode" not in st.session_state:
        st.session_state.practice_mode = None
    if "has_catalog" not in st.session_state:
        st.session_state.has_catalog = False
    if "available_queries" not in st.session_state:
        st.session_state.available_queries = []
    if "database_schemas" not in st.session_state:
        st.session_state.database_schemas = {}
    if "queries_for_database" not in st.session_state:
        st.session_state.queries_for_database = None
    if "catalog_error" not in st.session_state:
        st.session_state.catalog_error = None

    # Get database list
    try:
        databases = api_client.get_databases()
    except Exception as exc:
        st.error(f"Failed to get database list: {exc}")
        return

    # Reset selection when database removed
    database_names = {db["name"] for db in databases}
    if (
        st.session_state.selected_database
        and st.session_state.selected_database not in database_names
    ):
        st.session_state.selected_database = None
        st.session_state.practice_mode = None
        st.session_state.has_catalog = False
        st.session_state.available_queries = []
        st.session_state.queries_for_database = None
        st.session_state.catalog_error = None

    # Inject styles shared with the database manager previews
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

    st.header("📊 Available Databases")
    st.write(
        "Browse the available databases, review their tables, and select a database you want to work with:"
    )

    if not databases:
        st.info("No databases available.")
        return

    placeholder_option = "- Select a database -"
    option_labels = [placeholder_option]
    option_map: Dict[str, str] = {}

    for db in databases:
        label = f"{db['name']} ({db['table_count']} tables)"
        option_labels.append(label)
        option_map[label] = db["name"]

    if st.session_state.selected_database:
        default_label = next(
            (label for label, name in option_map.items() if name == st.session_state.selected_database),
            placeholder_option,
        )
    else:
        default_label = placeholder_option

    default_index = option_labels.index(default_label)

    max_label_length = max(len(label) for label in option_labels)
    select_width_ch = max(min(max_label_length + 2, 36), 14)

    st.markdown(
        f"""
        <style>
        .relalg-selector .stSelectbox {{
            width: {select_width_ch}ch;
            max-width: 100%;
        }}
        .relalg-selector .stSelectbox > div {{
            min-width: 12ch;
        }}
        </style>
        """,
        unsafe_allow_html=True,
    )

    selector_col, _ = st.columns([select_width_ch / 9, 1])
    with selector_col:
        with st.container():
            st.markdown('<div class="relalg-selector">', unsafe_allow_html=True)
            selected_label = st.selectbox(
                "",
                option_labels,
                index=default_index,
                key="relalg_database_selector",
                label_visibility="collapsed",
            )
            st.markdown("</div>", unsafe_allow_html=True)

    selected_name = option_map.get(selected_label)
    if selected_name != st.session_state.selected_database:
        st.session_state.selected_database = selected_name
        st.session_state.practice_mode = None
        st.session_state.queries_for_database = None

    for db in databases:
        with st.expander(f"🗃️ {db['name']} ({db['table_count']} tables)"):
            col1, col2 = st.columns([3, 2])

            schema_cache = st.session_state.database_schemas
            cache_entry = schema_cache.get(db["name"])
            if cache_entry is None:
                try:
                    schema_response = api_client.get_database_schema(
                        db["name"], sample_rows=3
                    )
                    cache_entry = {"data": schema_response, "error": None}
                except Exception as exc:
                    cache_entry = {"data": None, "error": str(exc)}
                schema_cache[db["name"]] = cache_entry

            table_metadata: Dict[str, Dict[str, Any]] = {}
            if cache_entry["data"]:
                table_metadata = {
                    table_info["name"]: table_info
                    for table_info in cache_entry["data"].get("tables", [])
                }

            with col1:
                st.write("**Table list:**")
                if cache_entry["error"]:
                    st.warning(
                        f"Table previews unavailable: {cache_entry['error']}",
                        icon="⚠️",
                    )
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
                if st.session_state.selected_database == db["name"]:
                    st.success("✅ Currently selected")

    if not st.session_state.selected_database:
        st.info("Choose a database above to continue.")
        return

    selected_database = st.session_state.selected_database
    st.success(f"Current database: **{selected_database}**")

    if st.session_state.queries_for_database != selected_database:
        try:
            queries = api_client.get_queries(selected_database)
            st.session_state.available_queries = queries
            st.session_state.has_catalog = bool(queries)
            st.session_state.catalog_error = None
        except Exception as exc:
            st.session_state.available_queries = []
            st.session_state.has_catalog = False
            st.session_state.catalog_error = str(exc)
        st.session_state.queries_for_database = selected_database

    if st.session_state.catalog_error:
        st.warning(
            "Pre-defined queries could not be loaded from `catalog.json` "
            f"for **{selected_database}**: {st.session_state.catalog_error}"
        )

    st.markdown("---")
    st.subheader("Choose how you want to practice")

    col1, col2 = st.columns(2)

    with col1:
        st.markdown(
            "**📚 Pre-defined Queries**\n\n"
            "Use curated exercises sourced from the dataset's `catalog.json` file."
        )
        if st.session_state.has_catalog:
            selected = st.session_state.practice_mode == "predefined"
            if st.button(
                "Practice with Pre-defined Queries",
                key="start_predefined",
                type="primary" if not selected else "secondary",
            ):
                st.session_state.practice_mode = "predefined"
        else:
            st.caption("This database does not provide a catalog of pre-defined queries.")
            st.button(
                "practice with Pre-defined Queries",
                key="start_predefined_disabled",
                disabled=True,
            )

    with col2:
        st.markdown(
            "**✏️ Custom Queries**\n\n"
            "Practice by writing your own relational algebra expressions."
        )
        selected = st.session_state.practice_mode == "custom"
        if st.button(
            "Practice with Custom Queries",
            key="start_custom",
            type="primary" if not selected else "secondary",
        ):
            st.session_state.practice_mode = "custom"

    if st.session_state.practice_mode == "predefined":
        st.markdown("---")
        st.header("📚 Pre-defined Queries")

        if not st.session_state.has_catalog:
            st.warning(
                "Pre-defined queries are currently unavailable for this database."
            )
        elif not st.session_state.available_queries:
            st.info(
                "No pre-defined queries were found for this database. "
                "You can still practice with custom queries."
            )
        else:
            st.write(
                "Browse the curated exercises and test your solutions against the expected results."
            )
            _selected_query, _user_solution, _evaluation_result = (
                query_selector_component(
                    st.session_state.available_queries,
                    api_client,
                    selected_database,
                )
            )

    elif st.session_state.practice_mode == "custom":
        st.markdown("---")
        st.header("✏️ Custom Query Practice")

        st.markdown("Write your own relational algebra expression:")

        query_expression = query_input_component(
            label="Enter relational algebra expression",
            placeholder="e.g., π{name}(σ{major = 'CS'}(Students))",
            key="custom_query_input",
        )

        col1, col2, col3 = st.columns([1, 1, 1])
        with col2:
            execute_clicked = st.button(
                "🚀 Execute Custom Query", type="primary", use_container_width=True
            )

        if execute_clicked:
            if query_expression:
                with st.spinner("Executing custom query..."):
                    try:
                        result = api_client.evaluate_custom_query(
                            database=selected_database,
                            expression=query_expression,
                        )
                        st.success("✅ Custom query executed successfully!")
                        result_viewer_component(result)

                        trace_data = result.get("trace", [])
                        if trace_data:
                            st.markdown("---")
                            trace_visualizer_component(trace_data)
                            execution_summary_component(trace_data)
                    except Exception as exc:
                        error_display_component(str(exc))
            else:
                st.warning("Please enter a query expression.")
    else:
        st.info("Choose one of the practice options above to get started.")

    st.markdown("---")
    with st.expander("💡 Query Syntax Help"):
        st.markdown(
            """
            ### Relational Algebra Operators

            - **Projection (π)**: `π{attr1,attr2}(R)` - Select specific attributes
            - **Selection (σ)**: `σ{condition}(R)` - Filter rows based on condition
            - **Rename (ρ)**: `ρ{old->new}(R)` - Rename attributes
            - **Join (⋈)**: `R ⋈ S` - Natural join
            - **Cartesian Product (×)**: `R × S` - Cartesian product
            - **Union (∪)**: `R ∪ S` - Union
            - **Difference (−)**: `R − S` - Difference
            - **Intersection (∩)**: `R ∩ S` - Intersection

            ### Example Queries

            ```sql
            -- Select names of computer science students
            π{name}(σ{major = 'CS'}(Students))

            -- Find students enrolled in specific courses
            π{name}(Students ⋈ Takes ⋈ σ{course_id = 'CS101'}(Courses))
            ```
            """
        )


if __name__ == "__main__":
    main()
