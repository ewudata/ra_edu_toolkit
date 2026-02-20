"""
RA Education Toolkit - Streamlit Frontend Application
"""

import streamlit as st
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from utils.api_client import APIClient
from utils.auth import require_authentication
from components.query_selector import syntax_help_html


def main():
    st.set_page_config(
        page_title="RA Education Toolkit",
        page_icon="🎓",
        layout="wide",
        initial_sidebar_state="expanded",
    )

    # Main page
    st.title("🎓 Relational Algebra Education Toolkit")
    st.markdown("---")

    api_client = APIClient()
    if not require_authentication(api_client):
        st.markdown(
            """
            Use this toolkit to learn relational algebra and SQL with:
            - Database management
            - Relational algebra exercises
            - SQL exercises
            - RA/SQL interchange reference
            """
        )
        st.caption("Sign in with Google to continue.")
        return

    # Welcome message
    st.markdown("""
    ## Welcome to the Relational Algebra Education Toolkit!

    - 🗄️ **Manage databases** to import and organize learning data
    - 🧮 **Practice relational algebra** with guided, step-by-step exercises
    - 🧠 **Build SQL skills** alongside relational algebra understanding
    - 🔄 **Translate** between relational algebra and SQL using side-by-side references
    """)

    # Check backend connection status
    st.markdown("---")
    st.subheader("🔗 System Status")

    col1, col2 = st.columns(2)

    with col1:
        try:
            health = api_client.health_check()
            st.success("✅ Backend service is running normally")
            st.write(f"Status: {health.get('status', 'healthy')}")
        except Exception as e:
            st.error("❌ Backend service connection failed")
            st.write(f"Error: {e}")

    with col2:
        try:
            databases = api_client.get_databases()
            st.success(f"✅ Found {len(databases)} databases")
            if databases:
                db_names = [db["name"] for db in databases]
                st.write(f"Available databases: {', '.join(db_names)}")
        except Exception as e:
            st.warning("⚠️ Unable to get database list")
            st.write(f"Error: {e}")

    # Feature overview
    st.markdown("---")
    st.subheader("🚀 Feature Overview")

    col1, col2 = st.columns(2)

    with col1:
        st.markdown("""
        ### 🗄️ Database Manager
        - CSV/ZIP file import
        - SQL script import
        - Database browsing
        - Table structure viewing
        """)

    with col2:
        st.markdown("""
        ### 🧮 Relational Algebra Exercises
        - Guided 3-step workflow
        - Pre-defined practice catalog
        - Custom expression workspace
        - Execution trace visualization
        """)

    col3, col4 = st.columns(2)

    with col3:
        st.markdown("""
        ### 🧠 SQL Exercises
        - Curated practice problems
        - Automated relational algebra checking
        - SQL solution references
        - Expected result walkthroughs
        """)

    with col4:
        st.markdown("""
        ### 🔄 RA ↔ SQL Reference
        - Side-by-side solution explorer
        - Expected schema and data previews
        - Translation tips and heuristics
        - Database-scoped exercise catalog
        """)

    # Usage instructions
    with st.expander("📖 Detailed Usage Instructions"):
        active_db = st.session_state.get("selected_database") or (
            databases[0]["name"] if "databases" in locals() and databases else None
        )
        help_text = f"""
        ### Startup Guide
        
        1. **Start Backend Service**:
           ```bash
           uvicorn backend.main:app --reload
           ```
        
        2. **Start Frontend Application**:
           ```bash
           streamlit run frontend/app.py
           ```
        
        3. **Access Application**: Open `http://localhost:8501` in your browser
        
        ### Supported Relational Algebra Operations & Examples
        {syntax_help_html(active_db)}
        
        ### Troubleshooting
        
        - **Backend connection failed**: Ensure backend service is running
        - **Query execution error**: Check syntax and table names
        - **Import failed**: Ensure file format is correct and UTF-8 encoded
        """
        st.markdown(help_text, unsafe_allow_html=True)


if __name__ == "__main__":
    main()
