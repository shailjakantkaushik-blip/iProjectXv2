import streamlit as st
from utils import auth as _auth; _auth.login_gate()
from utils.theme import apply_theme
apply_theme()
from utils.excel_loader import load_all
from utils.tab_builders import build_analytics
from utils.exporters import render_export_buttons

st.title("🧠 Strategic Roadmap Analytics + Predictive Risk")

n = st.slider("Monte-Carlo Iterations", 500, 5000, 2000, step=500)
bundle = build_analytics(load_all(), mc_iterations=n)
if bundle["kpis"]:
    k = st.columns(len(bundle["kpis"]))
    for col,(l,v) in zip(k, bundle["kpis"]): col.metric(l, v)
for _, fig in bundle["figs"]: st.plotly_chart(fig, use_container_width=True)
render_export_buttons(bundle)
