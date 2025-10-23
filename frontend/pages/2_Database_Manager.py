"""
数据库管理页面
"""

import streamlit as st
import sys
import os

# 添加前端路径到 Python 路径
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.api_client import APIClient


def main():
    st.set_page_config(
        page_title="数据库管理 - RA 教育工具包", page_icon="🗄️", layout="wide"
    )

    st.title("🗄️ 数据库管理")
    st.markdown("---")

    # 初始化 API 客户端
    api_client = APIClient()

    # 检查后端连接
    try:
        api_client.health_check()
        st.success("✅ 后端服务连接正常")
    except Exception as e:
        st.error(f"❌ 后端服务连接失败: {e}")
        st.info("请确保后端服务正在运行 (uvicorn backend.main:app --reload)")
        return

    # 获取数据库列表
    try:
        databases = api_client.get_databases()
    except Exception as e:
        st.error(f"获取数据库列表失败: {e}")
        return

    # 显示现有数据库
    st.header("📊 现有数据库")

    if databases:
        for db in databases:
            with st.expander(f"🗃️ {db['name']} ({db['table_count']} 个表)"):
                col1, col2 = st.columns(2)

                with col1:
                    st.write("**表列表:**")
                    for table in db["tables"]:
                        st.write(f"• {table}")

                with col2:
                    st.write("**统计信息:**")
                    st.write(f"• 表数量: {db['table_count']}")
                    st.write(f"• 数据库名: {db['name']}")
    else:
        st.info("暂无数据库")

    st.markdown("---")

    # 数据库导入功能
    st.header("📥 导入新数据库")

    # ZIP 文件导入
    st.subheader("从 ZIP 文件导入")
    uploaded_zip = st.file_uploader(
        "选择包含 CSV 文件的 ZIP 压缩包",
        type=["zip"],
        help="ZIP 文件应包含多个 CSV 文件，每个文件代表一个表",
    )

    if uploaded_zip:
        zip_name = st.text_input("数据库名称", value="NewDatabase")

        if st.button("导入 ZIP 数据库"):
            try:
                # 保存上传的文件
                zip_path = f"/tmp/{uploaded_zip.name}"
                with open(zip_path, "wb") as f:
                    f.write(uploaded_zip.getbuffer())

                # 调用 API 导入
                result = api_client.import_database_from_zip(zip_name, zip_path)
                st.success(f"✅ 成功导入数据库: {result['name']}")
                st.rerun()

            except Exception as e:
                st.error(f"导入失败: {e}")

    st.markdown("---")

    # SQL 文件导入
    st.subheader("从 SQL 文件导入")
    uploaded_sql = st.file_uploader(
        "选择 SQL 脚本文件",
        type=["sql"],
        help="SQL 文件应包含 CREATE TABLE 和 INSERT 语句",
    )

    if uploaded_sql:
        sql_name = st.text_input("数据库名称", value="SQLDatabase", key="sql_name")

        if st.button("导入 SQL 数据库"):
            try:
                # 保存上传的文件
                sql_path = f"/tmp/{uploaded_sql.name}"
                with open(sql_path, "wb") as f:
                    f.write(uploaded_sql.getbuffer())

                # 调用 API 导入
                result = api_client.import_database_from_sql(sql_name, sql_path)
                st.success(f"✅ 成功导入数据库: {result['name']}")
                st.rerun()

            except Exception as e:
                st.error(f"导入失败: {e}")

    # 帮助信息
    with st.expander("💡 导入帮助"):
        st.markdown("""
        ### ZIP 文件格式要求
        
        - ZIP 文件应包含多个 CSV 文件
        - 每个 CSV 文件代表一个表
        - 文件名（不含扩展名）将作为表名
        - 不支持嵌套目录结构
        
        ### SQL 文件格式要求
        
        - 文件必须是 UTF-8 编码
        - 应包含 CREATE TABLE 语句
        - 可以包含 INSERT 语句来插入数据
        - 支持标准的 SQLite 语法
        
        ### 示例文件结构
        
        ```
        database.zip
        ├── students.csv
        ├── courses.csv
        └── enrollments.csv
        ```
        """)


if __name__ == "__main__":
    main()
