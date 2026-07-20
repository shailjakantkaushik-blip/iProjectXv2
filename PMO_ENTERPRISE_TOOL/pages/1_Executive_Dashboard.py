"""1 · Executive Dashboard — single-screen cockpit with per-tab export."""
import streamlit as st
from utils import auth as _auth; _auth.login_gate()
from utils.excel_loader import load_all
from utils.tab_builders import build_executive
from utils.exporters import render_export_buttons
from utils.theme_manager import apply_theme, render_sheet
from utils.chart_factory import sparkline

apply_theme()

data = load_all()
projects = data["projects"].copy()

# ─────────────────────── Filter bar ───────────────────────
st.markdown("<div class='section-frame'>", unsafe_allow_html=True)
top = st.columns([2, 1, 1, 1, 1, 1])
top[0].markdown("### 📊 PMO Portfolio — Executive Summary")



def opts(col): return ["All"] + sorted(projects[col].dropna().unique().tolist())
prog = top[1].selectbox("Program",  opts("Program"),  label_visibility="collapsed")
spon = top[2].selectbox("Sponsor",  opts("Sponsor"),  label_visibility="collapsed")
prio = top[3].selectbox("Priority", opts("Priority"), label_visibility="collapsed")
stat = top[4].selectbox("Status",   opts("Status"),   label_visibility="collapsed")

from utils.fy_filter import fy_filter, apply_fy_filter
with top[5]:
    fy_sel = fy_filter(key="fy_filter_exec", label="FY")

flt = projects
if prog != "All": flt = flt[flt["Program"] == prog]
if spon != "All": flt = flt[flt["Sponsor"] == spon]
if prio != "All": flt = flt[flt["Priority"] == prio]
if stat != "All": flt = flt[flt["Status"] == stat]
if fy_sel:        flt = apply_fy_filter(flt, fy_sel)
st.markdown("</div>", unsafe_allow_html=True)

bundle = build_executive(data, flt=flt)

# ─────────────────────── KPI row with embedded sparklines ───────────────────────
st.markdown("<div class='section-frame'>"
            "<div class='section-title'>Key Metrics</div>", unsafe_allow_html=True)
trends = bundle.get("trends", {})
TREND_COLORS = {
    "CAPEX Approved": "#3b82f6", "Incurred": "#22c55e",
    "Forecast": "#f59e0b",       "Remaining": "#8b5cf6",
    "Active": "#06b6d4",          "Completed": "#22c55e",
    "Overdue": "#ef4444",         "RAG Score": "#a855f7",
}
cols = st.columns(len(bundle["kpis"]))
for col, (lbl, val) in zip(cols, bundle["kpis"]):
    with col:
        st.markdown(
            f"<div class='kpi-card'>"
            f"<div class='kpi-label'>{lbl}</div>"
            f"<div class='kpi-value'>{val}</div></div>",
            unsafe_allow_html=True)
        series = trends.get(lbl)
        if series:
            spk = sparkline(series, color=TREND_COLORS.get(lbl, "#3b82f6"))
            spk.update_layout(height=42, margin=dict(l=0, r=0, t=0, b=0))
            st.plotly_chart(spk, use_container_width=True,
                            config={"displayModeBar": False})
st.markdown("</div>", unsafe_allow_html=True)

# ─────────────────────── Portfolio Analytics (charts) ───────────────────────
gov_fig = next((f for n, f in bundle["figs"] if n == "Governance Flow"), None)
figs = [(n, f) for (n, f) in bundle["figs"] if n != "Governance Flow"]
st.markdown("<div class='section-frame'>"
            "<div class='section-title'>Portfolio Analytics</div>", unsafe_allow_html=True)
for i in range(0, len(figs), 3):
    row = st.columns(3)
    for col, (name, fig) in zip(row, figs[i:i+3]):
        fig.update_layout(height=240, margin=dict(l=10, r=10, t=35, b=10))
        col.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})
st.markdown("</div>", unsafe_allow_html=True)

# ─────────────────────── Grouped Timeline View (selectable) ───────────────────────
from utils.timeline_views import render_view_selector, render_bucket_timelines, VIEW_OPTIONS

st.markdown("<div class='section-frame'>"
            "<div class='section-title'>Portfolio Timelines</div>",
            unsafe_allow_html=True)
_view = render_view_selector(key="exec_timeline_view", default="Portfolio View")
st.markdown("</div>", unsafe_allow_html=True)
render_bucket_timelines(flt, data, _view, key_prefix="exec_tl")


# ─────────────────────── Governance Flow (only in-progress, exclude Idea) ───────────────────────
if gov_fig is not None:
    import pandas as _pd_gov
    from utils.chart_factory import governance_flow_plotly as _gfp
    _gov = data.get("governance", _pd_gov.DataFrame())
    if isinstance(_gov, _pd_gov.DataFrame) and not _gov.empty:
        _gov_f = _gov.copy()
        # Exclude "Idea" stage
        if "Stage" in _gov_f.columns:
            _gov_f = _gov_f[_gov_f["Stage"].astype(str).str.strip().str.lower() != "idea"]
        # Restrict to projects currently active/in-flight
        if "Project ID" in _gov_f.columns and "Status" in flt.columns:
            _active_ids = flt[flt["Status"].astype(str).str.lower().isin(
                ["active", "in progress", "in-flight", "in flight"])]["Project ID"]
            if len(_active_ids):
                _gov_f = _gov_f[_gov_f["Project ID"].isin(_active_ids)]
        # Further restrict to gates that are actually in progress (not approved/rejected)
        if "Gate Status" in _gov_f.columns:
            _gs = _gov_f["Gate Status"].astype(str).str.strip().str.lower()
            _gov_f = _gov_f[_gs.isin(["pending", "in progress", "in-progress", "in review", "open"])]
        gov_fig = _gfp(_gov_f, projects_df=flt, height=520, max_per_stage=999)

    st.markdown("<div class='section-frame'>"
                "<div class='section-title'>Governance Flow — active projects by current stage</div>",
                unsafe_allow_html=True)
    st.plotly_chart(gov_fig, use_container_width=True,
                    config={"displayModeBar": False})
    st.markdown("</div>", unsafe_allow_html=True)

for name, df in bundle["tables"]:
    st.markdown(f"<div class='section-frame'>"
                f"<div class='section-title'>{name}</div>", unsafe_allow_html=True)
    render_sheet(df, max_rows=200)
    st.markdown("</div>", unsafe_allow_html=True)

render_export_buttons(bundle)

# ─────────────────────── Full Dashboard PDF (bottom of page) ───────────────────────
from datetime import datetime as _dt_pdf
from utils.exporters import executive_dashboard_pdf
from utils.timeline_views import build_bucket_timeline_figs

st.markdown("---")
st.markdown("#### 📘 Full Dashboard PDF — exact replica + expanded project timelines")
st.caption("Multi-page PDF: the entire Executive Dashboard above (KPIs, charts, "
           "governance flow, tables) is reproduced at readable size, followed by "
           "one page per timeline group with every project expanded.")
_pcol1, _pcol2 = st.columns([1, 1])
with _pcol1:
    if st.button("📥 Generate Executive Dashboard PDF", type="primary",
                 use_container_width=True, key="exec_full_pdf_btn"):
        with st.spinner("Rendering full dashboard + all timelines…"):
            try:
                tl_figs = build_bucket_timeline_figs(flt, data, _view)
                pdf_bytes = executive_dashboard_pdf(bundle, tl_figs, view_label=_view)
                st.session_state["_exec_full_pdf"] = pdf_bytes
                st.session_state["_exec_full_pdf_name"] = (
                    f"Executive_Dashboard_{_dt_pdf.now().strftime('%Y%m%d_%H%M%S')}.pdf")
                st.success(f"Ready — {len(tl_figs)} timeline group(s) included.")
            except Exception as e:
                st.error(f"PDF generation failed: {e}")
with _pcol2:
    if st.session_state.get("_exec_full_pdf"):
        st.download_button(
            "⬇️ Download Executive Dashboard PDF",
            data=st.session_state["_exec_full_pdf"],
            file_name=st.session_state.get("_exec_full_pdf_name", "Executive_Dashboard.pdf"),
            mime="application/pdf", use_container_width=True,
            key="exec_full_pdf_dl")



