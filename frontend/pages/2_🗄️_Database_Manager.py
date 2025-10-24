"""
Database Manager Page
"""

import streamlit as st
import sys
import os

# Add frontend path to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.api_client import APIClient


def main():
    st.set_page_config(
        page_title="Database Manager - RA Education Toolkit",
        page_icon="🗄️",
        layout="wide",
    )

    st.title("🗄️ Database Manager")
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

    # Display existing databases
    st.header("📊 Existing Databases")

    if databases:
        for db in databases:
            with st.expander(f"🗃️ {db['name']} ({db['table_count']} tables)"):
                col1, col2 = st.columns(2)

                with col1:
                    st.write("**Table list:**")
                    for table in db["tables"]:
                        st.write(f"• {table}")

                with col2:
                    st.write("**Statistics:**")
                    st.write(f"• Table count: {db['table_count']}")
                    st.write(f"• Database name: {db['name']}")
    else:
        st.info("No databases available")

    st.markdown("---")

    # Database import functionality
    st.header("📥 Import New Database")

    # ZIP file import
    st.subheader("Import from ZIP File")
    uploaded_zip = st.file_uploader(
        "Select a ZIP file containing CSV files",
        type=["zip"],
        help="ZIP file should contain multiple CSV files, each representing a table",
    )

    if uploaded_zip:
        zip_name = st.text_input("Database name", value="NewDatabase")

        if st.button("Import ZIP Database"):
            try:
                # Save uploaded file
                zip_path = f"/tmp/{uploaded_zip.name}"
                with open(zip_path, "wb") as f:
                    f.write(uploaded_zip.getbuffer())

                # Call API to import
                result = api_client.import_database_from_zip(zip_name, zip_path)
                st.success(f"✅ Successfully imported database: {result['name']}")
                st.rerun()

            except Exception as e:
                st.error(f"Import failed: {e}")

    st.markdown("---")

    # SQL file import
    st.subheader("Import from SQL File")
    uploaded_sql = st.file_uploader(
        "Select SQL script file",
        type=["sql"],
        help="SQL file should contain CREATE TABLE and INSERT statements",
    )

    if uploaded_sql:
        sql_name = st.text_input("Database name", value="SQLDatabase", key="sql_name")

        if st.button("Import SQL Database"):
            try:
                # Save uploaded file
                sql_path = f"/tmp/{uploaded_sql.name}"
                with open(sql_path, "wb") as f:
                    f.write(uploaded_sql.getbuffer())

                # Call API to import
                result = api_client.import_database_from_sql(sql_name, sql_path)
                st.success(f"✅ Successfully imported database: {result['name']}")
                st.rerun()

            except Exception as e:
                st.error(f"Import failed: {e}")

    # Help information
    with st.expander("💡 Import Help"):
        st.markdown("""
        ### ZIP File Format Requirements
        
        - ZIP file should contain multiple CSV files
        - Each CSV file represents a table
        - File name (without extension) will be used as table name
        - Nested directory structure is not supported
        
        ### SQL File Format Requirements
        
        - File must be UTF-8 encoded
        - Should contain CREATE TABLE statements
        - May contain INSERT statements to insert data
        - Supports standard SQLite syntax
        
        ### Example File Structure
        
        ```
        database.zip
        ├── students.csv
        ├── courses.csv
        └── enrollments.csv
        ```
        """)


if __name__ == "__main__":
    main()
