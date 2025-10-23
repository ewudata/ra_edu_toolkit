"""
查询练习页面
"""

import streamlit as st
import sys
import os

# 添加前端路径到 Python 路径
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.api_client import APIClient
from components.query_input import database_selector_component
from components.result_viewer import result_viewer_component, error_display_component


def main():
    st.set_page_config(
        page_title="查询练习 - RA 教育工具包", page_icon="📚", layout="wide"
    )

    st.title("📚 关系代数查询练习")
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
        st.header("📊 选择数据库")
        selected_database = database_selector_component(databases)

        if selected_database:
            st.success(f"已选择数据库: {selected_database}")

    if not selected_database:
        st.warning("请先在侧边栏选择一个数据库")
        return

    # 获取查询列表
    try:
        queries = api_client.get_queries(selected_database)
    except Exception as e:
        st.error(f"获取查询列表失败: {e}")
        return

    if not queries:
        st.info("该数据库暂无练习查询")
        return

    # 查询选择
    st.header("📝 选择练习")

    query_options = {
        f"{q['title']} ({q.get('difficulty', '未知难度')})": q for q in queries
    }
    selected_query_title = st.selectbox(
        "选择要练习的查询", list(query_options.keys()), help="选择一个查询进行练习"
    )

    if not selected_query_title:
        return

    selected_query = query_options[selected_query_title]

    # 显示查询详情
    st.markdown("---")
    st.subheader("📋 练习题目")

    col1, col2 = st.columns([2, 1])

    with col1:
        st.write(f"**题目:** {selected_query['title']}")
        st.write(f"**描述:** {selected_query['prompt']}")

        if selected_query.get("difficulty"):
            st.write(f"**难度:** {selected_query['difficulty']}")

        if selected_query.get("tags"):
            st.write(f"**标签:** {', '.join(selected_query['tags'])}")

    with col2:
        # 获取详细查询信息
        try:
            query_detail = api_client.get_query_detail(
                selected_database, selected_query["id"]
            )

            if query_detail.get("hints"):
                with st.expander("💡 提示"):
                    for i, hint in enumerate(query_detail["hints"], 1):
                        st.write(f"{i}. {hint}")

        except Exception as e:
            st.warning(f"获取查询详情失败: {e}")

    # 学生解答区域
    st.markdown("---")
    st.subheader("✏️ 你的解答")

    student_answer = st.text_area(
        "输入你的关系代数表达式",
        placeholder="在这里输入你的解答...",
        height=150,
        help="根据题目要求编写关系代数表达式",
    )

    col1, col2, col3 = st.columns([1, 1, 1])
    with col2:
        submit_answer = st.button(
            "🚀 提交解答", type="primary", use_container_width=True
        )

    # 解答评估
    if submit_answer and student_answer:
        with st.spinner("正在评估你的解答..."):
            try:
                result = api_client.evaluate_query(
                    database=selected_database,
                    query_id=selected_query["id"],
                    expression=student_answer,
                )

                st.success("✅ 解答提交成功!")

                # 显示结果
                result_viewer_component(result)

                # 显示标准答案（如果有）
                try:
                    query_detail = api_client.get_query_detail(
                        selected_database, selected_query["id"]
                    )

                    if query_detail.get("solution", {}).get("relational_algebra"):
                        with st.expander("📖 查看标准答案"):
                            st.write("**关系代数表达式:**")
                            st.code(query_detail["solution"]["relational_algebra"])

                            if query_detail["solution"].get("sql"):
                                st.write("**对应的 SQL 查询:**")
                                st.code(query_detail["solution"]["sql"])

                    # 显示预期结果
                    if query_detail.get("expected_schema") or query_detail.get(
                        "expected_rows"
                    ):
                        with st.expander("🎯 预期结果"):
                            if query_detail.get("expected_schema"):
                                st.write("**预期模式:**")
                                st.write(", ".join(query_detail["expected_schema"]))

                            if query_detail.get("expected_rows"):
                                st.write("**预期数据:**")
                                import pandas as pd

                                expected_df = pd.DataFrame(
                                    query_detail["expected_rows"]
                                )
                                st.dataframe(expected_df, use_container_width=True)

                except Exception as e:
                    st.warning(f"获取标准答案失败: {e}")

            except Exception as e:
                error_display_component(str(e))

    elif submit_answer and not student_answer:
        st.warning("请输入你的解答")

    # 学习资源
    with st.expander("📚 学习资源"):
        st.markdown("""
        ### 关系代数基础
        
        - **投影 (π)**: 选择特定的列
        - **选择 (σ)**: 根据条件过滤行
        - **连接 (⋈)**: 合并两个表
        - **并集 (∪)**: 合并两个查询的结果
        - **差集 (−)**: 从一个查询结果中减去另一个
        
        ### 解题技巧
        
        1. **理解题目**: 仔细阅读题目描述，明确要查询什么
        2. **分析数据**: 了解表的结构和关系
        3. **分解问题**: 将复杂查询分解为简单步骤
        4. **逐步构建**: 从最内层的操作开始构建表达式
        5. **验证结果**: 检查结果是否符合预期
        """)


if __name__ == "__main__":
    main()
