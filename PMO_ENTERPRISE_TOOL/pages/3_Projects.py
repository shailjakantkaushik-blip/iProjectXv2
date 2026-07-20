import streamlit as st
from utils import auth as _auth; _auth.login_gate()
from utils.theme_manager import apply_theme, render_sheet
from utils.excel_loader import load_all
from utils.tab_builders import build_projects
from utils.exporters import render_export_buttons
from utils.fy_filter import fy_filter, apply_fy_filter

apply_theme()
st.title("📁 Project Register")

data = load_all()

# Financial Year filter
c1, _ = st.columns([2, 6])
with c1:
    fy_sel = fy_filter(key="fy_filter_projects", label="Financial Year")
if fy_sel:
    data = dict(data)
    data["projects"] = apply_fy_filter(data.get("projects"), fy_sel)

bundle = build_projects(data)
k = st.columns(len(bundle["kpis"]))
for col,(l,v) in zip(k, bundle["kpis"]): col.metric(l, v)
r = st.columns(len(bundle["figs"]) or 1)
for col,(name,fig) in zip(r, bundle["figs"]): col.plotly_chart(fig, use_container_width=True)

# Sheet view — use the merged register from the bundle so the Current Phase,
# Gate Status, Next Gate and Checklist % columns are visible per row.
register_df = bundle["tables"][0][1]
front = [c for c in ["Project ID", "Project Name", "Program", "Sponsor",
                     "Priority", "Status", "RAG",
                     "Current Phase", "Gate Status", "Next Gate",
                     "Checklist Complete %"] if c in register_df.columns]
ordered = front + [c for c in register_df.columns if c not in front]
render_sheet(register_df[ordered])
render_export_buttons(bundle)

