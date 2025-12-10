"""
Pre-defined Query Selector Component
"""

from typing import Any, Dict, List, Optional, Tuple

import streamlit as st


_OP_DISPLAY_NAMES: Dict[str, str] = {
    "rel": "Relation Lookup",
    "π": "Projection",
    "σ": "Selection",
    "ρ": "Rename",
    "⋈": "Natural Join",
    "⋈_θ": "Theta Join",
    "×": "Cartesian Product",
    "∪": "Union",
    "−": "Difference",
    "∩": "Intersection",
    "÷": "Division",
}

_OP_COLOR = "#6f42c1"
_ATTR_COLOR = "#d73a49"
_REL_COLOR = "#0366d6"
_COND_COLOR = "#e36209"


def _color_span(text: str, color: str) -> str:
    return f"<span style='color:{color}'>{text}</span>"


def sample_query_examples(database: Optional[str]) -> str:
    """Return sample query markdown tailored to the selected database."""
    db = (database or "").lower()
    if db == "testdb":
        return """
        ```sql
        -- Names of CS majors
        π{name}(σ{major = 'CS'}(students))

        -- Students enrolled in C101 with grades
        π{name, grade}(students ⋈ enroll ⋈ σ{cid = 'C101'}(courses))
        ```
        """
    if db == "sales":
        return """
        ```sql
        -- Customers and their reps
        π{COMPANY, NAME}(customers ⋈ ρ{EMPL_NUM->CUST_REP}(salesreps))

        -- Orders with product descriptions
        π{ORDER_NUM, DESCRIPTION}(orders ⋈ ρ{MFR_ID->MFR, PRODUCT_ID->PRODUCT}(products))
        ```
        """
    # Default to University examples
    return """
    ```sql
    -- Select names of computer science students
    π{name}(σ{dept_name = 'Comp. Sci.'}(Student))

    -- Find students enrolled in specific courses
    π{name}(Student ⋈ Takes ⋈ σ{course_id = 'CS-101'}(Course))
    ```
    """


def sample_query_examples_html(database: Optional[str]) -> str:
    """Return sample queries with colored tokens tailored to the selected database."""
    db = (database or "").lower()
    if db == "testdb":
        return f"""
-- Names of CS majors<br>
{_color_span("π", _OP_COLOR)}{_color_span("{name}", _ATTR_COLOR)}({_color_span("σ", _OP_COLOR)}{_color_span("{major = 'CS'}", _COND_COLOR)}({_color_span("students", _REL_COLOR)}))<br><br>
-- Students enrolled in C101 with grades<br>
{_color_span("π", _OP_COLOR)}{_color_span("{name, grade}", _ATTR_COLOR)}({_color_span("students", _REL_COLOR)} ⋈ {_color_span("enroll", _REL_COLOR)} ⋈ {_color_span("σ", _OP_COLOR)}{_color_span("{cid = 'C101'}", _COND_COLOR)}({_color_span("courses", _REL_COLOR)}))
        """
    if db == "sales":
        return f"""
-- Customers and their reps<br>
{_color_span("π", _OP_COLOR)}{_color_span("{COMPANY, NAME}", _ATTR_COLOR)}({_color_span("customers", _REL_COLOR)} ⋈ {_color_span("ρ", _OP_COLOR)}{{EMPL_NUM->CUST_REP}}({_color_span("salesreps", _REL_COLOR)}))<br><br>
-- Orders with product descriptions<br>
{_color_span("π", _OP_COLOR)}{_color_span("{ORDER_NUM, DESCRIPTION}", _ATTR_COLOR)}({_color_span("orders", _REL_COLOR)} ⋈ {_color_span("ρ", _OP_COLOR)}{{MFR_ID->MFR, PRODUCT_ID->PRODUCT}}({_color_span("products", _REL_COLOR)}))
        """
    return f"""
-- Select names of computer science students<br>
{_color_span("π", _OP_COLOR)}{_color_span("{name}", _ATTR_COLOR)}({_color_span("σ", _OP_COLOR)}{_color_span("{dept_name = 'Comp. Sci.'}", _COND_COLOR)}({_color_span("Student", _REL_COLOR)}))<br><br>
-- Find students enrolled in specific courses<br>
{_color_span("π", _OP_COLOR)}{_color_span("{name}", _ATTR_COLOR)}({_color_span("Student", _REL_COLOR)} ⋈ {_color_span("Takes", _REL_COLOR)} ⋈ {_color_span("σ", _OP_COLOR)}{_color_span("{course_id = 'CS-101'}", _COND_COLOR)}({_color_span("Course", _REL_COLOR)}))
    """


def syntax_help_html(database: Optional[str]) -> str:
    """Colorized operator usage guide and samples."""
    return f"""
    <h3>Relational Algebra Operators</h3>
    <ul>
      <li><b>Projection ({_color_span("π", _OP_COLOR)})</b>: {_color_span("π", _OP_COLOR)}{_color_span("{attr1,attr2}", _ATTR_COLOR)}({_color_span("R", _REL_COLOR)}) — use <code>π</code> or <code>pi</code>, <code>PI</code></li>
      <li><b>Selection ({_color_span("σ", _OP_COLOR)})</b>: {_color_span("σ", _OP_COLOR)}{_color_span("{condition}", _COND_COLOR)}({_color_span("R", _REL_COLOR)}) — use <code>σ</code> or <code>sigma</code>, <code>SIGMA</code></li>
      <li><b>Rename ({_color_span("ρ", _OP_COLOR)})</b>: {_color_span("ρ", _OP_COLOR)} alias({_color_span("R", _REL_COLOR)}) for relation aliases; {_color_span("ρ", _OP_COLOR)}{_color_span("{old->new}", _ATTR_COLOR)}({_color_span("R", _REL_COLOR)}) for columns; combine as {_color_span("ρ", _OP_COLOR)} alias{_color_span("{old->new}", _ATTR_COLOR)}({_color_span("R", _REL_COLOR)})</li>
      <li><b>Natural Join ({_color_span("⋈", _OP_COLOR)})</b>: {_color_span("R ⋈ S", _REL_COLOR)} — use <code>⋈</code> or <code>join</code>, <code>JOIN</code></li>
      <li><b>Cartesian Product ({_color_span("×", _OP_COLOR)})</b>: {_color_span("R × S", _REL_COLOR)} — use <code>×</code> or <code>x</code>, <code>X</code>, <code>cross</code>, <code>CROSS</code></li>
      <li><b>Union ({_color_span("∪", _OP_COLOR)})</b>: {_color_span("R ∪ S", _REL_COLOR)} — use <code>∪</code> or <code>union</code>, <code>UNION</code></li>
      <li><b>Difference ({_color_span("−", _OP_COLOR)})</b>: {_color_span("R − S", _REL_COLOR)} — use <code>−</code> or <code>-</code>, <code>diff</code>, <code>DIFF</code></li>
      <li><b>Intersection ({_color_span("∩", _OP_COLOR)})</b>: {_color_span("R ∩ S", _REL_COLOR)} — use <code>∩</code> or <code>intersect</code>, <code>INTERSECT</code></li>
      <li><b>Division ({_color_span("÷", _OP_COLOR)})</b>: {_color_span("R ÷ S", _REL_COLOR)} — use <code>÷</code> or <code>/</code>, <code>div</code>, <code>DIV</code></li>
    </ul>
    <h3>Example Queries</h3>
    {sample_query_examples_html(database)}
    """


def _format_op_label(step: Dict[str, Any]) -> str:
    op = step.get("op")
    if not op:
        return "Unknown Operation"
    friendly = _OP_DISPLAY_NAMES.get(op)
    if op == "rel":
        detail = step.get("detail")
        relation_name = None
        if isinstance(detail, str):
            relation_name = detail
        elif isinstance(detail, dict):
            relation_name = detail.get("name") or detail.get("relation")
        if relation_name:
            return f"{friendly or 'Relation Lookup'} ({relation_name})"
    if friendly:
        return friendly if friendly == op else f"{friendly} ({op})"
    return str(op)


def _format_schema(schema: Any) -> str:
    if not schema:
        return "—"
    if isinstance(schema, dict):
        parts = []
        for key, value in schema.items():
            formatted = _format_schema(value)
            parts.append(f"{key}: {formatted}")
        return "; ".join(parts)
    if isinstance(schema, list):
        return "[" + ", ".join(str(col) for col in schema) + "]"
    return str(schema)


def _format_detail(detail: Any) -> str:
    if detail is None:
        return ""
    if isinstance(detail, dict):
        return "; ".join(f"{key}: {value}" for key, value in detail.items())
    if isinstance(detail, list):
        return ", ".join(str(item) for item in detail)
    return str(detail)


def _format_delta(delta: Any) -> str:
    if not delta:
        return ""
    if isinstance(delta, dict):
        parts = []
        for key, value in delta.items():
            parts.append(f"{key}: {value}")
        return "; ".join(parts)
    return str(delta)


def _extract_row_count(step: Dict[str, Any]) -> Optional[int]:
    if "rows" in step and step["rows"] is not None:
        try:
            return int(step["rows"])
        except (TypeError, ValueError):
            return None
    delta = step.get("delta")
    if isinstance(delta, dict):
        for key in ("rows_after", "rows_before"):
            value = delta.get(key)
            if value is not None:
                try:
                    return int(value)
                except (TypeError, ValueError):
                    continue
    return None


def _render_trace_ui(
    trace_data: List[Dict[str, Any]], *, header: str = "🔍 Execution Trace"
) -> None:
    if not trace_data:
        return

    st.subheader(header)

    summary_rows: List[Dict[str, Any]] = []
    for idx, step in enumerate(trace_data, start=1):
        summary_rows.append(
            {
                "Step": idx,
                "Operation": _format_op_label(step),
                "Output Schema": _format_schema(step.get("output_schema")),
                "Rows": _extract_row_count(step) or "—",
            }
        )
    st.table(summary_rows)

    for idx, step in enumerate(trace_data, start=1):
        op_label = _format_op_label(step)
        with st.expander(f"Step {idx}: {op_label}", expanded=False):
            meta_entries: List[Dict[str, str]] = []

            detail_text = _format_detail(step.get("detail"))
            if detail_text:
                meta_entries.append({"Property": "Detail", "Value": detail_text})

            input_schema = step.get("input_schema")
            if input_schema:
                meta_entries.append(
                    {"Property": "Input Schema", "Value": _format_schema(input_schema)}
                )

            output_schema = step.get("output_schema")
            if output_schema:
                meta_entries.append(
                    {"Property": "Output Schema", "Value": _format_schema(output_schema)}
                )

            delta_text = _format_delta(step.get("delta"))
            if delta_text:
                meta_entries.append({"Property": "Delta", "Value": delta_text})

            row_count = _extract_row_count(step)
            if row_count is not None:
                meta_entries.append({"Property": "Rows", "Value": str(row_count)})

            if meta_entries:
                st.table(meta_entries)

            preview = step.get("preview")
            st.markdown("**Output (up to 10 records):**")
            if preview:
                st.dataframe(preview)
            else:
                st.caption("No preview rows for this step.")


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

        prompt_text = (query.get("prompt") or "").strip()
        if len(prompt_text) > 80:
            prompt_text = f"{prompt_text[:77]}..."
        option_text = f"{difficulty_icon} {prompt_text}"
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
    st.markdown(f"**Query Description:** {selected_query['prompt']}")
    st.markdown(
        f"**Difficulty:** {selected_query.get('difficulty', 'beginner').title()}"
    )
    hints = selected_query.get("hints") or []
    if hints:
        hints_line = ", ".join(hints)
        st.markdown(f"**Hint:** {hints_line}")

    # User solution input
    st.markdown("---")
    st.subheader("✏️ Your Solution")
    st.markdown("Write the relational algebra expression for this query:")

    solution_key = f"{key_prefix}_solution_input"
    with st.form(key=f"{key_prefix}_solution_form"):
        st.text_area(
            "",
            placeholder="",
            height=100,
            key=solution_key,
            label_visibility="collapsed",
        )

        # Execute button sits above the help box for better visibility
        col1, col2, col3 = st.columns([1, 1, 1])
        with col2:
            execute_clicked = st.form_submit_button(
                "🚀 Execute My Solution",
                type="primary",
                use_container_width=True,
                key=f"{key_prefix}_execute_button",
            )

        with st.expander("💡 Query Syntax Help"):
            st.markdown(syntax_help_html(database), unsafe_allow_html=True)

    user_solution = (st.session_state.get(solution_key) or "").strip()

    result_key = f"{key_prefix}_last_result"
    error_key = f"{key_prefix}_last_error"
    last_expr_key = f"{key_prefix}_last_expression"

    def _render_comparison(result: Dict[str, Any]) -> None:
        """Display user vs expected results. Cached expected results are reused when possible."""
        st.subheader("📊 Results Comparison")

        user_rows = result.get("rows") or []
        user_row_count = result.get("row_count", len(user_rows))

        expected_rows = result.get("expected_rows")
        expected_row_count: Optional[int] = None
        expected_rows_error: Optional[str] = None
        expected_schema = result.get("expected_schema")

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
                        computed_schema = solution_result.get("schema_eval", [])
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

        # Show trace if available
        trace_data = result.get("trace", [])
        _render_trace_ui(trace_data, header="🔍 Execution Trace of Your Solution")

    evaluation_result = None
    last_expression = st.session_state.get(last_expr_key, "")
    expression_dirty = user_solution != last_expression

    # Execute user solution
    if execute_clicked and user_solution:
        with st.spinner("Executing your solution..."):
            try:
                evaluation_result = api_client.evaluate_query(
                    database=database,
                    query_id=selected_query["id"],
                    expression=user_solution,
                )
                st.session_state[result_key] = evaluation_result
                st.session_state[error_key] = None
                st.session_state[last_expr_key] = user_solution
                expression_dirty = False
            except Exception as e:
                st.error(f"❌ Error executing your solution: {e}")
                st.session_state[result_key] = None
                st.session_state[error_key] = str(e)
                st.session_state[last_expr_key] = user_solution
                expression_dirty = False

    elif execute_clicked and not user_solution:
        st.warning("Please enter a solution before executing.")

    stored_result = st.session_state.get(result_key)
    stored_error = st.session_state.get(error_key)

    if evaluation_result:
        _render_comparison(evaluation_result)
    elif stored_result and not expression_dirty:
        _render_comparison(stored_result)
    elif stored_error and not expression_dirty:
        st.error(f"❌ Error executing your solution: {stored_error}")
    elif stored_result and expression_dirty:
        st.info("Solution changed. Execute to refresh your results.")

    # Show solution option
    st.markdown("---")
    st.subheader("💡 Need Help?")

    if st.button(
        "👁️ View Expected Solution & Results",
        key=f"{key_prefix}_view_solution",
    ):
        solution_spec = selected_query.get("solution", {}) or {}
        solution_expr = solution_spec.get("relational_algebra")
        sql_expr = solution_spec.get("sql")

        if not solution_expr:
            st.warning("Expected solution not available for this query.")
        else:
            st.markdown("**Expected Relational Algebra Expression:**")
            st.code(solution_expr)

            if sql_expr:
                st.markdown("**Equivalent SQL:**")
                st.code(sql_expr, language="sql")

            with st.spinner("Generating expected results..."):
                try:
                    solution_result = api_client.evaluate_custom_query(
                        database=database,
                        expression=solution_expr,
                    )
                except Exception as exc:
                    st.error(f"❌ Error executing expected solution: {exc}")
                else:
                    rows = solution_result.get("rows") or []
                    st.subheader("📊 Expected Query Results")
                    if rows:
                        st.dataframe(rows)
                    else:
                        st.caption("Expected result returns no rows.")

                    trace_data = solution_result.get("trace", [])
                    _render_trace_ui(
                        trace_data, header="🔍 Execution Trace of Expected Solution"
                    )


    return selected_query, user_solution, evaluation_result
