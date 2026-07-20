"""Portfolio Prioritisation — weighted scoring matrix."""
from __future__ import annotations
import pandas as pd
import streamlit as st
from utils import auth as _auth; _auth.login_gate()
import plotly.express as px

from utils.excel_loader import load_all
from utils.theme_manager import apply_theme, render_sheet, plotly_layout
from utils.data_io import write_sheet

apply_theme()

st.title("🏅 Portfolio Prioritisation")
st.caption("Strategic 30% · Benefit 25% · Risk Reduction 20% · Compliance 15% · Complexity −10%")

data = load_all()
pr   = data.get("prioritisation", pd.DataFrame())
proj = data.get("projects",       pd.DataFrame())

if pr.empty:
    st.warning("Prioritisation sheet is empty."); st.stop()

pr = pr.sort_values("Score", ascending=False).reset_index(drop=True)

st.markdown("### Top-ranked initiatives")
top = pr.head(15)
fig = px.bar(top, x="Score", y="Project Name", orientation="h",
             color="Score", color_continuous_scale="Blues",
             title="Top 15 by Priority Score")
_layout = plotly_layout(height=480)
_layout_yaxis = _layout.pop("yaxis", {}) or {}
_layout_yaxis = {**_layout_yaxis, "autorange": "reversed"}
fig.update_layout(**_layout, yaxis=_layout_yaxis)
st.plotly_chart(fig, use_container_width=True)

if not proj.empty and "Project ID" in proj.columns:
    merge_cols = ["Project ID"] + [c for c in ["Approved Funding","Benefits Forecast"] if c in proj.columns]
    # RAG may already exist on pr (hydrated from Projects); only pull if missing.
    if "RAG" not in pr.columns and "RAG" in proj.columns:
        merge_cols.append("RAG")
    m = pr.merge(proj[merge_cols], on="Project ID", how="left")
    st.markdown("### Value vs Effort bubble")
    fig = px.scatter(m, x="Complexity (1-5)", y="Score",
                     size=pd.to_numeric(m.get("Approved Funding"), errors="coerce").fillna(0)+1,
                     color="RAG", hover_name="Project Name",
                     color_discrete_map={"Green":"#22c55e","Amber":"#f59e0b","Red":"#ef4444"},
                     title="Score vs Complexity (bubble = funding)")
    fig.update_layout(**plotly_layout(height=420))
    st.plotly_chart(fig, use_container_width=True)

st.markdown("### Ranked list")
render_sheet(pr)

st.markdown("### ✏️ Adjust scores")
edit = st.data_editor(pr, num_rows="dynamic", use_container_width=True, key="pr_editor")
if st.button("💾 Save scores"):
    write_sheet("Prioritisation", edit)
    st.success("Saved. Formulas recompute on next refresh.")
