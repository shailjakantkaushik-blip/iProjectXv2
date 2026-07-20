"""26 · FY Budget & Forecast Allocation.

Split each project's Budget/Forecast across Financial Years, then explore
portfolio-wide charts and an FY roadmap. Persists to the `FYAllocation`
sheet of the active workbook.
"""
import pandas as pd
import streamlit as st
from utils import auth as _auth; _auth.login_gate()

from utils.theme_manager import apply_theme, render_sheet
from utils.excel_loader import load_all
from utils.exporters import render_export_buttons
from utils.fy_allocation import (
    ALLOC_COLS, load_allocations, save_project_allocation,
    project_budget, project_forecast, default_fy_list,
    kpis, chart_totals_by_fy, chart_project_mix, chart_heatmap,
    chart_waterfall, chart_roadmap, merge_with_projects, fy_sort_key,
)

apply_theme()

st.title("📅 FY Budget & Forecast Allocation")
st.caption("Split each project's total Budget and Forecast across Financial "
           "Years, then track the resulting portfolio profile.")

st.caption("💡 Tip: to auto-populate this sheet from Projects "
           "(and split FY27-28 → 50/50 etc.), open "
           "**⚙️ Configuration → 🔄 Refresh Derived Sheets**.")


data = load_all()
projects = data.get("projects", pd.DataFrame()).copy()
alloc_all = load_allocations()

if projects.empty:
    st.error("No projects loaded — check the master workbook.")
    st.stop()

tab_edit, tab_portfolio, tab_roadmap = st.tabs(
    ["✏️ Allocate", "📊 Portfolio View", "🗺️ Roadmap & Financials"])

# ─────────────────────── Tab 1 — Allocate ───────────────────────
with tab_edit:
    left, right = st.columns([1, 2])
    with left:
        options = projects[["Project ID", "Project Name"]].drop_duplicates()
        options["label"] = options["Project ID"].astype(str) + " · " + \
                           options["Project Name"].astype(str)
        pick = st.selectbox("Project", options["label"].tolist())
        sel = options[options["label"] == pick].iloc[0]
        pid, pname = str(sel["Project ID"]), str(sel["Project Name"])
        prow = projects[projects["Project ID"].astype(str) == pid].iloc[0]
        budget_total = project_budget(prow)
        forecast_total = project_forecast(prow)
        c1, c2 = st.columns(2)
        c1.metric("Total Budget", f"${budget_total:,.0f}")
        c2.metric("Total Forecast", f"${forecast_total:,.0f}")

    with right:
        fy_range = st.multiselect(
            "Financial Years",
            options=default_fy_list(projects, 6) + [f"FY{y}" for y in range(20, 40)],
            default=default_fy_list(projects, 5),
        )
        fy_range = sorted(set(fy_range), key=fy_sort_key)

    # Seed editor from existing allocations for this project
    current = alloc_all[alloc_all["Project ID"].astype(str) == pid]
    seed_rows = []
    for fy in fy_range:
        r = current[current["FY"] == fy]
        seed_rows.append({
            "FY": fy,
            "Budget %": float(r["Budget %"].iloc[0]) if not r.empty else 0.0,
            "Forecast %": float(r["Forecast %"].iloc[0]) if not r.empty else 0.0,
            "Notes": str(r["Notes"].iloc[0]) if not r.empty else "",
        })
    seed_df = pd.DataFrame(seed_rows)

    st.markdown("#### Allocation table (percentages must total 100)")
    a1, a2, a3 = st.columns([1, 1, 1])
    if a1.button("Split evenly", use_container_width=True):
        n = max(1, len(fy_range))
        seed_df["Budget %"] = round(100 / n, 2)
        seed_df["Forecast %"] = round(100 / n, 2)
    if a2.button("Copy Budget % → Forecast %", use_container_width=True):
        seed_df["Forecast %"] = seed_df["Budget %"]
    if a3.button("Clear", use_container_width=True):
        seed_df["Budget %"] = 0.0
        seed_df["Forecast %"] = 0.0

    edited = st.data_editor(
        seed_df, num_rows="fixed", use_container_width=True, hide_index=True,
        column_config={
            "FY": st.column_config.TextColumn(disabled=True),
            "Budget %": st.column_config.NumberColumn(min_value=0, max_value=100,
                                                     step=5, format="%.2f"),
            "Forecast %": st.column_config.NumberColumn(min_value=0, max_value=100,
                                                       step=5, format="%.2f"),
            "Notes": st.column_config.TextColumn(),
        },
        key=f"editor_{pid}",
    )

    b_sum = float(edited["Budget %"].sum()) if not edited.empty else 0
    f_sum = float(edited["Forecast %"].sum()) if not edited.empty else 0
    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Budget % total", f"{b_sum:.1f}%",
              delta=None if abs(b_sum - 100) < 0.01 else f"{b_sum - 100:+.1f}")
    m2.metric("Forecast % total", f"{f_sum:.1f}%",
              delta=None if abs(f_sum - 100) < 0.01 else f"{f_sum - 100:+.1f}")
    m3.metric("Budget $ allocated",
              f"${sum(budget_total * float(r) / 100 for r in edited['Budget %']):,.0f}")
    m4.metric("Forecast $ allocated",
              f"${sum(forecast_total * float(r) / 100 for r in edited['Forecast %']):,.0f}")

    if abs(b_sum - 100) > 0.01 or abs(f_sum - 100) > 0.01:
        st.warning("Budget % and Forecast % should each total 100 before saving.")

    if st.button("💾 Save allocation", type="primary"):
        try:
            save_project_allocation(pid, pname, edited, budget_total,
                                    forecast_total)
            st.success(f"Saved allocation for {pname}.")
            st.rerun()
        except Exception as e:
            st.error(f"Save failed: {e}")

# ─────────────────────── Tab 2 — Portfolio View ───────────────────────
with tab_portfolio:
    if alloc_all.empty:
        st.info("No allocations yet — use the Allocate tab to create one.")
    else:
        merged = merge_with_projects(alloc_all, projects)

        # Filters
        fy_all_p = sorted(merged["FY"].dropna().astype(str).unique().tolist(),
                          key=fy_sort_key)
        f0, f1, f2, f3 = st.columns(4)
        pick_fy = f0.multiselect("Financial Year", fy_all_p, default=fy_all_p,
                                 key="fy_portfolio_pick")
        cats = sorted([c for c in merged.get("Portfolio Category", pd.Series()).dropna().unique() if c])
        gc = sorted([c for c in merged.get("Governance Channel", pd.Series()).dropna().unique() if c])
        sp = sorted([c for c in merged.get("Sponsor", pd.Series()).dropna().unique() if c])
        pick_cat = f1.multiselect("Portfolio Category", cats, default=cats)
        pick_gc = f2.multiselect("Governance Channel", gc, default=gc)
        pick_sp = f3.multiselect("Sponsor", sp, default=sp)

        view = merged.copy()
        if pick_fy: view = view[view["FY"].astype(str).isin(pick_fy)]
        if pick_cat and "Portfolio Category" in view: view = view[view["Portfolio Category"].isin(pick_cat)]
        if pick_gc and "Governance Channel" in view: view = view[view["Governance Channel"].isin(pick_gc)]
        if pick_sp and "Sponsor" in view: view = view[view["Sponsor"].isin(pick_sp)]

        k = kpis(view, projects)
        cols = st.columns(len(k))
        for c, (lbl, val) in zip(cols, k):
            c.markdown(
                f"<div class='kpi-card'><div class='kpi-label'>{lbl}</div>"
                f"<div class='kpi-value'>{val}</div></div>",
                unsafe_allow_html=True)

        figs = [
            ("Budget vs Forecast by FY", chart_totals_by_fy(view)),
            ("Forecast Mix per Project", chart_project_mix(view)),
            ("Forecast Heatmap",         chart_heatmap(view)),
            ("Forecast Waterfall",       chart_waterfall(view)),
        ]
        for i in range(0, len(figs), 2):
            row = st.columns(2)
            for col, (_, fig) in zip(row, figs[i:i+2]):
                col.plotly_chart(fig, use_container_width=True,
                                 config={"displayModeBar": False})

        st.markdown("#### Allocation detail")
        render_sheet(view[[c for c in ALLOC_COLS + ["Portfolio Category",
                          "Governance Channel", "Sponsor", "RAG"] if c in view.columns]])

        render_export_buttons({
            "title": "FY Allocation · Portfolio",
            "subtitle": "Budget & Forecast split across Financial Years",
            "kpis": k,
            "figs": figs,
            "tables": [("Allocations", view)],
        })

# ─────────────────────── Tab 3 — Roadmap & Financials ───────────────────────
with tab_roadmap:
    if alloc_all.empty:
        st.info("No allocations yet — use the Allocate tab to create one, "
                "then return here to see the roadmap and per-project financials.")
    else:
        st.caption(f"Loaded {len(alloc_all)} allocation rows across "
                   f"{alloc_all['Project ID'].nunique()} projects and "
                   f"{alloc_all['FY'].nunique()} FYs.")

        fy_all = sorted(alloc_all["FY"].dropna().astype(str).unique().tolist(),
                        key=fy_sort_key)
        pick_fy = st.multiselect(
            "Financial Years (leave empty to include all)",
            fy_all, default=[], key="fy_roadmap_pick")
        alloc_view = alloc_all[alloc_all["FY"].astype(str).isin(pick_fy)] \
            if pick_fy else alloc_all.copy()

        with st.expander(f"🔎 Raw allocation rows ({len(alloc_view)})", expanded=False):
            st.dataframe(alloc_view, use_container_width=True, hide_index=True)

        if alloc_view.empty:
            st.info("No allocation rows match the current FY selection.")
        else:
            try:
                fig = chart_roadmap(alloc_view, projects)
                st.plotly_chart(fig, use_container_width=True,
                                config={"displayModeBar": False})
            except Exception as e:
                st.warning(f"Could not render roadmap chart: {e}")

        st.markdown("#### Per-project financials")
        merged = merge_with_projects(alloc_view, projects)
        if merged.empty and not alloc_view.empty:
            # Fallback: project metadata missing — still show allocations
            merged = alloc_view.copy()
        if merged.empty:
            st.info("No rows in the current FY selection.")
        else:

            pivot_b = merged.pivot_table(index=["Project ID", "Project Name"],
                                         columns="FY", values="Budget Amount",
                                         aggfunc="sum", fill_value=0)
            pivot_f = merged.pivot_table(index=["Project ID", "Project Name"],
                                         columns="FY", values="Forecast Amount",
                                         aggfunc="sum", fill_value=0)
            fy_cols = sorted(set(list(pivot_b.columns) + list(pivot_f.columns)),
                             key=fy_sort_key)
            pivot_b = pivot_b.reindex(columns=fy_cols, fill_value=0)
            pivot_f = pivot_f.reindex(columns=fy_cols, fill_value=0)

            totals = pd.DataFrame({
                "Total Budget": pivot_b.sum(axis=1),
                "Total Forecast": pivot_f.sum(axis=1),
            })
            totals["Variance"] = totals["Total Forecast"] - totals["Total Budget"]

            meta_cols = [c for c in ("Project ID", "Sponsor", "Portfolio Category",
                                     "Governance Channel", "RAG", "Next Gate")
                         if c in projects.columns]
            left_meta = projects[meta_cols].drop_duplicates("Project ID").copy() \
                if "Project ID" in meta_cols else pd.DataFrame()
            if not left_meta.empty:
                left_meta["Project ID"] = left_meta["Project ID"].astype(str)

            st.markdown("**Budget by FY**")
            render_sheet(pivot_b.reset_index())
            st.markdown("**Forecast by FY**")
            render_sheet(pivot_f.reset_index())
            st.markdown("**Totals & Variance**")
            totals_flat = totals.reset_index()
            totals_flat["Project ID"] = totals_flat["Project ID"].astype(str)
            if not left_meta.empty:
                totals_flat = totals_flat.merge(left_meta, on="Project ID", how="left")
            render_sheet(totals_flat)
