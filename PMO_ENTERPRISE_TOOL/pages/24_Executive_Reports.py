"""Executive Reports — pre-built exports."""
from __future__ import annotations
import pandas as pd
import streamlit as st
from utils import auth as _auth; _auth.login_gate()

from utils.excel_loader import load_all
from utils.theme_manager import apply_theme, render_sheet
from utils.portfolio_engine import segment_summary, compute_project_health

apply_theme()

st.title("📑 Executive Reports")
st.caption("One-click report packs across portfolio, financials, gates, benefits, decisions, actions.")

data = load_all()
proj = data.get("projects", pd.DataFrame())
sg   = data.get("stagegates", pd.DataFrame())
fin  = data.get("financials", pd.DataFrame())
ben  = data.get("benefits", pd.DataFrame())
cb   = data.get("costbenefit", pd.DataFrame())
dec  = data.get("decisions", pd.DataFrame())
act  = data.get("actions", pd.DataFrame())

reports = {
    "Portfolio Health": compute_project_health(proj, sg)[[
        c for c in ["Project ID","Project Name","Portfolio Category","Sponsor",
                    "Overall RAG","Schedule Health","Financial Health",
                    "Delivery Health","Benefit Health"]
        if c in compute_project_health(proj, sg).columns]] if not proj.empty else pd.DataFrame(),
    "Financial Summary": fin,
    "Stage Gate Compliance": sg,
    "Benefits Realisation": ben,
    "CAPEX Report": cb[cb["CAPEX"] > 0] if not cb.empty else pd.DataFrame(),
    "Unfunded Demand": proj[proj.get("Portfolio Category","")=="Unfunded"] if not proj.empty else pd.DataFrame(),
    "Decision Register": dec,
    "Action Tracker": act,
}

tabs = st.tabs(list(reports.keys()))
for tab, (name, df) in zip(tabs, reports.items()):
    with tab:
        if df is None or df.empty:
            st.info(f"No data for {name}.")
            continue
        st.markdown(f"#### {name} — {len(df)} rows")
        render_sheet(df)
        st.download_button(f"⬇️ Download {name} CSV",
                           df.to_csv(index=False).encode("utf-8"),
                           file_name=f"{name.lower().replace(' ','_')}.csv",
                           mime="text/csv", key=f"dl_{name}")
