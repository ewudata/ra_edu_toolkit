"""
Query Editor Page
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
)
from components.result_viewer import (
    result_viewer_component,
    error_display_component,
)
from components.trace_visualizer import (
    trace_visualizer_component,
    execution_summary_component,
)


def main():
    st.set_page_config(
        page_title="Query Editor - RA Education Toolkit", page_icon="🔍", layout="wide"
    )

    st.title("🔍 Relational Algebra Query Editor")
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

    # Get database list
    try:
        databases = api_client.get_databases()
    except Exception as e:
        st.error(f"Failed to get database list: {e}")
        return

    # Sidebar - Database selection
    with st.sidebar:
        st.header("📊 Database Selection")
        selected_database = database_selector_component(databases)

        if selected_database:
            st.success(f"Selected database: {selected_database}")

            # Display database information
            db_info = next(
                (db for db in databases if db["name"] == selected_database), None
            )
            if db_info:
                st.write(f"**Table count:** {db_info['table_count']}")
                st.write("**Table list:**")
                for table in db_info["tables"]:
                    st.write(f"• {table}")

    # Main content area
    if not selected_database:
        st.warning("Please select a database from the sidebar first")
        return

    # Query input area
    st.header("✏️ Query Input")
    query_expression = query_input_component(
        label="Enter relational algebra expression",
        placeholder="e.g., π{name}(σ{major = 'CS'}(Students))",
    )

    # Execute button
    col1, col2, col3 = st.columns([1, 1, 1])
    with col2:
        execute_clicked = st.button(
            "🚀 Execute Query", type="primary", use_container_width=True
        )

    # Query execution and result display
    if execute_clicked and query_expression:
        with st.spinner("Executing query..."):
            try:
                # Need to get a query ID first, using default value for now
                # In actual application, may need to create a general query evaluation endpoint
                result = api_client.evaluate_query(
                    database=selected_database,
                    query_id="custom",  # Custom query
                    expression=query_expression,
                )

                # Display results
                st.success("✅ Query executed successfully!")

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
