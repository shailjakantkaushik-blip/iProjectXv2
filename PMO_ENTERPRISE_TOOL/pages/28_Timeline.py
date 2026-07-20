"""28 · Portfolio Timeline — planned vs actual, grouped by any view.

Uses the same grouped bucket-timeline renderer as the Executive Dashboard
(Portfolio / Program / Health / Priority / Theme / Sponsor / Status), plus
the classic single-project swim lane and inline date editors.
"""
from __future__ import annotations
from datetime import timedelta
import pandas as pd
import streamlit as st
from utils import auth as _auth; _auth.login_gate()
import plotly.graph_objects as go
import plotly.express as px

from utils.theme_manager import apply_theme, plotly_layout
from utils.excel_loader import load_all
from utils.data_io import write_sheet
from utils.health import (project_phase_summary, project_rollup, RAG_HEX,
                          rag_chip)
from utils.timeline_views import render_view_selector, render_bucket_timelines


apply_theme()

st.title("🗓️ Portfolio Timeline — Planned vs Actual")
st.caption("Every project on one canvas. Light bar = plan, solid bar = actual, "
           "coloured by health. Hover a phase for $ and schedule variance.")

data = load_all()
projects = data.get("projects", pd.DataFrame()).copy()
phase_df = data.get("phasefinancials", pd.DataFrame()).copy()
if projects.empty:
    st.error("No projects loaded."); st.stop()

for c in ("Start Date", "End Date"):
    if c not in projects.columns:
        projects[c] = pd.NaT
    projects[c] = pd.to_datetime(projects[c], errors="coerce")

opt_cols = [c for c in ("Program", "Sponsor", "Portfolio Category",
                        "Governance Channel", "Status", "RAG")
            if c in projects.columns]

# ---- Filters -------------------------------------------------------------
with st.expander("🔎 Filters", expanded=True):
    cols = st.columns(min(4, max(1, len(opt_cols) + 1)))
    filters: dict[str, list] = {}
    for i, c in enumerate(opt_cols):
        vals = sorted([v for v in projects[c].dropna().astype(str).unique() if v])
        filters[c] = cols[i % len(cols)].multiselect(c, vals, default=vals)
    view_mode = st.radio("View", ["Portfolio (all projects)",
                                  "Single-project swim lane"], horizontal=True)

view = projects.copy()
for c, picks in filters.items():
    if picks:
        view = view[view[c].astype(str).isin(picks)]

today = pd.Timestamp.today().normalize()

# ---- Build rollups per project ------------------------------------------
rollups = {str(r["Project ID"]): project_rollup(r, phase_df)
           for _, r in view.iterrows()}

# ---- Portfolio KPIs ------------------------------------------------------
if rollups:
    tot_b = sum(r["Budget"] for r in rollups.values())
    tot_a = sum(r["Actual"] for r in rollups.values())
    tot_f = sum(r["Forecast"] for r in rollups.values())
    behind = sum(1 for r in rollups.values() if r["Schedule Health"] == "Red")
    over_b = sum(1 for r in rollups.values() if r["Financial Health"] == "Red")
    k = st.columns(5)
    k[0].metric("Projects",           len(rollups))
    k[1].metric("Portfolio Budget",   f"${tot_b/1e6:.2f}M")
    k[2].metric("Actual Spend",       f"${tot_a/1e6:.2f}M",
                delta=f"{(tot_a/tot_b*100) if tot_b else 0:.1f}% used")
    k[3].metric("Behind Schedule",    behind)
    k[4].metric("Over Budget",        over_b)

st.divider()

# ---- Portfolio Gantt -----------------------------------------------------
def _project_span(row, phases):
    ps = pd.to_datetime(row.get("Start Date"), errors="coerce")
    pe = pd.to_datetime(row.get("End Date"), errors="coerce")
    if not phases.empty:
        ps_ph = phases["Planned Start"].min()
        pe_ph = phases["Planned End"].max()
        if pd.notna(ps_ph): ps = min(ps, ps_ph) if pd.notna(ps) else ps_ph
        if pd.notna(pe_ph): pe = max(pe, pe_ph) if pd.notna(pe) else pe_ph
        as_ = phases["Actual Start"].min()
        ae_ = phases["Actual End"].max()
    else:
        as_ = pd.NaT
        ae_ = pd.NaT
    # fall back actual end to today if in progress
    return ps, pe, as_, ae_


if view_mode.startswith("Portfolio"):
    st.markdown("#### 🗂️ Grouped Portfolio Timeline")
    _tl_view = render_view_selector(key="timeline_page_view", default="Portfolio View")
    render_bucket_timelines(view, data, _tl_view, key_prefix="tl_page")


# ---- Single-project swim lane -------------------------------------------
else:
    proj_name = st.selectbox("Project", view["Project Name"].astype(str).tolist())
    prow = view[view["Project Name"] == proj_name].iloc[0]
    pid = str(prow["Project ID"])
    phases = project_phase_summary(pid, phase_df)
    rl = rollups.get(pid, {})
    if phases.empty:
        st.info("No phase data yet — head to **Phase Financials** for this project.")
    else:
        fig = go.Figure()
        for _, ph in phases.iterrows():
            # Planned bar
            if pd.notna(ph["Planned Start"]) and pd.notna(ph["Planned End"]):
                fig.add_trace(go.Bar(
                    x=[(ph["Planned End"] - ph["Planned Start"]).total_seconds() * 1000],
                    y=[ph["Stage"]], base=ph["Planned Start"], orientation="h",
                    marker=dict(color="rgba(148,163,184,0.35)",
                                line=dict(color="rgba(148,163,184,0.7)", width=1)),
                    name="Planned", showlegend=False,
                    hovertemplate=(f"<b>{ph['Stage']}</b> — Planned<br>"
                                   f"{ph['Planned Start']:%d %b %Y} → "
                                   f"{ph['Planned End']:%d %b %Y}<br>"
                                   f"Budget: ${ph['Phase Budget']:,.0f}"
                                   "<extra></extra>"),
                ))
            # Actual bar
            as_ = ph["Actual Start"]
            ae_ = ph["Actual End"] if pd.notna(ph["Actual End"]) else (today if pd.notna(as_) else pd.NaT)
            if pd.notna(as_) and pd.notna(ae_):
                col = RAG_HEX.get(ph["Health"], "#3b82f6")
                fig.add_trace(go.Bar(
                    x=[(ae_ - as_).total_seconds() * 1000],
                    y=[ph["Stage"]], base=as_, orientation="h", width=0.45,
                    marker=dict(color=col, line=dict(color="white", width=1)),
                    name="Actual", showlegend=False,
                    hovertemplate=(f"<b>{ph['Stage']}</b> — Actual<br>"
                                   f"{as_:%d %b %Y} → {ae_:%d %b %Y}<br>"
                                   f"Actual $: ${ph['Phase Actual Spend']:,.0f}<br>"
                                   f"Remaining: ${ph['Remaining']:,.0f}<br>"
                                   f"Schedule Var: {int(ph['Schedule Var (days)']) if pd.notna(ph['Schedule Var (days)']) else '—'}d<br>"
                                   f"Health: {ph['Health']}"
                                   "<extra></extra>"),
                ))
        fig.add_vline(x=today, line=dict(color="#ef4444", dash="dash", width=2),
                      annotation_text="Today", annotation_position="top")
        fig.update_layout(barmode="overlay",
                          title=f"{proj_name} — stage-gate swim lane",
                          **plotly_layout(height=max(320, 42 * len(phases) + 140)))
        fig.update_yaxes(autorange="reversed")
        fig.update_xaxes(type="date")
        st.plotly_chart(fig, use_container_width=True,
                        config={"displayModeBar": False})

        st.markdown(
            "**Project health:** " +
            rag_chip(rl.get("Schedule Health", "Green"), f"Schedule · {rl.get('Schedule Health','—')}") +
            " &nbsp; " +
            rag_chip(rl.get("Financial Health", "Green"), f"Financial · {rl.get('Financial Health','—')}") +
            " &nbsp; " +
            rag_chip(rl.get("Health", "Green"), f"Overall · {rl.get('Health','—')}"),
            unsafe_allow_html=True,
        )

st.divider()

# ---- Quick shift ---------------------------------------------------------
st.markdown("### ⚡ Quick shift project dates")
qs1, qs2, qs3, qs4 = st.columns([2, 1, 1, 1])
pid_opts = view["Project ID"].astype(str) + " · " + view["Project Name"].astype(str)
qpick = qs1.selectbox("Project", pid_opts.tolist() if not view.empty else [])
days = qs2.number_input("Shift by (days)", value=7, step=1)
target = qs3.selectbox("Apply to", ["Both", "Start Date", "End Date"])
apply = qs4.button("Apply shift", use_container_width=True)
if apply and qpick:
    pid = qpick.split(" · ")[0]
    mask = projects["Project ID"].astype(str) == pid
    if target in ("Both", "Start Date"):
        projects.loc[mask, "Start Date"] = projects.loc[mask, "Start Date"] + timedelta(days=int(days))
    if target in ("Both", "End Date"):
        projects.loc[mask, "End Date"] = projects.loc[mask, "End Date"] + timedelta(days=int(days))
    try:
        write_sheet("Projects", projects)
        st.success(f"Shifted {target.lower()} for {pid} by {days} days.")
        st.rerun()
    except Exception as e:
        st.error(f"Save failed: {e}")

# ---- Inline editor -------------------------------------------------------
st.markdown("### ✏️ Edit project dates (inline)")
edit_cols = [c for c in ("Project ID", "Project Name", "Program", "Sponsor",
                         "Status", "RAG", "Start Date", "End Date") if c in view.columns]
editable = view[edit_cols].copy().reset_index(drop=True)

edited = st.data_editor(
    editable, use_container_width=True, hide_index=True, num_rows="fixed",
    column_config={
        "Project ID":   st.column_config.TextColumn(disabled=True),
        "Project Name": st.column_config.TextColumn(disabled=True),
        "Start Date":   st.column_config.DateColumn(format="YYYY-MM-DD"),
        "End Date":     st.column_config.DateColumn(format="YYYY-MM-DD"),
    },
    key="timeline_editor",
)

if st.button("💾 Save date changes", type="primary"):
    try:
        merged = projects.copy()
        merged["Project ID"] = merged["Project ID"].astype(str)
        edited["Project ID"] = edited["Project ID"].astype(str)
        upd = edited.set_index("Project ID")[["Start Date", "End Date"]]
        for pid, row in upd.iterrows():
            m = merged["Project ID"] == pid
            merged.loc[m, "Start Date"] = pd.to_datetime(row["Start Date"], errors="coerce")
            merged.loc[m, "End Date"]   = pd.to_datetime(row["End Date"], errors="coerce")
        write_sheet("Projects", merged)
        st.success("Saved. Other tabs will reflect on next load.")
        st.rerun()
    except Exception as e:
        st.error(f"Save failed: {e}")

st.caption("Phase-level dates and $ live on the **Phase Financials** tab and "
           "roll up here + into Programs and the Executive Dashboard automatically.")
