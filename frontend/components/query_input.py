"""
查询输入组件
"""

import streamlit as st
from typing import Optional


def query_input_component(
    label: str = "输入关系代数表达式",
    placeholder: str = "例如: π{name}(σ{major = 'CS'}(Students))",
    key: str = "query_input",
) -> Optional[str]:
    """
    查询输入组件

    Args:
        label: 输入框标签
        placeholder: 占位符文本
        key: Streamlit 组件键

    Returns:
        用户输入的查询表达式，如果为空则返回 None
    """
    query = st.text_area(
        label,
        placeholder=placeholder,
        height=100,
        key=key,
        help="输入关系代数表达式，支持投影(π)、选择(σ)、连接(⋈)等操作",
    )

    if query and query.strip():
        return query.strip()
    return None


def database_selector_component(
    databases: list, key: str = "database_selector"
) -> Optional[str]:
    """
    数据库选择组件

    Args:
        databases: 数据库列表
        key: Streamlit 组件键

    Returns:
        选中的数据库名称
    """
    if not databases:
        st.warning("没有可用的数据库")
        return None

    database_names = [db["name"] for db in databases]
    selected_db = st.selectbox(
        "选择数据库", database_names, key=key, help="选择要查询的数据库"
    )

    return selected_db


def query_execute_button(label: str = "执行查询", key: str = "execute_button") -> bool:
    """
    查询执行按钮

    Args:
        label: 按钮文本
        key: Streamlit 组件键

    Returns:
        是否点击了执行按钮
    """
    col1, col2, col3 = st.columns([1, 1, 1])
    with col2:
        return st.button(label, key=key, type="primary")
