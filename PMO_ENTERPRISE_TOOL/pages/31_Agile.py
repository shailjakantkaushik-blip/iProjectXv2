"""31 · Agile — Sprint velocity, burndown, and portfolio-level agile KPIs.

Data source: `Sprints` sheet (manual, part of the master Excel workbook).
Projects are tagged agile via `Projects.Delivery Method` ∈ {Agile, Hybrid}.
Waterfall projects are excluded from this page.

Sprints sheet columns:
    Sprint ID, Project ID, Project Name, Sprint #, Sprint Name,
    Start Date, End Date, Points Committed, Points Completed,
    Stories Committed, Stories Completed, Status, Team
"""
from __future__ import annotations
import streamlit as st
from utils import auth as _auth; _auth.login_gate()
import pandas as pd
import numpy as np
import plotly.graph_objects as go
import plotly.express as px

from utils.theme_manager import apply_theme
from utils.excel_loader import load_all

apply_theme()

st.title("🏃 Agile — Sprint Velocity & Burndown")
st.caption("Hybrid portfolio view. Waterfall projects use Stage Gates; "
           "agile / hybrid projects use sprints.")

data = load_all()
projects = data.get("projects", pd.DataFrame()).copy()
sprints  = data.get("sprints",  pd.DataFrame()).copy()

if sprints.empty:
    st.warning("No `Sprints` sheet found in the active workbook. "
               "Re-run `python generate_master.py`, or add a **Sprints** sheet "
               "with columns: Sprint ID, Project ID, Sprint #, Start Date, "
               "End Date, Points Committed, Points Completed, Status.")
    st.stop()

# Restrict to agile / hybrid projects
if not projects.empty and "Delivery Method" in projects.columns:
    agile_ids = projects.loc[
        projects["Delivery Method"].astype(str).isin(["Agile", "Hybrid"]),
        "Project ID"
    ].tolist()
    if agile_ids:
        sprints = sprints[sprints["Project ID"].isin(agile_ids)]

if sprints.empty:
    st.info("No projects are tagged as Agile or Hybrid. Set `Delivery Method` "
            "on the Projects sheet to enable this view.")
    st.stop()

# ─────────────────────────── PORTFOLIO KPIs ───────────────────────────
completed = sprints[sprints["Status"].astype(str) == "Complete"]
active    = sprints[sprints["Status"].astype(str) == "Active"]

total_committed = int(sprints["Points Committed"].sum())
total_completed = int(sprints["Points Completed"].sum())
avg_velocity    = float(completed["Points Completed"].mean()) if len(completed) else 0.0
say_do          = (100 * completed["Points Completed"].sum() /
                   completed["Points Committed"].sum()) if completed["Points Committed"].sum() else 0
n_agile_projects = sprints["Project ID"].nunique()
n_active_sprints = len(active)

# RAG: say/do >= 85 green, 70-85 amber, else red
if say_do >= 85: sprint_rag = "🟢 Healthy"
elif say_do >= 70: sprint_rag = "🟠 At Risk"
else: sprint_rag = "🔴 Under-delivering"

k = st.columns(6)
k[0].metric("Agile Projects", n_agile_projects)
k[1].metric("Active Sprints", n_active_sprints)
k[2].metric("Avg Velocity (pts/sprint)", f"{avg_velocity:,.1f}")
k[3].metric("Points Committed (all)", f"{total_committed:,}")
k[4].metric("Points Completed (all)", f"{total_completed:,}")
k[5].metric("Say/Do Ratio", f"{say_do:,.1f}%", help=sprint_rag)

st.markdown("---")

# ─────────────────────────── PORTFOLIO VELOCITY TREND ───────────────────────────
st.subheader("📈 Portfolio Velocity Trend")
by_sprint = (sprints.groupby("Sprint #", as_index=False)
             .agg(Committed=("Points Committed", "sum"),
                  Completed=("Points Completed", "sum")))
if not by_sprint.empty:
    fig = go.Figure()
    fig.add_bar(x=by_sprint["Sprint #"], y=by_sprint["Committed"],
                name="Committed", marker_color="#94a3b8")
    fig.add_bar(x=by_sprint["Sprint #"], y=by_sprint["Completed"],
                name="Completed", marker_color="#22c55e")
    fig.update_layout(barmode="group", height=360,
                      xaxis_title="Sprint #", yaxis_title="Story Points",
                      legend=dict(orientation="h", y=1.1))
    st.plotly_chart(fig, use_container_width=True)

# ─────────────────────────── PER-PROJECT DRILLDOWN ───────────────────────────
st.markdown("---")
st.subheader("🔍 Project Drilldown")

proj_options = sprints[["Project ID", "Project Name"]].drop_duplicates()
proj_options["label"] = proj_options["Project ID"] + " — " + proj_options["Project Name"].fillna("")
sel_label = st.selectbox("Select an agile / hybrid project",
                         options=proj_options["label"].tolist())
sel_pid = sel_label.split(" — ")[0]

psp = sprints[sprints["Project ID"] == sel_pid].sort_values("Sprint #")
if psp.empty:
    st.info("No sprints for this project.")
    st.stop()

# Project-level KPIs
p_completed = psp[psp["Status"] == "Complete"]
p_committed_total = int(psp["Points Committed"].sum())
p_completed_total = int(psp["Points Completed"].sum())
p_velocity = float(p_completed["Points Completed"].mean()) if len(p_completed) else 0.0
p_say_do = (100 * p_completed["Points Completed"].sum() /
            p_completed["Points Committed"].sum()) if p_completed["Points Committed"].sum() else 0

pk = st.columns(4)
pk[0].metric("Sprints Complete", len(p_completed))
pk[1].metric("Avg Velocity", f"{p_velocity:,.1f}")
pk[2].metric("Total Committed", f"{p_committed_total:,}")
pk[3].metric("Say/Do", f"{p_say_do:,.1f}%")

# ─────────────────────────── VELOCITY (Committed vs Completed) ───────────
st.markdown("**Sprint Velocity — Committed vs Completed**")
fig_v = go.Figure()
fig_v.add_bar(x=psp["Sprint Name"], y=psp["Points Committed"],
              name="Committed", marker_color="#94a3b8")
fig_v.add_bar(x=psp["Sprint Name"], y=psp["Points Completed"],
              name="Completed", marker_color="#3b82f6")
if len(p_completed) >= 2:
    avg_line = [p_velocity] * len(psp)
    fig_v.add_scatter(x=psp["Sprint Name"], y=avg_line,
                      mode="lines", name=f"Avg Velocity ({p_velocity:.0f})",
                      line=dict(color="#f59e0b", dash="dash"))
fig_v.update_layout(barmode="group", height=380,
                    xaxis_title="Sprint", yaxis_title="Story Points",
                    legend=dict(orientation="h", y=1.1))
st.plotly_chart(fig_v, use_container_width=True)

# ─────────────────────────── BURNDOWN (per selected sprint) ───────────────
st.markdown("**Sprint Burndown**")
sprint_pick = st.selectbox("Sprint",
                           options=psp["Sprint Name"].tolist(),
                           index=len(psp) - 1)
row = psp[psp["Sprint Name"] == sprint_pick].iloc[0]

s_start = pd.to_datetime(row["Start Date"])
s_end   = pd.to_datetime(row["End Date"])
committed = float(row["Points Committed"])
done      = float(row["Points Completed"])
status    = str(row["Status"])

if pd.isna(s_start) or pd.isna(s_end) or s_end < s_start:
    st.info("Sprint has no valid start/end dates for burndown.")
else:
    days = pd.date_range(s_start, s_end, freq="D")
    n = len(days)
    ideal = np.linspace(committed, 0, n)

    # Actual burndown: linear from committed → (committed - done) across
    # elapsed days. For completed sprints, ends at (committed - done). For
    # active sprints, only draw through today. Users can replace this with
    # a real per-day BurndownDaily sheet later.
    today = pd.Timestamp.today().normalize()
    if status == "Complete":
        actual = np.linspace(committed, committed - done, n)
    elif status == "Active":
        elapsed = max(1, min(n, (today - s_start).days + 1))
        actual_partial = np.linspace(committed, committed - done, elapsed)
        actual = np.concatenate([actual_partial, [np.nan] * (n - elapsed)])
    else:  # Planned
        actual = np.full(n, np.nan)

    fig_b = go.Figure()
    fig_b.add_scatter(x=days, y=ideal, mode="lines", name="Ideal",
                      line=dict(color="#94a3b8", dash="dash"))
    fig_b.add_scatter(x=days, y=actual, mode="lines+markers", name="Actual",
                      line=dict(color="#3b82f6", width=3))
    fig_b.update_layout(height=360, xaxis_title="Day",
                        yaxis_title="Points Remaining",
                        legend=dict(orientation="h", y=1.1))
    st.plotly_chart(fig_b, use_container_width=True)
    st.caption("Burndown is synthesised from Committed & Completed points. "
               "For a true daily curve, add a `BurndownDaily` sheet "
               "(Sprint ID, Day, Points Remaining) in a future release.")

# ─────────────────────────── SPRINT TABLE ───────────────────────────
st.markdown("**Sprint History**")
show_cols = ["Sprint #", "Sprint Name", "Start Date", "End Date",
             "Points Committed", "Points Completed",
             "Stories Committed", "Stories Completed", "Status", "Team"]
show_cols = [c for c in show_cols if c in psp.columns]
st.dataframe(psp[show_cols], use_container_width=True, hide_index=True)
