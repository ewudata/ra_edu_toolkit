"""
执行过程可视化组件
"""

import streamlit as st
import pandas as pd
from typing import List, Dict, Any


def trace_visualizer_component(
    trace_data: List[Dict[str, Any]], key: str = "trace_visualizer"
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

    st.subheader("🔍 执行过程可视化")

    # 创建步骤导航
    step_names = [
        f"步骤 {i + 1}: {step.get('op', '未知')}" for i, step in enumerate(trace_data)
    ]

    if len(step_names) > 1:
        selected_step = st.selectbox(
            "选择要查看的步骤", step_names, key=f"{key}_step_selector"
        )
        selected_index = step_names.index(selected_step)
    else:
        selected_index = 0

    # 显示选中步骤的详细信息
    if selected_index < len(trace_data):
        step = trace_data[selected_index]
        display_step_details(step, selected_index + 1)


def display_step_details(step: Dict[str, Any], step_number: int) -> None:
    """
    显示单个步骤的详细信息

    Args:
        step: 步骤数据
        step_number: 步骤编号
    """
    st.markdown(f"### 步骤 {step_number}: {step.get('op', '未知操作')}")

    # 基本信息
    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric("输入行数", step.get("input_rows", 0))

    with col2:
        st.metric("输出行数", step.get("rows", 0))

    with col3:
        delta = step.get("rows", 0) - step.get("input_rows", 0)
        st.metric("行数变化", delta)

    # 模式信息
    col1, col2 = st.columns(2)

    with col1:
        st.write("**输入模式:**")
        input_schema = step.get("input_schema", [])
        if input_schema:
            for attr in input_schema:
                st.write(f"• {attr}")
        else:
            st.write("无输入")

    with col2:
        st.write("**输出模式:**")
        output_schema = step.get("output_schema", [])
        if output_schema:
            for attr in output_schema:
                st.write(f"• {attr}")
        else:
            st.write("无输出")

    # 预览数据
    preview = step.get("preview", [])
    if preview:
        st.write("**预览数据:**")
        preview_df = pd.DataFrame(preview)
        st.dataframe(preview_df, use_container_width=True)

    # 详细信息
    detail = step.get("detail")
    if detail:
        with st.expander("查看详细信息"):
            st.json(detail)

    # 备注
    note = step.get("note")
    if note:
        st.info(f"💡 {note}")


def execution_summary_component(
    trace_data: List[Dict[str, Any]], key: str = "execution_summary"
) -> None:
    """
    执行摘要组件

    Args:
        trace_data: 执行跟踪数据
        key: Streamlit 组件键
    """
    if not trace_data:
        return

    st.subheader("📊 执行摘要")

    # 统计信息
    total_steps = len(trace_data)
    total_operations = len(set(step.get("op", "") for step in trace_data))

    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric("总步骤数", total_steps)

    with col2:
        st.metric("操作类型数", total_operations)

    with col3:
        if trace_data:
            final_rows = trace_data[-1].get("rows", 0)
            st.metric("最终结果行数", final_rows)

    # 操作类型分布
    operation_counts = {}
    for step in trace_data:
        op = step.get("op", "未知")
        operation_counts[op] = operation_counts.get(op, 0) + 1

    if operation_counts:
        st.write("**操作类型分布:**")
        for op, count in operation_counts.items():
            st.write(f"• {op}: {count} 次")
