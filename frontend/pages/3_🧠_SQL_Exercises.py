"""SQL Exercises Page"""

import streamlit as st
import sys
import os

# Add frontend path to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.api_client import APIClient
from components.query_input import database_selector_component
from components.result_viewer import result_viewer_component, error_display_component


def main():
    st.set_page_config(
        page_title="SQL Exercises - RA Education Toolkit",
        page_icon="🧠",
        layout="wide",
    )

    st.title("🧠 SQL Exercises")
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
        st.header("📊 Select Database")
        selected_database = database_selector_component(databases)

        if selected_database:
            st.success(f"Selected database: {selected_database}")

    if not selected_database:
        st.warning("Please select a database from the sidebar first")
        return

    # Get query list
    try:
        queries = api_client.get_queries(selected_database)
    except Exception as e:
        st.error(f"Failed to get query list: {e}")
        return

    if not queries:
        st.info("No practice queries available for this database")
        return

    # Query selection
    st.header("📝 Select Exercise")

    query_options = {
        f"{q['title']} ({q.get('difficulty', 'Unknown difficulty')})": q
        for q in queries
    }
    selected_query_title = st.selectbox(
        "Select a query to practice",
        list(query_options.keys()),
        help="Choose a query to practice",
    )

    if not selected_query_title:
        return

    selected_query = query_options[selected_query_title]

    # Display query details
    st.markdown("---")
    st.subheader("📋 Exercise Problem")

    col1, col2 = st.columns([2, 1])

    with col1:
        st.write(f"**Title:** {selected_query['title']}")
        st.write(f"**Description:** {selected_query['prompt']}")

        if selected_query.get("difficulty"):
            st.write(f"**Difficulty:** {selected_query['difficulty']}")

        if selected_query.get("tags"):
            st.write(f"**Tags:** {', '.join(selected_query['tags'])}")

    with col2:
        # Get detailed query information
        try:
            query_detail = api_client.get_query_detail(
                selected_database, selected_query["id"]
            )

            if query_detail.get("hints"):
                with st.expander("💡 Hints"):
                    for i, hint in enumerate(query_detail["hints"], 1):
                        st.write(f"{i}. {hint}")

        except Exception as e:
            st.warning(f"Failed to get query details: {e}")

    # Student answer area
    st.markdown("---")
    st.subheader("✏️ Your Relational Algebra Answer")

    student_answer = st.text_area(
        "Enter your relational algebra expression (used for automated checking)",
        placeholder="Enter your answer here...",
        height=150,
        help="Write a relational algebra expression according to the problem requirements",
    )

    col1, col2, col3 = st.columns([1, 1, 1])
    with col2:
        submit_answer = st.button(
            "🚀 Submit Answer", type="primary", use_container_width=True
        )

    # Answer evaluation
    if submit_answer and student_answer:
        with st.spinner("Evaluating your answer..."):
            try:
                result = api_client.evaluate_query(
                    database=selected_database,
                    query_id=selected_query["id"],
                    expression=student_answer,
                )

                st.success("✅ Answer submitted successfully!")

                # Display results
                result_viewer_component(result)

                # Display standard answer (if available)
                try:
                    query_detail = api_client.get_query_detail(
                        selected_database, selected_query["id"]
                    )

                    solution = query_detail.get("solution", {})
                    if solution.get("relational_algebra") or solution.get("sql"):
                        with st.expander("📖 View Standard Answers"):
                            if solution.get("relational_algebra"):
                                st.write("**Relational algebra expression:**")
                                st.code(solution["relational_algebra"])

                            if solution.get("sql"):
                                st.write("**SQL query:**")
                                st.code(solution["sql"], language="sql")

                    # Display expected results
                    if query_detail.get("expected_schema") or query_detail.get(
                        "expected_rows"
                    ):
                        with st.expander("🎯 Expected Results"):
                            if query_detail.get("expected_schema"):
                                st.write("**Expected schema:**")
                                st.write(", ".join(query_detail["expected_schema"]))

                            if query_detail.get("expected_rows"):
                                st.write("**Expected data:**")
                                import pandas as pd

                                expected_df = pd.DataFrame(
                                    query_detail["expected_rows"]
                                )
                                st.dataframe(expected_df, use_container_width=True)

                except Exception as e:
                    st.warning(f"Failed to get standard answer: {e}")

            except Exception as e:
                error_display_component(str(e))

    elif submit_answer and not student_answer:
        st.warning("Please enter your answer")

    # Optional SQL practice
    st.markdown("---")
    st.subheader("🧾 Your SQL Answer (optional)")
    st.text_area(
        "Draft an equivalent SQL query (not auto-graded)",
        placeholder="Write your SQL query here...",
        height=150,
        key="sql_exercise_answer",
    )

    # Learning resources
    with st.expander("📚 Learning Resources"):
        st.markdown(
            """
        ### Relational Algebra Basics

        - **Projection (π)**: Select specific columns
        - **Selection (σ)**: Filter rows based on conditions
        - **Join (⋈)**: Combine two tables
        - **Union (∪)**: Combine results from two queries
        - **Difference (−)**: Subtract one query result from another

        ### SQL Reminders

        - Use `SELECT ... FROM ...` to choose columns and tables
        - Filter rows with `WHERE` clauses
        - Combine tables using `JOIN` statements with explicit join conditions
        - Aggregate with `GROUP BY` and filter aggregates in `HAVING`

        ### Problem-Solving Tips

        1. **Understand the problem**: Identify the required output schema and filters
        2. **Analyze the data**: Review available relations and key attributes
        3. **Break down the problem**: Decompose complex queries into smaller steps
        4. **Build step by step**: Draft the relational algebra, then translate to SQL
        5. **Verify results**: Ensure your answer matches the expected schema and rows
        """
        )


if __name__ == "__main__":
    main()
