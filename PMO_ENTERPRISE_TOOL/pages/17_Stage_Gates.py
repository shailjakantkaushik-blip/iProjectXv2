"""Stage Gate Management — current/next gates, compliance, overdue analytics."""
from __future__ import annotations
import pandas as pd
import streamlit as st
from utils import auth as _auth; _auth.login_gate()
import plotly.express as px

from utils.excel_loader import load_all
from utils.theme_manager import apply_theme, render_sheet, plotly_layout

apply_theme()

st.title("🚦 Stage Gate Management")
st.caption("Current stage, next gate, compliance % and overdue gates per project.")

data = load_all()
gov = data.get("governance", pd.DataFrame())
sg  = data.get("stagegates", pd.DataFrame())
proj= data.get("projects",   pd.DataFrame())

if gov.empty:
    st.warning("Governance sheet is empty."); st.stop()

# KPIs
today = pd.Timestamp.today().normalize()
total = len(gov)
approved = (gov.get("Gate Status","").astype(str) == "Approved").sum()
pending  = (gov.get("Gate Status","").astype(str).isin(["Pending Approval","In Progress"])).sum()
rejected = (gov.get("Gate Status","").astype(str) == "Rejected").sum()
overdue = 0
if not sg.empty and "Planned Gate Date" in sg.columns:
    d = pd.to_datetime(sg["Planned Gate Date"], errors="coerce")
    overdue = int(((d < today) & (sg.get("Status","").astype(str) != "Complete")).sum())
compliance = round(100*approved/total,1) if total else 0

cols = st.columns(5)
for c, (l, v) in zip(cols, [
    ("Total Gates", total), ("Approved", approved), ("Pending", pending),
    ("Rejected", rejected), ("Compliance %", f"{compliance}%"),
]):
    c.markdown(f"<div class='kpi-card'><div class='kpi-label'>{l}</div><div class='kpi-value'>{v}</div></div>",
               unsafe_allow_html=True)

st.markdown("### Gate status distribution")
dist = gov.get("Gate Status","").astype(str).value_counts().reset_index()
dist.columns = ["Status","Count"]
fig = px.pie(dist, names="Status", values="Count", hole=0.45,
             title="Gate Status Mix")
fig.update_layout(**plotly_layout(height=340))
st.plotly_chart(fig, use_container_width=True)

st.markdown("### Current gates per project")
merged = gov.copy()
if not proj.empty and "Project ID" in proj.columns:
    merged = merged.merge(proj[["Project ID","Project Name"]], on="Project ID", how="left")
show = [c for c in ["Project ID","Project Name","Governance Channel","Stage","Next Gate",
                    "Gate Status","Gate Owner","Planned Gate Date","Actual Gate Date",
                    "Gate Outcome","Checklist Complete %"] if c in merged.columns]
render_sheet(merged[show])

if not sg.empty:
    st.markdown("### Overdue gates")
    sg2 = sg.copy()
    sg2["Planned Gate Date"] = pd.to_datetime(sg2["Planned Gate Date"], errors="coerce")
    od = sg2[(sg2["Planned Gate Date"] < today) & (sg2.get("Status","") != "Complete")]
    if od.empty:
        st.success("No overdue gates 🎉")
    else:
        render_sheet(od[[c for c in ["Project ID","Stage","Planned Gate Date",
                                     "Days Late","Status","Owner"] if c in od.columns]])
