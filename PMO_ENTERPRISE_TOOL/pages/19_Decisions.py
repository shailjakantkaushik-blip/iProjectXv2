"""Key Decisions Register with CRUD."""
from __future__ import annotations
import pandas as pd
import streamlit as st
from utils import auth as _auth; _auth.login_gate()

from utils.excel_loader import load_all
from utils.theme_manager import apply_theme, render_sheet
from utils.data_io import write_sheet

apply_theme()

st.title("🧭 Key Decisions Register")
st.caption("Project, program, portfolio, funding, architecture, risk and SteerCo decisions.")

data = load_all()
dec  = data.get("decisions", pd.DataFrame())

if dec.empty:
    st.warning("Decisions sheet is empty."); st.stop()

today = pd.Timestamp.today().normalize()
due = pd.to_datetime(dec.get("Due Date"), errors="coerce")
status = dec.get("Status","").astype(str)
overdue = ((due < today) & (~status.isin(["Approved","Rejected","Closed"]))).sum()
awaiting = status.isin(["Open","In Review"]).sum()

c = st.columns(4)
for col,(l,v) in zip(c, [("Total",len(dec)),("Awaiting",awaiting),
                         ("Overdue",overdue),("Approved",(status=="Approved").sum())]):
    col.markdown(f"<div class='kpi-card'><div class='kpi-label'>{l}</div><div class='kpi-value'>{v}</div></div>",
                 unsafe_allow_html=True)

tabs = st.tabs(["All decisions","Overdue","By type"])
with tabs[0]:
    render_sheet(dec)
with tabs[1]:
    od = dec[((due < today) & (~status.isin(["Approved","Rejected","Closed"]))).values]
    if od.empty: st.success("No overdue decisions.")
    else: render_sheet(od)
with tabs[2]:
    for t, df in dec.groupby(dec.get("Type","").astype(str)):
        st.markdown(f"**{t}** — {len(df)}")
        render_sheet(df.head(50))

st.markdown("### ✏️ Edit decisions")
edit = st.data_editor(dec, num_rows="dynamic", use_container_width=True, key="dec_editor")
if st.button("💾 Save decisions"):
    write_sheet("Decisions", edit)
    st.success("Saved.")
