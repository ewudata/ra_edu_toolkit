"""RA to SQL and SQL to RA reference page."""

import os
import sys
from typing import Any, Dict, List, Optional

import pandas as pd
import streamlit as st

# Add frontend path to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.api_client import APIClient


def _format_solution_block(solution: Optional[Dict[str, Any]]) -> None:
    if not solution:
        st.info("No reference solutions available for this exercise yet.")
        return

    if solution.get("relational_algebra"):
        st.markdown("**Relational algebra expression:**")
        st.code(solution["relational_algebra"])

    if solution.get("sql"):
        st.markdown("**SQL query:**")
        st.code(solution["sql"], language="sql")

    if (
        not solution.get("relational_algebra")
        and not solution.get("sql")
    ):
        st.info("Reference entries are empty for this exercise.")


def main() -> None:
    st.set_page_config(
        page_title="RA ↔ SQL Reference - RA Education Toolkit",
        page_icon="🔄",
        layout="wide",
    )

    st.title("🔄 RA ↔ SQL Reference")
    st.markdown(
        "Explore side-by-side relational algebra and SQL solutions to build intuition for translating between both representations."
    )

    api_client = APIClient()

    try:
        api_client.health_check()
    except Exception as exc:
        st.error(f"❌ Backend service connection failed: {exc}")
        st.info("Please ensure the backend service is running (uvicorn backend.main:app --reload)")
        return

    try:
        databases = api_client.get_databases()
    except Exception as exc:
        st.error(f"Failed to get database list: {exc}")
        return

    if not databases:
        st.warning("No databases available. Import one in the Database Manager first.")
        return

    db_options = {db["name"]: db for db in databases}

    st.sidebar.header("📊 Select Database")
    selected_name = st.sidebar.selectbox(
        "Choose a database",
        list(db_options.keys()),
        help="Pick a database to view its curated exercises.",
    )

    if not selected_name:
        st.info("Select a database from the sidebar to continue.")
        return

    try:
        queries: List[Dict[str, Any]] = api_client.get_queries(selected_name)
    except Exception as exc:
        st.error(f"Failed to load exercises for '{selected_name}': {exc}")
        return

    st.markdown("---")
    st.subheader(f"📘 Exercises for `{selected_name}`")

    if not queries:
        st.info("This database does not have any cataloged exercises yet.")
        return

    for query in queries:
        prompt_text = (query.get("prompt") or query.get("id") or "").strip()
        if len(prompt_text) > 80:
            prompt_text = f"{prompt_text[:77]}..."
        difficulty = query.get("difficulty") or "Unknown difficulty"
        header = f"{prompt_text} · {difficulty}"
        with st.expander(header):
            st.write(f"**Prompt:** {query.get('prompt', 'No prompt provided.')}")
            hints = query.get("hints") or []
            if hints:
                st.write("**Hints:**")
                for hint in hints:
                    st.write(f"- {hint}")

            try:
                detail = api_client.get_query_detail(selected_name, query["id"])
            except Exception as detail_exc:
                st.warning(f"Unable to fetch detailed solutions: {detail_exc}")
                continue

            if detail.get("expected_schema") or detail.get("expected_rows"):
                with st.expander("🎯 Expected Result"):
                    if detail.get("expected_schema"):
                        st.write("**Schema:** " + ", ".join(detail["expected_schema"]))

                    if detail.get("expected_rows"):
                        expected_df = pd.DataFrame(detail["expected_rows"])
                        st.dataframe(expected_df, use_container_width=True)

            _format_solution_block(detail.get("solution"))

    st.markdown("---")
    with st.expander("🧭 Translation Tips"):
        st.markdown(
            """
        - **Start with structure**: Outline the relational algebra operators required, then identify their SQL counterparts.
        - **Selection ↔ WHERE**: Translate selections (`σ`) into `WHERE` clauses.
        - **Projection ↔ SELECT**: Projections (`π`) map to `SELECT` column lists.
        - **Joins**: Natural joins or specific join conditions translate to explicit `JOIN ... ON ...` clauses.
        - **Set operations**: Union (`∪`), difference (`−`), and intersection (`∩`) correspond to `UNION`, `EXCEPT`, and `INTERSECT`.
        - **Aggregation**: Use `GROUP BY` and `HAVING` to mirror grouping operators.
        """
        )


if __name__ == "__main__":
    main()
