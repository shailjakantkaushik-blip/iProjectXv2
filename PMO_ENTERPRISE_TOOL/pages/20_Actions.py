"""Executive Action Tracker with CRUD."""
from __future__ import annotations
import pandas as pd
import streamlit as st
from utils import auth as _auth; _auth.login_gate()
import plotly.express as px

from utils.excel_loader import load_all
from utils.theme_manager import apply_theme, render_sheet, plotly_layout
from utils.data_io import write_sheet

apply_theme()

st.title("✅ Executive Action Tracker")
st.caption("Owner-accountable actions with due dates, priority and status.")

data = load_all()
act  = data.get("actions", pd.DataFrame())

if act.empty:
    st.warning("Actions sheet is empty."); st.stop()

today = pd.Timestamp.today().normalize()
due = pd.to_datetime(act.get("Due Date"), errors="coerce")
status = act.get("Status","").astype(str)
overdue = ((due < today) & (status != "Complete")).sum() + (status == "Overdue").sum()
open_ = (status == "Open").sum()
inprog= (status == "In Progress").sum()
done  = (status == "Complete").sum()

c = st.columns(4)
for col,(l,v) in zip(c, [("Open",open_),("In Progress",inprog),
                         ("Overdue",overdue),("Complete",done)]):
    col.markdown(f"<div class='kpi-card'><div class='kpi-label'>{l}</div><div class='kpi-value'>{v}</div></div>",
                 unsafe_allow_html=True)

dist = status.value_counts().reset_index()
dist.columns = ["Status","Count"]
fig = px.bar(dist, x="Status", y="Count", color="Status", title="Action status")
fig.update_layout(**plotly_layout(height=300))
st.plotly_chart(fig, use_container_width=True)

st.markdown("### Overdue actions")
od = act[((due < today) & (status != "Complete")).values | (status == "Overdue").values]
render_sheet(od) if not od.empty else st.success("No overdue actions.")

st.markdown("### ✏️ Edit actions")
edit = st.data_editor(act, num_rows="dynamic", use_container_width=True, key="act_editor")
if st.button("💾 Save actions"):
    write_sheet("Actions", edit)
    st.success("Saved.")
