"""11 · Cost vs Benefit — pictorial 5-year ROI view across the portfolio."""
import streamlit as st
from utils import auth as _auth; _auth.login_gate()
from utils.theme_manager import apply_theme
from utils.excel_loader import load_all
from utils.tab_builders import build_costbenefit
from utils.exporters import render_export_buttons

apply_theme()

data = load_all()
bundle = build_costbenefit(data)

# Header + filters
st.markdown("<div class='section-frame'>", unsafe_allow_html=True)
st.markdown(f"### 💹 {bundle['title']}")
st.caption(bundle["subtitle"])
st.markdown("</div>", unsafe_allow_html=True)

if not bundle["kpis"]:
    st.warning("No `CostBenefit` sheet found in the active Excel file. "
               "Re-run `python generate_master.py` or add a **CostBenefit** sheet "
               "with columns: Project ID, Project Name, Program, Year, CAPEX, OPEX, "
               "Benefit Recurring, Benefit One-Off, Benefit Type, Benefit Category, "
               "Confidence %.")
    st.stop()

# KPI strip
st.markdown("<div class='section-frame'>"
            "<div class='section-title'>ROI Summary</div>", unsafe_allow_html=True)
cols = st.columns(len(bundle["kpis"]))
for col, (lbl, val) in zip(cols, bundle["kpis"]):
    col.markdown(
        f"<div class='kpi-card'><div class='kpi-label'>{lbl}</div>"
        f"<div class='kpi-value'>{val}</div></div>", unsafe_allow_html=True)
st.markdown("</div>", unsafe_allow_html=True)

# Charts — 2 per row, big and graphical
figs = bundle["figs"]
st.markdown("<div class='section-frame'>"
            "<div class='section-title'>Cost vs Benefit Visuals</div>", unsafe_allow_html=True)
for i in range(0, len(figs), 2):
    row = st.columns(2)
    for col, (name, fig) in zip(row, figs[i:i+2]):
        col.plotly_chart(fig, use_container_width=True,
                         config={"displayModeBar": False})
st.markdown("</div>", unsafe_allow_html=True)

# Per-project table
for name, df in bundle["tables"]:
    st.markdown(f"<div class='section-frame'>"
                f"<div class='section-title'>{name}</div>", unsafe_allow_html=True)
    st.dataframe(df, use_container_width=True, hide_index=True, height=320)
    st.markdown("</div>", unsafe_allow_html=True)

render_export_buttons(bundle)
