"""
Query Input Component
"""

import streamlit as st
from typing import Optional


def query_input_component(
    label: str = "Enter Relational Algebra Expression",
    placeholder: str = "Example: π{name}(σ{major = 'CS'}(Students))",
    key: str = "query_input",
) -> Optional[str]:
    """
    Query Input Component

    Args:
        label: Input box label
        placeholder: Placeholder text
        key: Streamlit component key

    Returns:
        User-entered query expression, or None if empty
    """
    query = st.text_area(
        label,
        placeholder=placeholder,
        height=100,
        key=key,
        help="Enter relational algebra expression, supports projection(π), selection(σ), join(⋈) and other operations",
    )

    if query and query.strip():
        return query.strip()
    return None


def database_selector_component(
    databases: list, key: str = "database_selector"
) -> Optional[str]:
    """
    Database Selector Component

    Args:
        databases: List of databases
        key: Streamlit component key

    Returns:
        Selected database name
    """
    if not databases:
        st.warning("No databases available")
        return None

    database_names = [db["name"] for db in databases]
    selected_db = st.selectbox(
        "Select Database", database_names, key=key, help="Select database to query"
    )

    return selected_db


def query_execute_button(label: str = "Execute Query", key: str = "execute_button") -> bool:
    """
    Query Execute Button

    Args:
        label: Button text
        key: Streamlit component key

    Returns:
        Whether the execute button was clicked
    """
    col1, col2, col3 = st.columns([1, 1, 1])
    with col2:
        return st.button(label, key=key, type="primary")
