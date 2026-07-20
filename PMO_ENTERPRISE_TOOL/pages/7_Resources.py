import streamlit as st
from utils import auth as _auth; _auth.login_gate()
from utils.theme import apply_theme
apply_theme()
from utils.excel_loader import load_all
from utils.tab_builders import build_resources
from utils.exporters import render_export_buttons

st.title("👥 Resource Capacity & Skill Intelligence")

bundle = build_resources(load_all())
if bundle["kpis"]:
    k = st.columns(len(bundle["kpis"]))
    for col,(l,v) in zip(k, bundle["kpis"]): col.metric(l, v)
for _, fig in bundle["figs"]: st.plotly_chart(fig, use_container_width=True)
for name, df in bundle["tables"]:
    st.markdown(f"### {name}")
    st.dataframe(df, use_container_width=True, hide_index=True)
render_export_buttons(bundle)
