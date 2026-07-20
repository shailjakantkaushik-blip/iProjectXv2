"""Portfolio Movements — reclassify projects between categories with audit trail."""
from __future__ import annotations
from datetime import datetime
import pandas as pd
import streamlit as st
from utils import auth as _auth; _auth.login_gate()

from utils.excel_loader import load_all
from utils.theme_manager import apply_theme, render_sheet
from utils.data_io import write_sheet, update_row, append_row
from config import PORTFOLIO_CATEGORIES

apply_theme()

st.title("🔁 Portfolio Movements")
st.caption("Re-classify initiatives between portfolio buckets. Every change is recorded.")

data = load_all()
proj = data.get("projects", pd.DataFrame())
mv   = data.get("portfoliomovements", pd.DataFrame())

if proj.empty:
    st.warning("Projects sheet is empty."); st.stop()

st.markdown("### Move a project")
with st.form("move"):
    c1, c2, c3 = st.columns(3)
    pid = c1.selectbox("Project", proj["Project Name"].tolist())
    p_row = proj[proj["Project Name"] == pid].iloc[0]
    old_cat = p_row.get("Portfolio Category", "")
    c2.text_input("Current category", value=str(old_cat), disabled=True)
    new_cat = c3.selectbox("Move to category", PORTFOLIO_CATEGORIES,
                           index=max(0, PORTFOLIO_CATEGORIES.index(old_cat))
                                 if old_cat in PORTFOLIO_CATEGORIES else 0)
    user = st.text_input("Your name / user", value="admin")
    reason = st.text_area("Reason for movement")
    submit = st.form_submit_button("Move project", type="primary")
    if submit:
        if new_cat == old_cat:
            st.warning("Already in that category.")
        else:
            # update Projects
            update_row("Projects", "Project ID", p_row["Project ID"],
                       {"Portfolio Category": new_cat})
            # append movement
            mv_id = f"MV{(len(mv)+1):03d}"
            append_row("PortfolioMovements", {
                "Movement ID":  mv_id,
                "Project ID":   p_row["Project ID"],
                "Project Name": p_row["Project Name"],
                "From Category": old_cat,
                "To Category":   new_cat,
                "Moved By":      user,
                "Moved On":      datetime.now(),
                "Reason":        reason,
            })
            st.success(f"Moved {pid} from {old_cat} → {new_cat}.")
            st.rerun()

st.markdown("### Movement history")
if mv.empty:
    st.info("No movements recorded yet.")
else:
    render_sheet(mv.sort_values("Moved On", ascending=False))
