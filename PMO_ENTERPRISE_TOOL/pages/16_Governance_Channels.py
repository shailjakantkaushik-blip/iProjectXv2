"""Governance Channels — Channel A (<$200K) and Channel B (>$200K)."""
from __future__ import annotations
import pandas as pd
import streamlit as st
from utils import auth as _auth; _auth.login_gate()
import plotly.express as px

from utils.excel_loader import load_all
from utils.theme_manager import apply_theme, render_sheet, plotly_layout
from config import STAGES_A, STAGES_B

apply_theme()

st.title("🛂 Governance Channels")
st.caption("Channel A = expedite path for initiatives under $200K. "
           "Channel B = standard path with mandatory Full-Funding gate before Build.")

data = load_all()
projects = data.get("projects", pd.DataFrame())
gov      = data.get("governance", pd.DataFrame())

cA, cB = st.columns(2)
with cA:
    st.markdown("#### 🅰️ Channel A — Expedite (<$200K)")
    for s in STAGES_A:
        st.markdown(f"<div class='gov-stage'><div class='gov-stage-head'><span class='gov-dot'>•</span>{s}</div></div>",
                    unsafe_allow_html=True)
with cB:
    st.markdown("#### 🅱️ Channel B — Standard (>$200K)")
    for s in STAGES_B:
        marker = "🔒" if "Full Funding" in s else "•"
        st.markdown(f"<div class='gov-stage'><div class='gov-stage-head'><span class='gov-dot'>{marker}</span>{s}</div></div>",
                    unsafe_allow_html=True)

st.markdown("---")

if projects.empty:
    st.warning("No projects loaded."); st.stop()

st.markdown("### Project distribution by channel")
ch = projects.get("Governance Channel", pd.Series(dtype=str)).astype(str)
dist = ch.value_counts().reset_index()
dist.columns = ["Channel","Projects"]
fig = px.bar(dist, x="Channel", y="Projects", color="Channel",
             title="Projects per Governance Channel")
fig.update_layout(**plotly_layout(height=320))
st.plotly_chart(fig, use_container_width=True)

st.markdown("### Channel A projects")
a = projects[projects.get("Governance Channel","").astype(str).str.startswith("Channel A")]
render_sheet(a[[c for c in ["Project ID","Project Name","Sponsor","Approved Funding",
                            "Progress %","Status","RAG"] if c in a.columns]])

st.markdown("### Channel B projects")
b = projects[projects.get("Governance Channel","").astype(str).str.startswith("Channel B")]
render_sheet(b[[c for c in ["Project ID","Project Name","Sponsor","Approved Funding",
                            "Progress %","Status","RAG"] if c in b.columns]])
