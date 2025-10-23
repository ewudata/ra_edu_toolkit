"""
RA Education Toolkit - Streamlit Frontend Application
"""

import streamlit as st
import sys
import os

# 添加前端路径到 Python 路径
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from utils.api_client import APIClient


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

    # Welcome message
    st.markdown("""
    ## Welcome to the Relational Algebra Education Toolkit!
    
    This is an interactive educational platform designed for learning relational algebra, helping you:
    
    - 🔍 **Write and test** relational algebra queries
    - 📊 **Visualize execution processes** to understand the effects of each operation
    - 📚 **Practice queries** through real exercises to improve your skills
    - 🗄️ **Manage databases** to import and organize learning data
    
    ### Quick Start
    
    1. Select **Query Editor** in the sidebar to start writing queries
    2. Use **Database Manager** to import your data
    3. Improve your skills through **Query Exercises**
    """)

    # Check backend connection status
    st.markdown("---")
    st.subheader("🔗 System Status")

    api_client = APIClient()

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

    col1, col2, col3 = st.columns(3)

    with col1:
        st.markdown("""
        ### 🔍 Query Editor
        - Interactive query writing
        - Real-time result preview
        - Execution process visualization
        - Syntax error hints
        """)

    with col2:
        st.markdown("""
        ### 📚 Query Exercises
        - Graded practice problems
        - Instant feedback
        - Standard answer comparison
        - Learning progress tracking
        """)

    with col3:
        st.markdown("""
        ### 🗄️ Database Manager
        - CSV/ZIP file import
        - SQL script import
        - Database browsing
        - Table structure viewing
        """)

    # Usage instructions
    with st.expander("📖 Detailed Usage Instructions"):
        st.markdown("""
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
        
        ### Supported Relational Algebra Operations
        
        - **Projection (π)**: `π{attr1,attr2}(R)`
        - **Selection (σ)**: `σ{condition}(R)`
        - **Rename (ρ)**: `ρ{old->new}(R)`
        - **Join (⋈)**: `R ⋈ S`
        - **Cartesian Product (×)**: `R × S`
        - **Union (∪)**: `R ∪ S`
        - **Difference (−)**: `R − S`
        - **Intersection (∩)**: `R ∩ S`
        
        ### Example Queries
        
        ```sql
        -- Find computer science students
        π{name}(σ{major = 'CS'}(Students))
        
        -- Find students enrolled in specific courses
        π{name}(Students ⋈ Takes ⋈ σ{course_id = 'CS101'}(Courses))
        ```
        
        ### Troubleshooting
        
        - **Backend connection failed**: Ensure backend service is running
        - **Query execution error**: Check syntax and table names
        - **Import failed**: Ensure file format is correct and UTF-8 encoded
        """)


if __name__ == "__main__":
    main()
