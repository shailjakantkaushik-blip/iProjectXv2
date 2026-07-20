"""Benefits Realisation Management."""
from __future__ import annotations
import pandas as pd
import streamlit as st
from utils import auth as _auth; _auth.login_gate()
import plotly.express as px

from utils.excel_loader import load_all
from utils.theme_manager import apply_theme, render_sheet, plotly_layout
from utils.data_io import write_sheet

apply_theme()

st.title("💎 Benefits Realisation")
st.caption("Track target vs realised benefits across the portfolio.")

data = load_all()
ben  = data.get("benefits", pd.DataFrame())

if ben.empty:
    st.warning("Benefits sheet is empty."); st.stop()

target   = pd.to_numeric(ben.get("Target Value"), errors="coerce").fillna(0).sum()
realised = pd.to_numeric(ben.get("Realised Value"), errors="coerce").fillna(0).sum()
remaining= target - realised
rate     = round(100*realised/target,1) if target else 0

c = st.columns(4)
for col,(l,v) in zip(c, [("Target",f"${target/1e6:.2f}M"),("Realised",f"${realised/1e6:.2f}M"),
                         ("Remaining",f"${remaining/1e6:.2f}M"),("Realisation %",f"{rate}%")]):
    col.markdown(f"<div class='kpi-card'><div class='kpi-label'>{l}</div><div class='kpi-value'>{v}</div></div>",
                 unsafe_allow_html=True)

c1, c2 = st.columns(2)
with c1:
    bcat = (ben.groupby("Category")[["Target Value","Realised Value"]].sum()
            .reset_index().melt(id_vars="Category", var_name="Type", value_name="Value"))
    fig = px.bar(bcat, x="Category", y="Value", color="Type", barmode="group",
                 title="Target vs Realised by Category")
    fig.update_layout(**plotly_layout(height=340))
    st.plotly_chart(fig, use_container_width=True)
with c2:
    s = ben.get("Status","").astype(str).value_counts().reset_index()
    s.columns = ["Status","Count"]
    fig = px.pie(s, names="Status", values="Count", hole=0.45, title="Benefit Status")
    fig.update_layout(**plotly_layout(height=340))
    st.plotly_chart(fig, use_container_width=True)

st.markdown("### Edit the Benefits register")
edit = st.data_editor(ben, num_rows="dynamic", use_container_width=True, key="ben_editor")
if st.button("💾 Save to Excel"):
    write_sheet("Benefits", edit)
    st.success("Saved. Refresh data to recompute formulas.")
