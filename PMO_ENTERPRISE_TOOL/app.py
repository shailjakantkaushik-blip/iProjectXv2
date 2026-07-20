"""PMO Enterprise Tool — entry shell.

Runs the global sidebar (data source, theme, refresh, PPT export, FY filter)
and routes every navigation click through `st.navigation`, collapsing 25+
pages into 5 hubs. Individual page files under pages/ are unchanged — they
just no longer auto-populate the sidebar.

Launch:  streamlit run app.py
"""
from __future__ import annotations
import streamlit as st
from pathlib import Path

from config import (get_master_file, set_master_file, DEFAULT_MASTER_FILE,
                    UPLOAD_DIR)
from utils.excel_loader import refresh
from utils.ppt_export import build_portfolio_ppt
from utils.theme_manager import apply_theme, theme_picker_sidebar
from utils.progress import progress
from utils import auth


st.set_page_config(page_title="PMO Portfolio",
                   page_icon="📊", layout="wide",
                   initial_sidebar_state="expanded")
apply_theme()

# ══════════════════════════ LOGIN GATE ══════════════════════════
# Blocks everything (nav, sidebar, pages) until a user is signed in.
auth.login_gate()

# ══════════════════════════ GLOBAL SIDEBAR ══════════════════════════
st.sidebar.image("https://cdn-icons-png.flaticon.com/512/2103/2103633.png", width=60)
st.sidebar.title("PMO PORTFOLIO")
st.sidebar.caption("ENTERPRISE EDITION")
theme_picker_sidebar()

st.sidebar.markdown("### 📂 Data Source")
current = get_master_file()
st.sidebar.caption(f"Active: `{current.name}`")
with st.sidebar.expander("Change data source", expanded=False):
    new_path = st.text_input("File path", value=str(current),
                             label_visibility="collapsed",
                             help="Point at a SharePoint / OneDrive-synced .xlsx "
                                  "to share the master file across users.")
    if st.button("Use this path", use_container_width=True):
        p = Path(new_path).expanduser()
        if p.exists() and p.suffix.lower() in {".xlsx", ".xlsm"}:
            with progress("Switching data source…", "Data source updated."):
                set_master_file(p); refresh()
            st.rerun()
        else:
            st.error("Invalid file path.")
    up = st.file_uploader("Upload .xlsx", type=["xlsx", "xlsm"],
                          label_visibility="collapsed")
    if up is not None:
        with progress("Uploading workbook…", "Workbook uploaded."):
            dest = UPLOAD_DIR / up.name
            dest.write_bytes(up.getbuffer())
            set_master_file(dest); refresh()
        st.rerun()
    if st.button("↩︎ Reset to bundled sample", use_container_width=True):
        with progress("Resetting to sample…", "Reset to bundled sample."):
            set_master_file(DEFAULT_MASTER_FILE); refresh()
        st.rerun()

st.sidebar.markdown("---")

# Global Financial Year filter — every page reads st.session_state["fy_filter_global"].
try:
    from utils.fy_filter import fy_filter
    st.sidebar.markdown("### 📅 Financial Year")
    _fy = fy_filter(location=st.sidebar, key="fy_filter_global")
    if _fy:
        st.sidebar.caption(f"Filtering to {', '.join(_fy)}")
except Exception:
    pass

st.sidebar.markdown("---")
c1, c2 = st.sidebar.columns(2)
if c1.button("🔄 Refresh", use_container_width=True):
    with progress("Reloading workbook…", "Workbook reloaded."):
        refresh()
    st.rerun()
if c2.button("📤 PPT", use_container_width=True):
    with progress("Building PowerPoint deck…", "Deck ready."):
        path = build_portfolio_ppt()
    with open(path, "rb") as f:
        st.sidebar.download_button("⬇️ Download .pptx", f.read(),
                                   file_name=Path(path).name,
                                   use_container_width=True)


# ══════════════════════════ 5-HUB NAVIGATION ══════════════════════════
P = "pages"

def _page(file: str, title: str, icon: str, default: bool = False):
    """Register a page. Silently skip files that were removed/renamed."""
    if not Path(P, file).exists():
        return None
    return st.Page(f"{P}/{file}", title=title, icon=icon, default=default)

def _group(items):
    return [p for p in items if p is not None]

HOME = _group([
    _page("0_Home.py",              "Executive Cockpit",   "📊", default=True),
    _page("1_Executive_Dashboard.py","Executive Dashboard","🏠"),
    _page("14_Latest_Updates.py",   "Latest Updates",      "🆕"),
    _page("12_About_This_App.py",   "About",               "ℹ️"),
])

PORTFOLIO = _group([
    _page("3_Projects.py",              "Projects",              "📁"),
    _page("27_Programs.py",             "Programs",              "🎯"),
    _page("22_Project_Infographic.py",  "Project Infographic",   "🎨"),
    _page("15_Portfolio_Segmentation.py","Segmentation",         "🗂️"),
    _page("21_Prioritisation.py",       "Prioritisation",        "🏅"),
    _page("23_Portfolio_Movements.py",  "Movements",             "🔀"),
    _page("10_Demand_Pipeline.py",      "Demand Pipeline",       "📥"),
])

DELIVERY = _group([
    _page("28_Timeline.py",             "Timeline",              "📆"),
    _page("6_Roadmap_Governance.py",    "Roadmap × Governance",  "🛤️"),
    _page("17_Stage_Gates.py",          "Stage Gates (Waterfall)","🚦"),
    _page("31_Agile.py",                "Agile / Sprints",       "🏃"),
    _page("16_Governance_Channels.py",  "Governance Channels",   "🛂"),
    _page("9_Dependencies.py",          "Dependencies",          "🔗"),
    _page("7_Resources.py",             "Resources",             "👥"),
    _page("8_Roadmap_Analytics.py",     "Risk Roadmap",          "🧠"),
])

FINANCIALS = _group([
    _page("5_Financials.py",            "Financials",            "💰"),
    _page("26_FY_Allocation.py",        "FY Allocation",         "📅"),
    _page("29_Phase_Financials.py",     "Phase Financials",      "💹"),
    _page("11_Cost_vs_Benefit.py",      "Cost vs Benefit",       "⚖️"),
    _page("18_Benefits.py",             "Benefits",              "🎁"),
])

GOVERNANCE = _group([
    _page("4_Risks.py",                 "Risks",                 "⚠️"),
    _page("19_Decisions.py",            "Decisions",             "🧩"),
    _page("20_Actions.py",              "Actions",               "✅"),
    _page("30_Release_Register.py",     "Release Register",      "🚀"),
    _page("24_Executive_Reports.py",    "Executive Reports",     "📑"),
    # Admin-only pages — hidden from executives, PMs, and BU leads.
    _page("13_Data_Editor.py",          "Data Editor",           "✏️") if auth.is_admin() else None,
    _page("25_Configuration.py",        "Configuration",         "⚙️") if auth.is_admin() else None,
    _page("32_Admin_Users.py",          "Admin: Users",          "🛡️") if auth.is_admin() else None,
])

# Show signed-in user + sign-out in the sidebar
auth.sidebar_user_badge()

pg = st.navigation({
    "🏠  HOME":                     HOME,
    "📁  PORTFOLIO":                PORTFOLIO,
    "🚚  DELIVERY":                 DELIVERY,
    "💰  FINANCIALS":               FINANCIALS,
    "🛡️  GOVERNANCE & INSIGHTS":  GOVERNANCE,
}, position="sidebar")

pg.run()

