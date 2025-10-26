"""
Query Editor Page - 3-Step Workflow
"""

import streamlit as st
import sys
import os

# Add frontend path to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.api_client import APIClient
from components.query_input import (
    query_input_component,
    database_selector_component,
    database_info_component,
)
from components.result_viewer import (
    result_viewer_component,
    error_display_component,
)
from components.trace_visualizer import (
    trace_visualizer_component,
    execution_summary_component,
)
from components.step_indicator import step_indicator_component
from components.query_selector import query_selector_component


def main():
    st.set_page_config(
        page_title="Query Editor - RA Education Toolkit", page_icon="🔍", layout="wide"
    )

    st.title("🔍 Relational Algebra Query Editor")
    st.markdown("Follow the 3-step process to practice relational algebra queries")
    st.markdown("---")

    # Initialize API client
    api_client = APIClient()

    # Check backend connection
    try:
        api_client.health_check()
        st.success("✅ Backend service connected successfully")
    except Exception as e:
        st.error(f"❌ Backend service connection failed: {e}")
        st.info(
            "Please ensure the backend service is running (uvicorn backend.main:app --reload)"
        )
        return

    # Initialize session state
    if "current_step" not in st.session_state:
        st.session_state.current_step = 1
    if "selected_database" not in st.session_state:
        st.session_state.selected_database = None
    if "has_catalog" not in st.session_state:
        st.session_state.has_catalog = False

    # Get database list
    try:
        databases = api_client.get_databases()
    except Exception as e:
        st.error(f"Failed to get database list: {e}")
        return

    # Display step indicator
    step_indicator_component(st.session_state.current_step)

    st.markdown("---")

    # Step 1: Database Selection
    if st.session_state.current_step == 1:
        st.header("📊 Step 1: Select Database")

        selected_database = database_selector_component(databases)

        if selected_database:
            st.session_state.selected_database = selected_database

            # Display database information
            database_info_component(databases, selected_database)

            # Check if database has catalog (pre-defined queries)
            try:
                queries = api_client.get_queries(selected_database)
                st.session_state.has_catalog = True
                st.session_state.available_queries = queries
            except Exception:
                st.session_state.has_catalog = False
                st.session_state.available_queries = []

            # Navigation buttons
            col1, col2, col3 = st.columns([1, 1, 1])

            with col2:
                if st.session_state.has_catalog:
                    if st.button("Continue to Pre-defined Queries", type="primary"):
                        st.session_state.current_step = 2
                        st.rerun()
                else:
                    if st.button("Continue to Custom Query", type="primary"):
                        st.session_state.current_step = 3
                        st.rerun()

    # Step 2: Pre-defined Queries (only if database has catalog)
    elif st.session_state.current_step == 2 and st.session_state.has_catalog:
        st.header("📚 Step 2: Pre-defined Queries")

        if not st.session_state.selected_database:
            st.error("No database selected. Please go back to Step 1.")
            return

        # Navigation buttons
        col1, col2, col3 = st.columns([1, 1, 1])

        with col1:
            if st.button("← Back to Database Selection"):
                st.session_state.current_step = 1
                st.rerun()

        with col3:
            if st.button("Skip to Custom Query →"):
                st.session_state.current_step = 3
                st.rerun()

        # Query selector component
        selected_query, user_solution, evaluation_result = query_selector_component(
            st.session_state.available_queries,
            api_client,
            st.session_state.selected_database,
        )

    # Step 3: Custom Query
    elif st.session_state.current_step == 3:
        st.header("✏️ Step 3: Custom Query")

        if not st.session_state.selected_database:
            st.error("No database selected. Please go back to Step 1.")
            return

        # Navigation buttons
        col1, col2, col3 = st.columns([1, 1, 1])

        with col1:
            if st.button("← Back to Database Selection"):
                st.session_state.current_step = 1
                st.rerun()

        if st.session_state.has_catalog:
            with col2:
                if st.button("← Back to Pre-defined Queries"):
                    st.session_state.current_step = 2
                    st.rerun()

        # Custom query input
        st.markdown("Write your own relational algebra expression:")

        query_expression = query_input_component(
            label="Enter relational algebra expression",
            placeholder="e.g., π{name}(σ{major = 'CS'}(Students))",
            key="custom_query_input",
        )

        # Execute button
        col1, col2, col3 = st.columns([1, 1, 1])
        with col2:
            execute_clicked = st.button(
                "🚀 Execute Custom Query", type="primary", use_container_width=True
            )

        # Query execution and result display
        if execute_clicked and query_expression:
            with st.spinner("Executing custom query..."):
                try:
                    result = api_client.evaluate_custom_query(
                        database=st.session_state.selected_database,
                        expression=query_expression,
                    )

                    # Display results
                    st.success("✅ Custom query executed successfully!")

                    # Result viewer
                    result_viewer_component(result)

                    # Execution trace visualization
                    trace_data = result.get("trace", [])
                    if trace_data:
                        st.markdown("---")
                        trace_visualizer_component(trace_data)
                        execution_summary_component(trace_data)

                except Exception as e:
                    error_display_component(str(e))

        elif execute_clicked and not query_expression:
            st.warning("Please enter a query expression")

    # Help information
    with st.expander("💡 Query Syntax Help"):
        st.markdown("""
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
        """)


if __name__ == "__main__":
    main()
