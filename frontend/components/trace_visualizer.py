"""
Execution Trace Visualizer Component
"""

import streamlit as st
import pandas as pd
from typing import List, Dict, Any


def trace_visualizer_component(
    trace_data: List[Dict[str, Any]], key: str = "trace_visualizer"
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

    st.subheader("🔍 Execution Trace Visualization")

    # Create step navigation
    step_names = [
        f"Step {i + 1}: {step.get('op', 'Unknown')}" for i, step in enumerate(trace_data)
    ]

    if len(step_names) > 1:
        selected_step = st.selectbox(
            "Select step to view", step_names, key=f"{key}_step_selector"
        )
        selected_index = step_names.index(selected_step)
    else:
        selected_index = 0

    # Display selected step details
    if selected_index < len(trace_data):
        step = trace_data[selected_index]
        display_step_details(step, selected_index + 1)


def display_step_details(step: Dict[str, Any], step_number: int) -> None:
    """
    Display detailed information for a single step

    Args:
        step: Step data
        step_number: Step number
    """
    st.markdown(f"### Step {step_number}: {step.get('op', 'Unknown operation')}")

    # Basic information
    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric("Input Rows", step.get("input_rows", 0))

    with col2:
        st.metric("Output Rows", step.get("rows", 0))

    with col3:
        delta = step.get("rows", 0) - step.get("input_rows", 0)
        st.metric("Row Change", delta)

    # Schema information
    col1, col2 = st.columns(2)

    with col1:
        st.write("**Input Schema:**")
        input_schema = step.get("input_schema", [])
        if input_schema:
            for attr in input_schema:
                st.write(f"• {attr}")
        else:
            st.write("No input")

    with col2:
        st.write("**Output Schema:**")
        output_schema = step.get("output_schema", [])
        if output_schema:
            for attr in output_schema:
                st.write(f"• {attr}")
        else:
            st.write("No output")

    # Preview data
    preview = step.get("preview", [])
    if preview:
        st.write("**Preview Data:**")
        preview_df = pd.DataFrame(preview)
        st.dataframe(preview_df, use_container_width=True)

    # Detailed information
    detail = step.get("detail")
    if detail:
        with st.expander("View Details"):
            st.json(detail)

    # Note
    note = step.get("note")
    if note:
        st.info(f"💡 {note}")


def execution_summary_component(
    trace_data: List[Dict[str, Any]], key: str = "execution_summary"
) -> None:
    """
    Execution Summary Component

    Args:
        trace_data: Execution trace data
        key: Streamlit component key
    """
    if not trace_data:
        return

    st.subheader("📊 Execution Summary")

    # Statistics
    total_steps = len(trace_data)
    total_operations = len(set(step.get("op", "") for step in trace_data))

    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric("Total Steps", total_steps)

    with col2:
        st.metric("Operation Types", total_operations)

    with col3:
        if trace_data:
            final_rows = trace_data[-1].get("rows", 0)
            st.metric("Final Result Rows", final_rows)

    # Operation type distribution
    operation_counts = {}
    for step in trace_data:
        op = step.get("op", "Unknown")
        operation_counts[op] = operation_counts.get(op, 0) + 1

    if operation_counts:
        st.write("**Operation Type Distribution:**")
        for op, count in operation_counts.items():
            st.write(f"• {op}: {count} times")
