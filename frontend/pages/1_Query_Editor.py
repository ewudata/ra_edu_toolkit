"""
查询编辑器页面
"""

import streamlit as st
import sys
import os

# 添加前端路径到 Python 路径
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.api_client import APIClient
from components.query_input import (
    query_input_component,
    database_selector_component,
    query_execute_button,
)
from components.result_viewer import (
    result_viewer_component,
    trace_viewer_component,
    error_display_component,
)
from components.trace_visualizer import (
    trace_visualizer_component,
    execution_summary_component,
)


def main():
    st.set_page_config(
        page_title="查询编辑器 - RA 教育工具包", page_icon="🔍", layout="wide"
    )

    st.title("🔍 关系代数查询编辑器")
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

    # 侧边栏 - 数据库选择
    with st.sidebar:
        st.header("📊 数据库选择")
        selected_database = database_selector_component(databases)

        if selected_database:
            st.success(f"已选择数据库: {selected_database}")

            # 显示数据库信息
            db_info = next(
                (db for db in databases if db["name"] == selected_database), None
            )
            if db_info:
                st.write(f"**表数量:** {db_info['table_count']}")
                st.write("**表列表:**")
                for table in db_info["tables"]:
                    st.write(f"• {table}")

    # 主内容区域
    if not selected_database:
        st.warning("请先在侧边栏选择一个数据库")
        return

    # 查询输入区域
    st.header("✏️ 查询输入")
    query_expression = query_input_component(
        label="输入关系代数表达式",
        placeholder="例如: π{name}(σ{major = 'CS'}(Students))",
    )

    # 执行按钮
    col1, col2, col3 = st.columns([1, 1, 1])
    with col2:
        execute_clicked = st.button(
            "🚀 执行查询", type="primary", use_container_width=True
        )

    # 查询执行和结果显示
    if execute_clicked and query_expression:
        with st.spinner("正在执行查询..."):
            try:
                # 这里需要先获取一个查询 ID，暂时使用默认值
                # 在实际应用中，可能需要创建一个通用的查询评估端点
                result = api_client.evaluate_query(
                    database=selected_database,
                    query_id="custom",  # 自定义查询
                    expression=query_expression,
                )

                # 显示结果
                st.success("✅ 查询执行成功!")

                # 结果查看器
                result_viewer_component(result)

                # 执行过程可视化
                trace_data = result.get("trace", [])
                if trace_data:
                    st.markdown("---")
                    trace_visualizer_component(trace_data)
                    execution_summary_component(trace_data)

            except Exception as e:
                error_display_component(str(e))

    elif execute_clicked and not query_expression:
        st.warning("请输入查询表达式")

    # 帮助信息
    with st.expander("💡 查询语法帮助"):
        st.markdown("""
        ### 关系代数操作符
        
        - **投影 (π)**: `π{attr1,attr2}(R)` - 选择特定属性
        - **选择 (σ)**: `σ{condition}(R)` - 根据条件过滤行
        - **重命名 (ρ)**: `ρ{old->new}(R)` - 重命名属性
        - **连接 (⋈)**: `R ⋈ S` - 自然连接
        - **笛卡尔积 (×)**: `R × S` - 笛卡尔积
        - **并集 (∪)**: `R ∪ S` - 并集
        - **差集 (−)**: `R − S` - 差集
        - **交集 (∩)**: `R ∩ S` - 交集
        
        ### 示例查询
        
        ```sql
        -- 选择计算机科学专业的学生姓名
        π{name}(σ{major = 'CS'}(Students))
        
        -- 查找选修了特定课程的学生
        π{name}(Students ⋈ Takes ⋈ σ{course_id = 'CS101'}(Courses))
        ```
        """)


if __name__ == "__main__":
    main()
