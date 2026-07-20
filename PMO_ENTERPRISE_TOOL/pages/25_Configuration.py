"""Configuration — single place to manage every dropdown list and rule the
app uses. CRUD all values here; the workbook is updated in place and every
page picks up the new values automatically (Excel is the source of truth).
"""
from __future__ import annotations
import pandas as pd
import streamlit as st
from utils import auth as _auth; _auth.login_gate()
_auth.require_role(['admin'])

from utils.excel_loader import load_all, refresh as data_refresh
from utils.config_loader import refresh as cfg_refresh
from utils.data_io import write_sheet
from utils.theme_manager import apply_theme
from utils.progress import progress

apply_theme()


st.title("⚙️ Configuration — Lists & Rules")
st.caption("Add, edit or delete dropdown values and threshold rules. "
           "Saving writes back to the Excel workbook; the app rereads it "
           "on the next render. **Excel is the source of truth.**")

sheets = load_all().get("_sheets", {})

if "Config" not in sheets or "ConfigRules" not in sheets:
    st.warning("Config / ConfigRules sheets missing. Regenerate the master file "
               "by running `python generate_master.py`.")
    st.stop()

tab_lists, tab_rules, tab_fy, tab_refresh, tab_help = st.tabs(
    ["📋 Lists (dropdowns)", "🧮 Rules (thresholds)", "📅 Fiscal Year",
     "🔄 Refresh Derived Sheets", "ℹ️ How it works"])


# ─────────────────────────── LISTS ───────────────────────────
with tab_lists:
    df = sheets["Config"].copy()
    needed = ["Category","Value","Display Order","Active"]
    for c in needed:
        if c not in df.columns:
            df[c] = True if c == "Active" else (0 if c == "Display Order" else "")
    df = df[needed]
    if "Active" in df.columns:
        df["Active"] = df["Active"].fillna(True).astype(bool)
    df["Display Order"] = pd.to_numeric(df["Display Order"], errors="coerce").fillna(0).astype(int)

    cats = sorted([c for c in df["Category"].dropna().unique().tolist() if str(c).strip()])
    pick = st.selectbox("Filter by Category (or All)", ["All"] + cats, index=0)
    view = df if pick == "All" else df[df["Category"].astype(str) == pick]

    st.markdown("**Edit below. Add rows for new values, untick `Active` to hide.**")
    edited = st.data_editor(
        view.reset_index(drop=True),
        num_rows="dynamic",
        use_container_width=True,
        column_config={
            "Category":      st.column_config.SelectboxColumn(
                "Category", options=cats, required=True) if pick == "All" else
                st.column_config.TextColumn("Category", required=True),
            "Value":         st.column_config.TextColumn("Value", required=True),
            "Display Order": st.column_config.NumberColumn("Order", step=1, min_value=0),
            "Active":        st.column_config.CheckboxColumn("Active"),
        },
        key="cfg_lists_editor",
    )

    c1, c2 = st.columns([1, 4])
    if c1.button("💾 Save Lists", type="primary", use_container_width=True):
        with progress("Saving lists to workbook…", "Config saved. Dropdowns refreshed."):
            if pick == "All":
                new_df = edited.copy()
            else:
                new_df = pd.concat(
                    [df[df["Category"].astype(str) != pick], edited],
                    ignore_index=True,
                )
            new_df = new_df.dropna(subset=["Category","Value"], how="any")
            write_sheet("Config", new_df[needed])
            data_refresh(); cfg_refresh()
        st.rerun()

    with st.expander("➕ Add a brand-new Category"):
        nc1, nc2, nc3 = st.columns([2,2,1])
        new_cat = nc1.text_input("New Category name", key="new_cat_name")
        new_val = nc2.text_input("First value", key="new_cat_val")
        if nc3.button("Create", use_container_width=True) and new_cat and new_val:
            with progress(f"Creating category '{new_cat}'…", f"Created category '{new_cat}'."):
                new_df = pd.concat([df, pd.DataFrame([{
                    "Category": new_cat.strip(), "Value": new_val.strip(),
                    "Display Order": 1, "Active": True,
                }])], ignore_index=True)
                write_sheet("Config", new_df[needed])
                data_refresh(); cfg_refresh()
            st.rerun()

# ─────────────────────────── RULES ───────────────────────────
with tab_rules:
    rdf = sheets["ConfigRules"].copy()
    for c in ["Key","Value","Type","Description"]:
        if c not in rdf.columns:
            rdf[c] = ""
    rdf = rdf[["Key","Value","Type","Description"]]

    st.markdown("**Threshold rules used by the health engine and KPIs.**")
    redited = st.data_editor(
        rdf.reset_index(drop=True),
        num_rows="dynamic",
        use_container_width=True,
        column_config={
            "Key":         st.column_config.TextColumn("Key", required=True,
                              help="Used by code (e.g. SCHEDULE_RED_VARIANCE)"),
            "Value":       st.column_config.TextColumn("Value", required=True),
            "Type":        st.column_config.SelectboxColumn(
                              "Type", options=["int","float","ratio","currency","text","bool"]),
            "Description": st.column_config.TextColumn("Description", width="large"),
        },
        key="cfg_rules_editor",
    )
    if st.button("💾 Save Rules", type="primary"):
        with progress("Saving rules…", "Rules saved. Health engine will use new thresholds."):
            write_sheet("ConfigRules", redited.dropna(subset=["Key"]))
            data_refresh(); cfg_refresh()
        st.rerun()

# ─────────────────────────── FISCAL YEAR ───────────────────────────
with tab_fy:
    from utils.fy_axis import get_fy_start_month, set_fy_start_month, month_name
    st.markdown("### 📅 Financial Year Start")
    st.caption("Controls how every timeline / Gantt across the app labels "
               "quarters (Q1–Q4) and fiscal-year boundaries.")
    cur = get_fy_start_month()
    months = [f"{i:02d} — {month_name(i)}" for i in range(1, 13)]
    pick = st.selectbox("Fiscal year starts in", months, index=cur - 1,
                        key="fy_start_pick")
    new_m = int(pick.split(" — ")[0])
    cA, cB = st.columns([1, 4])
    if cA.button("💾 Save Fiscal Year", type="primary", use_container_width=True):
        with progress("Updating fiscal-year start…",
                      f"FY now starts in {month_name(new_m)}. Reload any page to see updated labels."):
            set_fy_start_month(new_m)
    cB.info(f"Current setting: **{month_name(cur)}**. "
            f"Example — a date in {month_name(((cur-1)+0)%12+1)} falls in **Q1**, "
            f"and {month_name(((cur-1)+3)%12+1)} starts **Q2**.")


# ─────────────────────────── REFRESH ───────────────────────────
with tab_refresh:
    st.markdown("### 🔄 Rebuild derived sheets from Projects")
    st.caption(
        "Re-derive every sheet that depends on the Projects sheet: "
        "**FYAllocation, PhaseFinancials, Programs, StageGates, Financials, "
        "CostBenefit, Releases, Milestones**. Uses each project's Financial "
        "Year (e.g. `FY27-28` → 50% FY27 + 50% FY28), Approved Funding, "
        "CAPEX/OPEX, Governance Channel and Start/End dates."
    )
    st.warning(
        "This **overwrites** existing rows on those sheets. VLOOKUP-driven "
        "columns (Sponsor, Program, etc.) already refresh live in Excel — "
        "you only need this button after changing structural fields like "
        "Financial Year, dates, funding or channel."
    )
    if st.button("🔄 Rebuild all derived sheets now", type="primary"):
        from utils.rebuild_derived import rebuild_all
        counts = {}
        with progress("Rebuilding derived sheets from Projects…",
                      "Derived sheets rebuilt."):
            counts = rebuild_all()
            st.cache_data.clear()
        if not counts:
            st.error("No projects loaded — nothing to rebuild.")
        else:
            st.success("Rebuilt: " + ", ".join(f"**{k}** ({v} rows)" for k, v in counts.items()))

# ─────────────────────────── HELP ───────────────────────────
with tab_help:

    st.markdown("""
### Excel is the source of truth
Every status, stage gate, RAG, priority, sponsor, theme, etc. lives in the
**Config** sheet. Every threshold (schedule/financial RAG breakpoints,
benefit realisation tiers, channel split, upcoming-gate window) lives in
**ConfigRules**. Changing them here writes the workbook on disk and:

- refreshes the in-app cache
- re-applies Excel **data-validation dropdowns** on Projects, Governance,
  StageGates, Risks, Decisions, Actions, Benefits, CostBenefit,
  Dependencies, Resources, Pipeline, Milestones, PortfolioMovements
- feeds the health engine the new numeric thresholds

### Won't this break the app?
No. The app uses **case-insensitive lookups** and tolerant fallbacks — if a
value is missing or new it still renders, it just won't satisfy a specific
filter. Adding new categories and new values is safe. Renaming an
existing category breaks dropdown binding for that field; add the new name
and keep the old until you migrate.

### Tips
- `Display Order` controls dropdown sort order.
- `Active = false` hides a value from dropdowns without deleting history.
- `Type` on rules controls numeric coercion (`ratio` and `currency` become
  floats; `int` becomes integer; `bool` accepts true/false/1/0/yes/no).
""")
