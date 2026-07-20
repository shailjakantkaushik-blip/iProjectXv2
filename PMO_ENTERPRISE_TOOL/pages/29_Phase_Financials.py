"""29 · Phase Financials — per-stage-gate planned/actual dates + $ tracking.

Everything on this page ties back to the project's total budget and feeds
into the Timeline, Infographic and Programs pages via `utils/health.py`.
"""
from __future__ import annotations
import pandas as pd
import streamlit as st
from utils import auth as _auth; _auth.login_gate()
import plotly.express as px
import plotly.graph_objects as go

from config import STAGES
from utils.theme_manager import apply_theme, plotly_layout
from utils.excel_loader import load_all
from utils.data_io import write_sheet
from utils.health import (project_phase_summary, project_rollup, rag_chip,
                          RAG_HEX)

apply_theme()
st.title("💠 Stage-Gate Phase Financials")
st.caption("Plan and track each stage-gate's dates and $ — schedule and "
           "financial health flow into every other tab automatically.")

data = load_all()
projects = data.get("projects", pd.DataFrame()).copy()
phases_all = data.get("phasefinancials", pd.DataFrame()).copy()

if projects.empty:
    st.error("No projects loaded."); st.stop()

names = projects["Project Name"].astype(str).tolist()
sel = st.selectbox("Project", names)
prow = projects[projects["Project Name"] == sel].iloc[0]
pid = str(prow["Project ID"])

# ---- seed phase rows if missing -----------------------------------------
existing = phases_all[phases_all.get("Project ID", "").astype(str) == pid] if not phases_all.empty else pd.DataFrame()
existing_stages = set(existing["Stage"].astype(str)) if not existing.empty else set()
missing = [s for s in STAGES if s not in existing_stages]
if missing:
    seed = pd.DataFrame([{
        "Project ID": pid, "Stage": s,
        "Planned Start": pd.NaT, "Planned End": pd.NaT,
        "Actual Start": pd.NaT, "Actual End": pd.NaT,
        "Phase Budget": 0, "Phase Forecast": 0, "Phase Actual Spend": 0,
        "Status": "Not Started", "Notes": "",
    } for s in missing])
    phases_all = pd.concat([phases_all, seed], ignore_index=True) if not phases_all.empty else seed

phases = phases_all[phases_all["Project ID"].astype(str) == pid].copy()
# Sort by canonical STAGES order
phases["_ord"] = phases["Stage"].apply(lambda s: STAGES.index(s) if s in STAGES else 99)
phases = phases.sort_values("_ord").drop(columns=["_ord"]).reset_index(drop=True)

# ---- rollup + KPIs -------------------------------------------------------
rollup = project_rollup(prow, phases_all)

k = st.columns(6)
k[0].metric("Project Budget",        f"${rollup['Budget']/1e6:.2f}M")
k[1].metric("Allocated to Phases",   f"${rollup['Allocated to Phases']/1e6:.2f}M")
k[2].metric("Unallocated",           f"${rollup['Unallocated']/1e6:.2f}M")
k[3].metric("Actual Spend",          f"${rollup['Actual']/1e6:.2f}M")
k[4].metric("Forecast at Complete",  f"${rollup['Forecast']/1e6:.2f}M")
k[5].metric("Remaining",             f"${rollup['Remaining']/1e6:.2f}M",
            delta=f"{rollup['Consumed %']}% used")

st.markdown(
    "**Health:** " +
    rag_chip(rollup["Schedule Health"], f"Schedule · {rollup['Schedule Health']}") +
    " &nbsp; " +
    rag_chip(rollup["Financial Health"], f"Financial · {rollup['Financial Health']}") +
    " &nbsp; " +
    rag_chip(rollup["Health"], f"Overall · {rollup['Health']}"),
    unsafe_allow_html=True,
)

if rollup["Allocated to Phases"] > rollup["Budget"] > 0:
    st.warning(f"⚠️ Phase budgets total ${rollup['Allocated to Phases']/1e6:.2f}M — "
               f"${(rollup['Allocated to Phases']-rollup['Budget'])/1e6:.2f}M over the project budget.")

# ---- editor --------------------------------------------------------------
st.markdown("### ✏️ Phase plan & actuals")
edit_cols = ["Stage", "Status",
             "Planned Start", "Planned End", "Actual Start", "Actual End",
             "Phase Budget", "Phase Forecast", "Phase Actual Spend", "Notes"]
edit_df = phases.reindex(columns=edit_cols).copy()

edited = st.data_editor(
    edit_df, use_container_width=True, hide_index=True, num_rows="fixed",
    column_config={
        "Stage": st.column_config.TextColumn(disabled=True),
        "Status": st.column_config.SelectboxColumn(
            options=["Not Started", "In Progress", "Complete", "On Hold"]),
        "Planned Start": st.column_config.DateColumn(format="YYYY-MM-DD"),
        "Planned End":   st.column_config.DateColumn(format="YYYY-MM-DD"),
        "Actual Start":  st.column_config.DateColumn(format="YYYY-MM-DD"),
        "Actual End":    st.column_config.DateColumn(format="YYYY-MM-DD"),
        "Phase Budget":       st.column_config.NumberColumn(format="$%.0f"),
        "Phase Forecast":     st.column_config.NumberColumn(format="$%.0f"),
        "Phase Actual Spend": st.column_config.NumberColumn(format="$%.0f"),
    },
    key=f"phase_editor_{pid}",
)

if st.button("💾 Save phase financials", type="primary"):
    try:
        others = phases_all[phases_all["Project ID"].astype(str) != pid].copy()
        new_rows = edited.copy()
        new_rows.insert(0, "Project ID", pid)
        merged = pd.concat([others, new_rows], ignore_index=True)
        write_sheet("PhaseFinancials", merged)
        st.success("Saved. Timeline, Programs and Infographic will reflect on next load.")
        st.rerun()
    except Exception as e:
        st.error(f"Save failed: {e}")

# ---- derived view --------------------------------------------------------
summary = project_phase_summary(pid, phases_all)
if summary.empty:
    st.info("Add planned dates and $ above, then save to see charts."); st.stop()

st.markdown("### 📊 Phase spend view")
c1, c2 = st.columns(2)

with c1:
    long = summary.melt(id_vars=["Stage"],
                        value_vars=["Phase Budget", "Phase Forecast", "Phase Actual Spend"],
                        var_name="Type", value_name="Amount")
    fig = px.bar(long, x="Stage", y="Amount", color="Type", barmode="group",
                 title="Budget vs Forecast vs Actual per phase",
                 color_discrete_map={"Phase Budget": "#3b82f6",
                                     "Phase Forecast": "#8b5cf6",
                                     "Phase Actual Spend": "#f59e0b"})
    fig.update_layout(**plotly_layout(height=360))
    st.plotly_chart(fig, use_container_width=True)

with c2:
    gauge = go.Figure(go.Indicator(
        mode="gauge+number+delta",
        value=rollup["Actual"],
        number={"prefix": "$", "valueformat": ",.0f"},
        delta={"reference": rollup["Budget"], "increasing": {"color": "#ef4444"},
               "decreasing": {"color": "#22c55e"}},
        gauge={
            "axis": {"range": [0, max(rollup["Budget"], rollup["Forecast"], 1)]},
            "bar": {"color": RAG_HEX[rollup["Financial Health"]]},
            "steps": [
                {"range": [0, rollup["Budget"] * 0.8], "color": "rgba(34,197,94,0.15)"},
                {"range": [rollup["Budget"] * 0.8, rollup["Budget"]], "color": "rgba(245,158,11,0.25)"},
                {"range": [rollup["Budget"], max(rollup["Budget"], rollup["Forecast"], 1)],
                 "color": "rgba(239,68,68,0.25)"},
            ],
            "threshold": {"line": {"color": "#ef4444", "width": 3},
                          "value": rollup["Budget"]},
        },
        title={"text": "Actual vs Project Budget"},
    ))
    gauge.update_layout(**plotly_layout(height=360))
    st.plotly_chart(gauge, use_container_width=True)

# Burn-down
st.markdown("### 🔥 Cumulative burn — planned vs actual")
burn = summary.copy()
burn["Cum Planned"] = burn["Phase Budget"].cumsum()
burn["Cum Actual"]  = burn["Phase Actual Spend"].cumsum()
fig = go.Figure()
fig.add_trace(go.Scatter(x=burn["Stage"], y=burn["Cum Planned"], mode="lines+markers",
                         name="Cum Planned $", line=dict(color="#3b82f6", width=3)))
fig.add_trace(go.Scatter(x=burn["Stage"], y=burn["Cum Actual"], mode="lines+markers",
                         name="Cum Actual $", line=dict(color="#f59e0b", width=3)))
fig.add_hline(y=rollup["Budget"], line=dict(color="#ef4444", dash="dash"),
              annotation_text="Project Budget", annotation_position="top left")
fig.update_layout(**plotly_layout(height=340))
st.plotly_chart(fig, use_container_width=True)

# Phase table w/ chips
st.markdown("### 🚦 Phase health table")
view = summary[["Stage", "Status", "Planned Start", "Planned End",
                "Actual Start", "Actual End", "Phase Budget", "Phase Actual Spend",
                "Remaining", "Schedule Var (days)", "Schedule Health",
                "Financial Health", "Health"]].copy()
for c in ("Phase Budget", "Phase Actual Spend", "Remaining"):
    view[c] = view[c].apply(lambda v: f"${v:,.0f}")
st.dataframe(view, use_container_width=True, hide_index=True)
