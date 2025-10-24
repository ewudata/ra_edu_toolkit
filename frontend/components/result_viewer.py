"""
Result Viewer Component
"""

import streamlit as st
import pandas as pd
from typing import List, Dict, Any, Optional


def result_viewer_component(
    result_data: Dict[str, Any], key: str = "result_viewer"
) -> None:
    """
    Result Viewer Component

    Args:
        result_data: Query result data
        key: Streamlit component key
    """
    if not result_data:
        st.info("No query results")
        return

    # Display basic information
    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("Rows", result_data.get("row_count", 0))
    with col2:
        st.metric("Columns", len(result_data.get("schema_eval", [])))
    with col3:
        st.metric("Database", result_data.get("database", "Unknown"))

    # Display schema information
    schema = result_data.get("schema_eval", [])
    if schema:
        st.subheader("Result Schema")
        st.write(", ".join(schema))

    # Display data table
    rows = result_data.get("rows", [])
    if rows:
        st.subheader("Query Results")
        df = pd.DataFrame(rows)
        st.dataframe(df, use_container_width=True)

        # Provide download option
        csv = df.to_csv(index=False)
        st.download_button(
            label="Download CSV", data=csv, file_name="query_result.csv", mime="text/csv"
        )
    else:
        st.info("Query result is empty")


def trace_viewer_component(
    trace_data: List[Dict[str, Any]], key: str = "trace_viewer"
) -> None:
    """
    Execution Trace Visualizer Component

    Args:
        trace_data: Execution trace data
        key: Streamlit component key
    """
    if not trace_data:
        st.info("No execution trace information")
        return

    st.subheader("Execution Process")

    for i, step in enumerate(trace_data, 1):
        with st.expander(f"Step {i}: {step.get('op', 'Unknown operation')}"):
            # Display step information
            col1, col2 = st.columns(2)

            with col1:
                st.write("**Input Schema:**")
                input_schema = step.get("input_schema", [])
                if input_schema:
                    st.write(", ".join(input_schema))
                else:
                    st.write("None")

            with col2:
                st.write("**Output Schema:**")
                output_schema = step.get("output_schema", [])
                if output_schema:
                    st.write(", ".join(output_schema))
                else:
                    st.write("None")

            # Display row count changes
            rows = step.get("rows", 0)
            st.write(f"**Result Rows:** {rows}")

            # Display preview data
            preview = step.get("preview", [])
            if preview:
                st.write("**Preview Data:**")
                preview_df = pd.DataFrame(preview)
                st.dataframe(preview_df, use_container_width=True)

            # Display detailed information
            detail = step.get("detail")
            if detail:
                st.write("**Details:**")
                st.json(detail)

            # Display note
            note = step.get("note")
            if note:
                st.write(f"**Note:** {note}")


def error_display_component(error_message: str, key: str = "error_display") -> None:
    """
    Error Display Component

    Args:
        error_message: Error message
        key: Streamlit component key
    """
    st.error(f"❌ Query execution failed: {error_message}")
