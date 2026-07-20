import streamlit as st
from utils import auth as _auth; _auth.login_gate()
from utils.theme import apply_theme
apply_theme()
from utils.excel_loader import load_all
from utils.tab_builders import build_pipeline
from utils.exporters import render_export_buttons

st.title("💡 Demand Pipeline — Intake Scoring")

bundle = build_pipeline(load_all())
if bundle["kpis"]:
    k = st.columns(len(bundle["kpis"]))
    for col,(l,v) in zip(k, bundle["kpis"]): col.metric(l, v)
for _, fig in bundle["figs"]: st.plotly_chart(fig, use_container_width=True)

st.markdown("### Submit New Idea")
with st.form("new_idea"):
    name = st.text_input("Idea name")
    cc = st.columns(4)
    s = cc[0].slider("Strategic Fit", 1, 5, 3)
    v = cc[1].slider("Value",         1, 5, 3)
    r = cc[2].slider("Risk",          1, 5, 2)
    e = cc[3].slider("Effort",        1, 5, 3)
    if st.form_submit_button("Score"):
        score = round((s*0.3 + v*0.4 - r*0.15 - e*0.15) * 20, 1)
        st.success(f"Priority Score = **{score}** — add to pipeline sheet to persist.")

for name, df in bundle["tables"]:
    st.dataframe(df, use_container_width=True, hide_index=True)
render_export_buttons(bundle)
