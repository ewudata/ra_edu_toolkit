"""
Pre-defined Query Selector Component
"""

import streamlit as st
from typing import List, Dict, Any, Optional, Tuple


def query_selector_component(
    queries: List[Dict[str, Any]],
    api_client,
    database: str,
    key_prefix: str = "query_selector",
) -> Tuple[Optional[Dict[str, Any]], Optional[str], Optional[Dict[str, Any]]]:
    """
    Pre-defined Query Selector Component

    Args:
        queries: List of available queries
        api_client: API client instance
        database: Selected database name
        key_prefix: Prefix for Streamlit component keys

    Returns:
        Tuple of (selected_query, user_solution, evaluation_result)
    """
    if not queries:
        st.warning("No pre-defined queries available for this database.")
        return None, None, None

    # Query selection

    # Create query options for selectbox
    query_options = []
    query_map = {}

    for query in queries:
        difficulty_icon = {
            "beginner": "🟢",
            "intermediate": "🟡",
            "advanced": "🔴",
        }.get(query.get("difficulty", "beginner"), "🟢")

        option_text = f"{difficulty_icon} {query['title']} ({query.get('difficulty', 'beginner').title()})"
        query_options.append(option_text)
        query_map[option_text] = query

    st.markdown("**Difficulty Levels:** 🟢 beginner  🟡 intermediate  🔴 advanced")

    selected_option = st.selectbox(
        "",
        ["- Select a query -"] + query_options,
        key=f"{key_prefix}_selectbox",
        label_visibility="collapsed",
        index=0,
    )

    if not selected_option or selected_option == "- Select a query -":
        return None, None, None

    selected_query = query_map[selected_option]

    # Fetch full query details to get the solution
    try:
        query_detail = api_client.get_query_detail(database, selected_query["id"])
        # Merge the detail data with the summary data
        selected_query.update(query_detail)
    except Exception as e:
        st.warning(f"Could not fetch query details: {e}")
        return selected_query, None, None

    # Display query details
    st.markdown("---")
    st.markdown(f"**Query:** {selected_query['title']}")
    st.markdown(
        f"**Difficulty:** {selected_query.get('difficulty', 'beginner').title()}"
    )

    if selected_query.get("tags"):
        tags_text = ", ".join(selected_query["tags"])
        st.markdown(f"**Tags:** {tags_text}")

    st.markdown(f"**Prompt:** {selected_query['prompt']}")

    # User solution input
    st.markdown("---")
    st.subheader("✏️ Your Solution")
    st.markdown("Try to write the relational algebra expression for this query:")

    user_solution = st.text_area(
        "Enter your relational algebra expression:",
        placeholder="e.g., π{name}(σ{major = 'CS'}(Students))",
        height=100,
        key=f"{key_prefix}_solution_input",
    )

    # Execute button
    col1, col2, col3 = st.columns([1, 1, 1])
    with col2:
        execute_clicked = st.button(
            "🚀 Execute My Solution",
            type="primary",
            use_container_width=True,
            key=f"{key_prefix}_execute_button",
        )

    evaluation_result = None

    # Execute user solution
    if execute_clicked and user_solution:
        with st.spinner("Executing your solution..."):
            try:
                evaluation_result = api_client.evaluate_query(
                    database=database,
                    query_id=selected_query["id"],
                    expression=user_solution,
                )

                st.success("✅ Your solution executed successfully!")

                # Display result comparison
                st.subheader("📊 Results Comparison")

                user_rows = evaluation_result.get("rows") or []
                user_row_count = evaluation_result.get("row_count", len(user_rows))

                expected_rows = evaluation_result.get("expected_rows")
                expected_row_count: Optional[int] = None
                expected_rows_error: Optional[str] = None
                expected_schema = evaluation_result.get("expected_schema")

                if expected_rows is not None:
                    expected_row_count = len(expected_rows)
                else:
                    solution_expr = selected_query.get("solution", {}).get(
                        "relational_algebra"
                    )
                    if solution_expr:
                        cache_key = f"{key_prefix}_expected_cache_{selected_query['id']}"
                        cached_expected = st.session_state.get(cache_key)
                        use_cache = (
                            cached_expected
                            and cached_expected.get("expression") == solution_expr
                            and cached_expected.get("database") == database
                        )
                        if use_cache:
                            expected_rows = cached_expected.get("rows") or []
                            expected_row_count = cached_expected.get("row_count", 0)
                            if not expected_schema:
                                expected_schema = cached_expected.get("schema") or []
                        else:
                            try:
                                solution_result = api_client.evaluate_custom_query(
                                    database=database,
                                    expression=solution_expr,
                                )
                                expected_rows = solution_result.get("rows") or []
                                expected_row_count = solution_result.get(
                                    "row_count", len(expected_rows)
                                )
                                computed_schema = solution_result.get(
                                    "schema_eval", []
                                )
                                if not expected_schema:
                                    expected_schema = computed_schema
                                st.session_state[cache_key] = {
                                    "rows": expected_rows,
                                    "row_count": expected_row_count,
                                    "schema": computed_schema,
                                    "expression": solution_expr,
                                    "database": database,
                                }
                            except Exception as exc:
                                expected_rows_error = str(exc)
                    else:
                        expected_rows = None

                col_user, col_expected = st.columns(2)

                with col_user:
                    st.markdown("**Your Solution Output**")
                    st.markdown(f"Rows returned: {user_row_count}")
                    if user_rows:
                        st.dataframe(user_rows)
                    else:
                        st.caption("No rows returned.")

                with col_expected:
                    st.markdown("**Expected Output**")
                    if expected_rows_error:
                        st.error(f"Could not generate expected output: {expected_rows_error}")
                    elif expected_rows is not None:
                        expected_row_count = expected_row_count or len(expected_rows)
                        st.markdown(f"Rows expected: {expected_row_count}")
                        if expected_rows:
                            st.dataframe(expected_rows)
                        else:
                            st.caption("No rows expected.")
                    else:
                        st.caption("Expected result not available for this query.")

                actual_schema = evaluation_result.get("schema_eval", [])

                if expected_schema and actual_schema:
                    st.subheader("🔍 Schema Comparison")
                    schema_match = set(expected_schema) == set(actual_schema)

                    col1, col2 = st.columns(2)
                    with col1:
                        st.markdown("**Expected Schema:**")
                        st.write(expected_schema)
                    with col2:
                        st.markdown("**Your Schema:**")
                        st.write(actual_schema)

                    if schema_match:
                        st.success("✅ Schema matches expected result!")
                    else:
                        st.error("❌ Schema doesn't match expected result")

                # Show trace if available
                trace_data = evaluation_result.get("trace", [])
                if trace_data:
                    st.subheader("🔍 Execution Trace")
                    st.json(trace_data)

            except Exception as e:
                st.error(f"❌ Error executing your solution: {e}")

    elif execute_clicked and not user_solution:
        st.warning("Please enter a solution before executing.")

    # Show solution option
    st.markdown("---")
    st.subheader("💡 Need Help?")

    col1, col2 = st.columns(2)

    with col1:
        show_solution = st.button(
            "👁️ Show Solution from Catalog", key=f"{key_prefix}_show_solution"
        )

    with col2:
        execute_solution = st.button(
            "🚀 Generate Results for Solution", key=f"{key_prefix}_execute_solution"
        )

    if show_solution:
        st.markdown("**Expected Relational Algebra Expression:**")
        solution_expr = selected_query.get("solution", {}).get(
            "relational_algebra", "Not available"
        )
        st.code(solution_expr)

        if selected_query.get("solution", {}).get("sql"):
            st.markdown("**Equivalent SQL:**")
            st.code(selected_query["solution"]["sql"])

        # Show additional solution details from catalog
        if solution_expr != "Not available":
            st.markdown("**Solution Details:**")
            st.info(
                f"This is the expected solution stored in the catalog for this query."
            )

    if execute_solution:
        solution_expr = selected_query.get("solution", {}).get("relational_algebra")
        if solution_expr:
            with st.spinner("Generating results for expected solution..."):
                try:
                    # Use the custom evaluation endpoint to execute the solution expression
                    solution_result = api_client.evaluate_custom_query(
                        database=database,
                        expression=solution_expr,
                    )

                    st.success("✅ Expected solution executed successfully!")

                    st.subheader("📊 Expected Results (Generated On-the-Fly)")
                    st.markdown(
                        f"**Rows returned:** {solution_result.get('row_count', 0)}"
                    )

                    if solution_result.get("rows"):
                        st.dataframe(solution_result["rows"])

                    # Show trace
                    trace_data = solution_result.get("trace", [])
                    if trace_data:
                        st.subheader("🔍 Execution Trace")
                        st.json(trace_data)

                    # Show the expression that was executed
                    st.markdown("**Executed Expression:**")
                    st.code(solution_expr)

                except Exception as e:
                    st.error(f"❌ Error executing expected solution: {e}")
        else:
            st.warning("Expected solution not available for this query.")

    return selected_query, user_solution, evaluation_result
