"""
Step Indicator Component
"""

import streamlit as st
from typing import Literal


def step_indicator_component(current_step: int, key: str = "step_indicator") -> None:
    """
    Step Indicator Component

    Args:
        current_step: Current step number (1, 2, or 3)
        key: Streamlit component key
    """
    steps = [
        {
            "number": 1,
            "title": "Select Database",
            "description": "Choose a database to work with",
        },
        {
            "number": 2,
            "title": "Pre-defined Queries",
            "description": "Practice with guided exercises",
        },
        {"number": 3, "title": "Custom Query", "description": "Write your own queries"},
    ]

    # Create columns for each step
    cols = st.columns(len(steps))

    for i, step in enumerate(steps):
        with cols[i]:
            # Determine step status
            if step["number"] < current_step:
                status = "completed"
                icon = "✅"
                color = "green"
            elif step["number"] == current_step:
                status = "current"
                icon = "🔄"
                color = "blue"
            else:
                status = "pending"
                icon = "⏳"
                color = "gray"

            # Display step
            st.markdown(
                f"""
            <div style="text-align: center; padding: 10px; border-radius: 8px; 
                        background-color: {"#e8f5e8" if status == "completed" else "#e3f2fd" if status == "current" else "#f5f5f5"}; 
                        border: 2px solid {"#4caf50" if status == "completed" else "#2196f3" if status == "current" else "#e0e0e0"};">
                <h3 style="margin: 0; color: {"#2e7d32" if status == "completed" else "#1976d2" if status == "current" else "#757575"};">
                    {icon} Step {step["number"]}
                </h3>
                <p style="margin: 5px 0 0 0; font-weight: bold; color: {"#2e7d32" if status == "completed" else "#1976d2" if status == "current" else "#757575"};">
                    {step["title"]}
                </p>
                <p style="margin: 5px 0 0 0; font-size: 0.8em; color: #666;">
                    {step["description"]}
                </p>
            </div>
            """,
                unsafe_allow_html=True,
            )

    # Add progress bar
    progress = current_step / len(steps)
    st.progress(progress, text=f"Progress: Step {current_step} of {len(steps)}")
