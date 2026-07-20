"""27 · Programs — program-level budgets & rollup of mapped projects."""
from __future__ import annotations
import pandas as pd
import streamlit as st
from utils import auth as _auth; _auth.login_gate()
import plotly.express as px

from utils.theme_manager import apply_theme, render_sheet, plotly_layout
from utils.excel_loader import load_all
from utils.data_io import write_sheet

apply_theme()
st.title("🏛️ Programs — Budget & Rollup")

data = load_all()
programs = data.get("programs", pd.DataFrame()).copy()
projects = data.get("projects", pd.DataFrame()).copy()
phase_df = data.get("phasefinancials", pd.DataFrame()).copy()

if "Program" not in programs.columns:
    programs = pd.DataFrame(columns=["Program","Owner","Sponsor","Budget","Forecast",
                                     "Start FY","End FY","Status","Notes"])

# ---- Rollup: prefer phase-level actuals, fall back to project totals ----
from utils.health import project_rollup, rag_chip

def _num(df, col):
    return pd.to_numeric(df.get(col, 0), errors="coerce").fillna(0)

roll_rows = []
if not projects.empty and "Program" in projects.columns:
    for prog, grp in projects.groupby(projects["Program"].astype(str), dropna=False):
        r_list = [project_rollup(r, phase_df) for _, r in grp.iterrows()]
        approved = _num(grp, "Approved Funding").sum() if "Approved Funding" in grp.columns else _num(grp, "Budget").sum()
        roll_rows.append({
            "Program": prog,
            "# Projects": len(grp),
            "Approved Funding (Projects)": approved,
            "Actual Spend (Projects)":     sum(r["Actual"] for r in r_list),
            "Forecast at Completion (Projects)": sum(r["Forecast"] for r in r_list),
            "Behind Schedule":             sum(1 for r in r_list if r["Schedule Health"] == "Red"),
            "Over Budget":                 sum(1 for r in r_list if r["Financial Health"] == "Red"),
        })
proj_roll = pd.DataFrame(roll_rows) if roll_rows else pd.DataFrame(
    columns=["Program","# Projects","Approved Funding (Projects)",
             "Actual Spend (Projects)","Forecast at Completion (Projects)",
             "Behind Schedule","Over Budget"])

merged = programs.merge(proj_roll, on="Program", how="outer")
for c in ["Budget","Forecast","Approved Funding (Projects)","Actual Spend (Projects)",
          "Forecast at Completion (Projects)","# Projects","Behind Schedule","Over Budget"]:
    if c in merged.columns:
        merged[c] = pd.to_numeric(merged[c], errors="coerce").fillna(0)

merged["Committed vs Program Budget"] = merged["Budget"] - merged["Approved Funding (Projects)"]
merged["Remaining Budget"]            = merged["Budget"] - merged["Actual Spend (Projects)"]
merged["Forecast Variance"]           = merged["Budget"] - merged["Forecast at Completion (Projects)"]
merged["Utilisation %"]               = (merged["Actual Spend (Projects)"] /
                                          merged["Budget"].replace(0, pd.NA) * 100).fillna(0).round(1)

# ---- KPIs ----
k = st.columns(5)
k[0].metric("Programs", f"{len(merged):,}")
k[1].metric("Total Program Budget",   f"${merged['Budget'].sum()/1e6:.2f}M")
k[2].metric("Committed to Projects",  f"${merged['Approved Funding (Projects)'].sum()/1e6:.2f}M")
k[3].metric("Actual Spend",           f"${merged['Actual Spend (Projects)'].sum()/1e6:.2f}M")
k[4].metric("Remaining",              f"${merged['Remaining Budget'].sum()/1e6:.2f}M")

# ---- Charts ----
if not merged.empty:
    c1, c2 = st.columns(2)
    with c1:
        fig = px.bar(merged, x="Program",
                     y=["Budget","Approved Funding (Projects)","Actual Spend (Projects)"],
                     barmode="group", title="Program Budget vs Committed vs Actual")
        fig.update_layout(**plotly_layout(height=360))
        st.plotly_chart(fig, use_container_width=True)
    with c2:
        fig2 = px.bar(merged.sort_values("Remaining Budget"), x="Remaining Budget", y="Program",
                      orientation="h", title="Remaining Program Budget",
                      color="Remaining Budget", color_continuous_scale="RdYlGn")
        fig2.update_layout(**plotly_layout(height=360))
        st.plotly_chart(fig2, use_container_width=True)

    # Waterfall: Budget → Committed → Actual → Remaining (portfolio total)
    import plotly.graph_objects as go
    tot_budget    = merged["Budget"].sum()
    tot_committed = merged["Forecast at Completion (Projects)"].sum() or merged["Approved Funding (Projects)"].sum()
    tot_actual    = merged["Actual Spend (Projects)"].sum()
    tot_remaining = tot_budget - tot_actual
    wf = go.Figure(go.Waterfall(
        name="Portfolio",
        orientation="v",
        measure=["absolute", "relative", "relative", "total"],
        x=["Program Budget", "Committed (Forecast)", "Actual Spend", "Remaining"],
        y=[tot_budget, -(tot_budget - tot_committed), -(tot_committed - tot_actual), tot_remaining],
        text=[f"${v/1e6:.2f}M" for v in [tot_budget, tot_committed, tot_actual, tot_remaining]],
        textposition="outside",
        connector={"line": {"color": "rgba(148,163,184,0.5)"}},
        increasing={"marker": {"color": "#22c55e"}},
        decreasing={"marker": {"color": "#f59e0b"}},
        totals={"marker": {"color": "#3b82f6"}},
    ))
    wf.update_layout(title="Portfolio waterfall — Budget → Committed → Actual → Remaining",
                     **plotly_layout(height=360))
    st.plotly_chart(wf, use_container_width=True)

st.markdown("### 📊 Program Rollup")
show_cols = ["Program","Owner","Sponsor","Status","Start FY","End FY",
             "Budget","Forecast","Approved Funding (Projects)","Actual Spend (Projects)",
             "Forecast at Completion (Projects)","Committed vs Program Budget",
             "Remaining Budget","Forecast Variance","Utilisation %","# Projects","Notes"]
show_cols = [c for c in show_cols if c in merged.columns]
render_sheet(merged[show_cols])

# ---- Program detail: mapped projects ----
st.markdown("### 🔎 Program Detail")
prog_names = sorted([p for p in merged["Program"].astype(str).unique() if p and p != "nan"])
if prog_names:
    sel = st.selectbox("Select program", prog_names)
    prow = merged[merged["Program"].astype(str) == sel].iloc[0]
    d = st.columns(4)
    d[0].metric("Program Budget", f"${float(prow.get('Budget',0))/1e6:.2f}M")
    d[1].metric("Committed",      f"${float(prow.get('Approved Funding (Projects)',0))/1e6:.2f}M")
    d[2].metric("Actual Spend",   f"${float(prow.get('Actual Spend (Projects)',0))/1e6:.2f}M")
    d[3].metric("Remaining",      f"${float(prow.get('Remaining Budget',0))/1e6:.2f}M",
                delta=f"{float(prow.get('Utilisation %',0)):.1f}% used")

    if not projects.empty and "Program" in projects.columns:
        proj_view = projects[projects["Program"].astype(str) == sel]
        keep = [c for c in ["Project ID","Project Name","Sponsor","Status","RAG",
                            "Approved Funding","Actual Spend","Forecast At Completion",
                            "Start Date","End Date"] if c in proj_view.columns]
        if not proj_view.empty and keep:
            st.caption(f"Projects mapped to **{sel}**")
            render_sheet(proj_view[keep])
        else:
            st.info("No projects mapped to this program yet.")

# ---- Editor ----
st.markdown("### ✏️ Edit Program Budgets")
edit_cols = ["Program","Owner","Sponsor","Budget","Forecast","Start FY","End FY","Status","Notes"]
base = programs[edit_cols] if set(edit_cols).issubset(programs.columns) else programs.reindex(columns=edit_cols)
edited = st.data_editor(base, num_rows="dynamic", use_container_width=True, key="programs_editor")
if st.button("💾 Save program budgets"):
    try:
        write_sheet("Programs", edited.fillna(""))
        st.success("Saved. Refresh the page to see rollup update.")
    except Exception as e:
        st.error(f"Save failed: {e}")
