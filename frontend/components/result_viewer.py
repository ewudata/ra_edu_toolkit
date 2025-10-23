"""
结果查看器组件
"""

import streamlit as st
import pandas as pd
from typing import List, Dict, Any, Optional


def result_viewer_component(
    result_data: Dict[str, Any], key: str = "result_viewer"
) -> None:
    """
    结果查看器组件

    Args:
        result_data: 查询结果数据
        key: Streamlit 组件键
    """
    if not result_data:
        st.info("暂无查询结果")
        return

    # 显示基本信息
    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("行数", result_data.get("row_count", 0))
    with col2:
        st.metric("列数", len(result_data.get("schema", [])))
    with col3:
        st.metric("数据库", result_data.get("database", "未知"))

    # 显示模式信息
    schema = result_data.get("schema", [])
    if schema:
        st.subheader("结果模式")
        st.write(", ".join(schema))

    # 显示数据表格
    rows = result_data.get("rows", [])
    if rows:
        st.subheader("查询结果")
        df = pd.DataFrame(rows)
        st.dataframe(df, use_container_width=True)

        # 提供下载选项
        csv = df.to_csv(index=False)
        st.download_button(
            label="下载 CSV", data=csv, file_name="query_result.csv", mime="text/csv"
        )
    else:
        st.info("查询结果为空")


def trace_viewer_component(
    trace_data: List[Dict[str, Any]], key: str = "trace_viewer"
) -> None:
    """
    执行过程可视化组件

    Args:
        trace_data: 执行跟踪数据
        key: Streamlit 组件键
    """
    if not trace_data:
        st.info("暂无执行跟踪信息")
        return

    st.subheader("执行过程")

    for i, step in enumerate(trace_data, 1):
        with st.expander(f"步骤 {i}: {step.get('op', '未知操作')}"):
            # 显示步骤信息
            col1, col2 = st.columns(2)

            with col1:
                st.write("**输入模式:**")
                input_schema = step.get("input_schema", [])
                if input_schema:
                    st.write(", ".join(input_schema))
                else:
                    st.write("无")

            with col2:
                st.write("**输出模式:**")
                output_schema = step.get("output_schema", [])
                if output_schema:
                    st.write(", ".join(output_schema))
                else:
                    st.write("无")

            # 显示行数变化
            rows = step.get("rows", 0)
            st.write(f"**结果行数:** {rows}")

            # 显示预览数据
            preview = step.get("preview", [])
            if preview:
                st.write("**预览数据:**")
                preview_df = pd.DataFrame(preview)
                st.dataframe(preview_df, use_container_width=True)

            # 显示详细信息
            detail = step.get("detail")
            if detail:
                st.write("**详细信息:**")
                st.json(detail)

            # 显示备注
            note = step.get("note")
            if note:
                st.write(f"**备注:** {note}")


def error_display_component(error_message: str, key: str = "error_display") -> None:
    """
    错误显示组件

    Args:
        error_message: 错误消息
        key: Streamlit 组件键
    """
    st.error(f"❌ 查询执行失败: {error_message}")
