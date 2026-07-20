"""Home hub — Executive Cockpit landing page.
The global sidebar (data source, theme, refresh, PPT export, FY filter) is
rendered once by app.py before every page runs.
"""
import streamlit as st
from utils import auth as _auth; _auth.login_gate()
import pandas as pd
from pathlib import Path

from config import get_master_file
from utils.excel_loader import load_all
from utils.theme_manager import apply_theme, render_sheet
from utils.portfolio_engine import (executive_kpis, segment_summary,
                                    compute_project_health)

apply_theme()



# ───────── main ─────────
master = get_master_file()
if not master.exists():
    st.error(f"Master file missing: {master}")
    st.stop()

data = load_all(str(master))
projects = data.get("projects", pd.DataFrame())
benefits = data.get("benefits", pd.DataFrame())
decisions = data.get("decisions", pd.DataFrame())
actions   = data.get("actions",   pd.DataFrame())
stagegates= data.get("stagegates",pd.DataFrame())

# Financial Year filter is applied by the global sidebar (app.py) — read it.
try:
    from utils.fy_filter import apply_fy_filter
    _fy_sel = st.session_state.get("fy_filter_global") or []
    if _fy_sel:
        projects = apply_fy_filter(projects, _fy_sel)
        benefits = apply_fy_filter(benefits, _fy_sel)
        decisions = apply_fy_filter(decisions, _fy_sel)
        actions = apply_fy_filter(actions, _fy_sel)
        stagegates = apply_fy_filter(stagegates, _fy_sel)
except Exception:
    pass

st.title("📊 Executive Cockpit")
st.caption(f"Live data source: **{master.name}**")

# ───────── KPI cards (18 metrics) ─────────
k = executive_kpis(projects, benefits, decisions, actions, stagegates)

def fmt_money(v):
    if abs(v) >= 1e9: return f"${v/1e9:.2f}B"
    if abs(v) >= 1e6: return f"${v/1e6:.2f}M"
    if abs(v) >= 1e3: return f"${v/1e3:.0f}K"
    return f"${v:,.0f}"

def fmt(label, v):
    if v is None: return "—"
    if "%" in label: return f"{v:.1f}%"
    if any(s in label for s in ("Value","Budget","Funding","Spend","Forecast","Benefits","Remaining")):
        return fmt_money(v)
    return f"{v:,.0f}"

GROUPS = [
    ("FINANCIAL",  ["Total Portfolio Value","Total CAPEX Budget","Total OPEX Budget",
                    "Approved Funding","Actual Spend to Date","Remaining Portfolio Budget",
                    "Forecast At Completion"]),
    ("DELIVERY",   ["Projects On Track (%)","Projects At Risk (%)","Projects Delayed (%)",
                    "Total Strategic Programs","Total CAPEX Programs","Total Unfunded Initiatives"]),
    ("BENEFITS & GOVERNANCE", ["Benefits Forecast","Benefits Realised",
                    "Decisions Awaiting Approval","Overdue Actions","Upcoming Stage Gates"]),
]

for title, keys in GROUPS:
    st.markdown(f"<div class='section-title'>{title}</div>", unsafe_allow_html=True)
    cols = st.columns(len(keys))
    for c, key in zip(cols, keys):
        v = k.get(key, 0)
        c.markdown(
            f"<div class='kpi-card'><div class='kpi-label'>{key}</div>"
            f"<div class='kpi-value'>{fmt(key, v)}</div></div>",
            unsafe_allow_html=True)

st.markdown("---")

# ───────── portfolio segmentation summary ─────────
st.markdown("### 🗂️ Portfolio Segmentation")
seg = segment_summary(projects)
if not seg.empty:
    render_sheet(seg)
else:
    st.info("No projects loaded.")

# ───────── portfolio health snapshot ─────────
st.markdown("### 🚦 Portfolio Health Snapshot")
if not projects.empty:
    health = compute_project_health(projects, stagegates)
    show_cols = [c for c in ["Project ID","Project Name","Portfolio Category",
                             "Governance Channel","Sponsor","Delivery Lead",
                             "Progress %","Schedule Health","Financial Health",
                             "Delivery Health","Benefit Health","Overall RAG"]
                 if c in health.columns]
    render_sheet(health[show_cols].head(40))

# ───────── FY allocation mini view ─────────
try:
    from utils.fy_allocation import (load_allocations, chart_totals_by_fy,
                                     merge_with_projects)
    _alloc = load_allocations()
    if not _alloc.empty:
        st.markdown("### 📅 Budget & Forecast by Financial Year")
        cA, cB = st.columns([2, 1])
        with cA:
            st.plotly_chart(chart_totals_by_fy(_alloc),
                            use_container_width=True,
                            config={"displayModeBar": False})
        with cB:
            n_alloc = _alloc["Project ID"].nunique()
            n_all = projects["Project ID"].nunique() if "Project ID" in projects.columns else 0
            cov = (n_alloc / n_all * 100) if n_all else 0
            st.markdown(
                f"<div class='kpi-card'><div class='kpi-label'>Projects with FY allocation</div>"
                f"<div class='kpi-value'>{n_alloc}/{n_all}</div></div>",
                unsafe_allow_html=True)
            st.markdown(
                f"<div class='kpi-card'><div class='kpi-label'>Allocation coverage</div>"
                f"<div class='kpi-value'>{cov:.0f}%</div></div>",
                unsafe_allow_html=True)
except Exception as _e:
    pass

st.info("👈 Use the sidebar to open Segmentation, Governance Channels, Stage Gates, "
        "Decisions, Actions, Benefits, Prioritisation, Project Infographic, FY Allocation, and more.")
