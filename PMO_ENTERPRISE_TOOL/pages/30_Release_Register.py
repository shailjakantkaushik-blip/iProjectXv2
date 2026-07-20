"""Release Register — planned & delivered releases across projects."""
from __future__ import annotations
import pandas as pd
import streamlit as st
from utils import auth as _auth; _auth.login_gate()
import plotly.express as px

from utils.excel_loader import load_all
from utils.theme_manager import apply_theme, render_sheet, plotly_layout

apply_theme()

st.title("🚀 Release Register")
st.caption("Track planned and delivered releases across the portfolio.")

data = load_all()
rel = data.get("releases", pd.DataFrame())
proj = data.get("projects", pd.DataFrame())

if rel is None or rel.empty:
    st.info("No **Releases** sheet found in the master workbook yet. "
            "Add a `Releases` sheet with columns like: "
            "`Release ID, Project ID, Release Name, Version, Type, "
            "Planned Date, Actual Date, Status, Owner, Environment, Notes`. "
            "Once present, this page will render KPIs, filters and a timeline automatically.")
    st.stop()

# Enrich with project name
if not proj.empty and "Project ID" in rel.columns and "Project ID" in proj.columns:
    rel = rel.merge(proj[["Project ID", "Project Name"]].drop_duplicates(),
                    on="Project ID", how="left")

# Normalise dates
for c in ("Planned Date", "Actual Date"):
    if c in rel.columns:
        rel[c] = pd.to_datetime(rel[c], errors="coerce")

today = pd.Timestamp.today().normalize()
total     = len(rel)
delivered = (rel.get("Status", "").astype(str).str.lower() == "delivered").sum()
planned   = (rel.get("Status", "").astype(str).str.lower().isin(["planned", "in progress"])).sum()
overdue   = 0
if "Planned Date" in rel.columns:
    overdue = int(((rel["Planned Date"] < today)
                   & (rel.get("Status", "").astype(str).str.lower() != "delivered")).sum())

cols = st.columns(4)
for c, (l, v) in zip(cols, [("Total Releases", total),
                            ("Delivered", delivered),
                            ("Planned / In-Progress", planned),
                            ("Overdue", overdue)]):
    c.markdown(f"<div class='kpi-card'><div class='kpi-label'>{l}</div>"
               f"<div class='kpi-value'>{v}</div></div>",
               unsafe_allow_html=True)

# Filters
f1, f2, f3 = st.columns(3)
def _opts(col):
    return sorted(rel[col].dropna().astype(str).unique().tolist()) if col in rel.columns else []
sel_status = f1.multiselect("Status",  _opts("Status"))
sel_type   = f2.multiselect("Type",    _opts("Type"))
sel_proj   = f3.multiselect("Project", _opts("Project Name"))

view = rel.copy()
if sel_status and "Status" in view.columns:
    view = view[view["Status"].astype(str).isin(sel_status)]
if sel_type and "Type" in view.columns:
    view = view[view["Type"].astype(str).isin(sel_type)]
if sel_proj and "Project Name" in view.columns:
    view = view[view["Project Name"].astype(str).isin(sel_proj)]

# Timeline
if {"Planned Date", "Release Name"}.issubset(view.columns) and not view.empty:
    st.markdown("### Release Timeline")
    tl = view.copy()
    tl["Finish"] = tl["Actual Date"].fillna(tl["Planned Date"])
    tl = tl.dropna(subset=["Planned Date", "Finish"])
    if not tl.empty:
        fig = px.timeline(tl, x_start="Planned Date", x_end="Finish",
                          y="Release Name", color=tl.get("Status"),
                          hover_data=[c for c in ["Project Name", "Version",
                                                  "Type", "Owner", "Environment"]
                                      if c in tl.columns],
                          title="Planned vs Actual Release Dates")
        fig.update_yaxes(autorange="reversed")
        fig.update_layout(**plotly_layout(height=max(340, 30*len(tl)+120)))
        fig.add_vline(x=today, line=dict(color="#ef4444", dash="dash", width=2))
        st.plotly_chart(fig, use_container_width=True)

# Detail table
st.markdown("### All Releases")
render_sheet(view)
