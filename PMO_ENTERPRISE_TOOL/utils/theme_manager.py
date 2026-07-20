"""Theme manager for PMO Enterprise Tool.

Supports three modes:
  * dark   — original navy cockpit theme
  * light  — off-white / light-grey palette (default for light mode)
  * custom — user-defined colours (sidebar pickers)

Choice is persisted in `data/theme.json` so it survives reruns.

Public API:
    get_theme()          -> dict of palette tokens
    plotly_layout()      -> dict for Plotly figures (paper/plot/font colours + faint grid)
    apply_theme()        -> inject global CSS (also writes faint section borders)
    theme_picker_sidebar() -> renders the sidebar Theme panel
"""
from __future__ import annotations
import json
from pathlib import Path
import streamlit as st

from config import DATA_DIR

THEME_FILE = DATA_DIR / "theme.json"

# ─────────────────────────── Presets ───────────────────────────
PRESETS = {
    "dark": {
        "mode": "dark",
        "bg":          "#0f172a",
        "surface":     "#1e293b",
        "sidebar":     "#111827",
        "text":        "#f8fafc",
        "heading":     "#ffffff",   # bright white for headings & chart titles
        "muted":       "#cbd5e1",
        "border":      "#475569",
        "accent":      "#60a5fa",
        "accent2":     "#4ade80",
        "grid":        "rgba(226,232,240,0.18)",
    },
    "light": {
        "mode": "light",
        "bg":          "#f5f6f8",
        "surface":     "#ffffff",
        "sidebar":     "#e9edf2",
        "text":        "#0b1220",
        "heading":     "#0b1220",   # near-black headings on light bg
        "muted":       "#374151",
        "border":      "#d1d5db",
        "accent":      "#1d4ed8",
        "accent2":     "#15803d",
        "grid":        "rgba(11,18,32,0.10)",
    },
}

# Immutable copy of preset defaults — used for "Reset to default".
import copy as _copy
_PRESET_DEFAULTS = _copy.deepcopy(PRESETS)


# ─────────────────────────── Storage ───────────────────────────
def _load() -> dict:
    if THEME_FILE.exists():
        try:
            return json.loads(THEME_FILE.read_text())
        except Exception:
            pass
    return {"preset": "light", "custom": dict(_PRESET_DEFAULTS["light"]),
            "overrides": {}}


def _save(cfg: dict) -> None:
    THEME_FILE.write_text(json.dumps(cfg, indent=2))


def get_theme() -> dict:
    cfg = _load()
    preset = cfg.get("preset", "light")
    if preset == "custom":
        return {**_PRESET_DEFAULTS["light"], **cfg.get("custom", {})}
    overrides = cfg.get("overrides", {}).get(preset, {})
    return {**_PRESET_DEFAULTS.get(preset, _PRESET_DEFAULTS["light"]), **overrides}


# ─────────────────────────── Plotly ───────────────────────────
def plotly_layout(height: int | None = None) -> dict:
    t = get_theme()
    heading = t.get("heading", t["text"])
    layout = dict(
        paper_bgcolor=t["surface"],
        plot_bgcolor=t["surface"],
        font=dict(color=t["text"], size=11),
        title_font_color=heading,
        title_font_size=14,
        legend_font_color=t["text"],
        margin=dict(l=10, r=10, t=35, b=10),
        xaxis=dict(gridcolor=t["grid"], zerolinecolor=t["grid"],
                   tickfont=dict(color=t["text"]),
                   title=dict(font=dict(color=heading))),
        yaxis=dict(gridcolor=t["grid"], zerolinecolor=t["grid"],
                   tickfont=dict(color=t["text"]),
                   title=dict(font=dict(color=heading))),
    )
    if height is not None:
        layout["height"] = height
    return layout


# ─────────────────────────── CSS ───────────────────────────
def _css(t: dict) -> str:
    return f"""
<style>
/* Hide Streamlit chrome, but keep the header layer alive: Streamlit renders
   the sidebar restore button inside/near the header when the nav is collapsed. */
#MainMenu, footer,
[data-testid="stToolbar"],
[data-testid="stDecoration"],
[data-testid="stStatusWidget"],
.stDeployButton, .stAppDeployButton {{
    visibility: hidden !important;
    height: 0 !important;
    position: fixed !important;
    z-index: -1 !important;
}}
header, [data-testid="stHeader"] {{
    visibility: visible !important;
    height: 2.75rem !important;
    min-height: 2.75rem !important;
    background: transparent !important;
    pointer-events: none !important;
    z-index: 999990 !important;
}}
.stApp {{ background-color: {t['bg']}; color: {t['text']}; }}
.stApp p, .stApp span, .stApp label, .stApp li, .stApp div,
[data-testid="stMarkdownContainer"] p,
[data-testid="stMarkdownContainer"] span,
[data-testid="stMarkdownContainer"] li,
[data-testid="stMarkdownContainer"] div {{
    color: {t['text']};
}}
.stApp h1, .stApp h2, .stApp h3, .stApp h4, .stApp h5, .stApp h6,
[data-testid="stMarkdownContainer"] h1,
[data-testid="stMarkdownContainer"] h2,
[data-testid="stMarkdownContainer"] h3,
[data-testid="stMarkdownContainer"] h4,
[data-testid="stMarkdownContainer"] h5,
[data-testid="stMarkdownContainer"] h6 {{
    color: {t.get('heading', t['text'])} !important;
}}
[data-testid="stSidebar"] {{ background-color: {t['sidebar']}; }}
[data-testid="stSidebar"] * {{ color: {t['text']}; }}
.block-container {{ padding-top: 0.5rem; padding-bottom: 0.5rem; max-width: 100%; }}

/* ── Keep sidebar collapse / re-open toggle always visible ── */
[data-testid="stSidebarCollapsedControl"],
[data-testid="collapsedControl"],
button[kind="header"],
[data-testid="stHeader"] button,
header button,
button[title*="sidebar" i],
button[aria-label*="sidebar" i],
button[aria-label*="navigation" i] {{
    display: flex !important;
    visibility: visible !important;
    opacity: 1 !important;
    z-index: 999999 !important;
    background: {t['surface']} !important;
    color: {t['text']} !important;
    border: 1px solid {t['border']} !important;
    border-radius: 6px !important;
    box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    top: 8px !important; left: 8px !important;
    position: fixed !important;
    pointer-events: auto !important;
    width: 38px !important;
    height: 38px !important;
    min-width: 38px !important;
    min-height: 38px !important;
}}
[data-testid="stSidebarCollapsedControl"] svg,
[data-testid="collapsedControl"] svg,
button[kind="header"] svg,
[data-testid="stHeader"] button svg,
header button svg {{
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
    fill: {t['text']} !important;
    color: {t['text']} !important;
}}

/* ── Navigation section labels (dict keys of st.navigation) ── */
[data-testid="stSidebarNav"] [data-testid="stSidebarNavSectionHeader"],
[data-testid="stSidebarNav"] span[class*="SectionHeader"],
[data-testid="stSidebarNavSectionHeader"] {{
    font-size: 12px !important;
    font-weight: 800 !important;
    letter-spacing: 1.5px !important;
    text-transform: uppercase !important;
    color: {t['accent']} !important;
    background: {t['surface']} !important;
    padding: 8px 12px !important;
    margin: 10px 6px 4px 6px !important;
    border-left: 3px solid {t['accent']} !important;
    border-radius: 4px !important;
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
}}


/* Faint section frames (very light lines) */
.section-frame {{
    border: 1px solid {t['border']};
    border-radius: 10px;
    padding: 10px 12px;
    margin-bottom: 10px;
    background: {t['surface']};
}}
.section-title {{
    font-size: 12px;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: {t.get('heading', t['text'])};
    margin: 0 0 6px 0;
    font-weight: 700;
}}

.kpi-card {{
    background: {t['surface']};
    border: 1px solid {t['border']};
    border-radius: 8px;
    padding: 8px 10px;
}}
.kpi-label {{ font-size: 9px; color: {t['muted']}; letter-spacing: 1px; text-transform: uppercase; }}
.kpi-value {{ font-size: 20px; font-weight: 700; color: {t.get('heading', t['text'])}; margin-top: 1px; }}
h1, h2, h3 {{ margin-top: 0.2rem; margin-bottom: 0.3rem; color: {t.get('heading', t['text'])} !important; }}

/* Governance flow nodes */
.gov-flow {{ display: flex; align-items: stretch; gap: 4px; overflow-x: auto; }}
.gov-stage {{
    flex: 1 1 0; min-width: 110px;
    border: 1px solid {t['border']}; border-radius: 8px;
    padding: 8px; background: {t['surface']};
    position: relative;
}}
.gov-stage.active {{ border-color: {t['accent']}; box-shadow: 0 0 0 2px {t['accent']}33; }}
.gov-stage-head {{
    display:flex; align-items:center; gap:6px;
    font-weight:700; font-size:12px; color:{t['text']};
    border-bottom:1px solid {t['border']}; padding-bottom:4px; margin-bottom:6px;
}}
.gov-dot {{
    width:18px; height:18px; border-radius:50%; flex:none;
    display:inline-flex; align-items:center; justify-content:center;
    font-size:10px; color:#fff; background:{t['accent']};
}}
.gov-proj {{
    font-size:10.5px; color:{t['text']}; padding:2px 0;
    border-top:1px dashed {t['border']};
}}
.gov-proj:first-of-type {{ border-top: none; }}
.gov-arrow {{
    align-self:center; color:{t['muted']}; font-size:18px; padding:0 2px;
}}

/* ─────────────── Widget theming (buttons, inputs, dropdowns, tables) ─────────────── */

/* Buttons */
.stApp .stButton > button,
.stApp .stDownloadButton > button,
.stApp [data-testid="baseButton-secondary"],
.stApp [data-testid="baseButton-primary"] {{
    background-color: {t['surface']} !important;
    color: {t['text']} !important;
    border: 1px solid {t['border']} !important;
    border-radius: 6px !important;
}}
.stApp .stButton > button:hover,
.stApp .stDownloadButton > button:hover {{
    border-color: {t['accent']} !important;
    color: {t['accent']} !important;
    background-color: {t['surface']} !important;
}}

/* Text / number / date inputs */
.stApp input, .stApp textarea,
.stApp [data-baseweb="input"] input,
.stApp [data-baseweb="textarea"] textarea {{
    background-color: {t['surface']} !important;
    color: {t['text']} !important;
    border-color: {t['border']} !important;
}}

/* Selectbox & multiselect (BaseWeb) */
.stApp [data-baseweb="select"] > div,
.stApp [data-baseweb="select"] [role="combobox"],
.stApp [data-baseweb="select"] input {{
    background-color: {t['surface']} !important;
    color: {t['text']} !important;
    border-color: {t['border']} !important;
}}
.stApp [data-baseweb="select"] svg {{ fill: {t['muted']} !important; }}
.stApp [data-baseweb="tag"] {{
    background-color: {t['sidebar']} !important;
    color: {t['text']} !important;
    border: 1px solid {t['border']} !important;
}}
/* Popover/menu (selectbox dropdown panel — rendered at document root) */
[data-baseweb="popover"], [data-baseweb="popover"] *,
[data-baseweb="menu"], [data-baseweb="menu"] *,
[role="listbox"], [role="listbox"] * {{
    background-color: {t['surface']} !important;
    color: {t['text']} !important;
}}
[role="option"]:hover,
[data-baseweb="menu"] li:hover {{
    background-color: {t['sidebar']} !important;
    color: {t['text']} !important;
}}

/* Radio & checkbox labels */
.stApp .stRadio label, .stApp .stCheckbox label {{ color: {t['text']} !important; }}

/* Slider track/thumb */
.stApp [data-baseweb="slider"] [role="slider"] {{ background-color: {t['accent']} !important; }}

/* Tabs */
.stApp [data-baseweb="tab-list"] {{ background-color: {t['surface']} !important; border-bottom: 1px solid {t['border']} !important; }}
.stApp [data-baseweb="tab"] {{ color: {t['muted']} !important; }}
.stApp [data-baseweb="tab"][aria-selected="true"] {{ color: {t['accent']} !important; }}

/* Expander */
.stApp [data-testid="stExpander"] {{
    background-color: {t['surface']} !important;
    border: 1px solid {t['border']} !important;
    border-radius: 8px !important;
}}
.stApp [data-testid="stExpander"] summary,
.stApp [data-testid="stExpander"] details > summary {{ color: {t['text']} !important; }}

/* Metric */
.stApp [data-testid="stMetric"] {{
    background-color: {t['surface']};
    border: 1px solid {t['border']};
    border-radius: 8px;
    padding: 6px 10px;
}}
.stApp [data-testid="stMetricLabel"] {{ color: {t['muted']} !important; }}
.stApp [data-testid="stMetricValue"] {{ color: {t['text']} !important; }}

/* Dataframe / data editor (sheet view) */
.stApp [data-testid="stDataFrame"], .stApp [data-testid="stDataFrameResizable"],
.stApp [data-testid="stDataEditor"] {{
    background-color: {t['surface']} !important;
    border: 1px solid {t['border']} !important;
    border-radius: 8px !important;
}}
/* glide-data-grid theme variables (canvas-based grid used by st.data_editor /
   st.dataframe). These are the only knobs that actually colour the canvas. */
.stApp [data-testid="stDataFrame"],
.stApp [data-testid="stDataFrameResizable"],
.stApp [data-testid="stDataEditor"],
.stApp [data-testid="stDataFrame"] .dvn-scroller,
.stApp [data-testid="stDataEditor"] .dvn-scroller {{
    --gdg-bg-cell: {t['surface']};
    --gdg-bg-cell-medium: {t['surface']};
    --gdg-bg-header: {t['sidebar']};
    --gdg-bg-header-has-focus: {t['sidebar']};
    --gdg-bg-header-hovered: {t['sidebar']};
    --gdg-bg-bubble: {t['sidebar']};
    --gdg-bg-bubble-selected: {t['accent']};
    --gdg-bg-search-result: {t['accent']}33;
    --gdg-text-dark: {t['text']};
    --gdg-text-medium: {t['text']};
    --gdg-text-light: {t['muted']};
    --gdg-text-bubble: {t['text']};
    --gdg-text-header: {t.get('heading', t['text'])};
    --gdg-text-header-selected: {t.get('heading', t['text'])};
    --gdg-text-group-header: {t.get('heading', t['text'])};
    --gdg-border-color: {t['border']};
    --gdg-horizontal-border-color: {t['border']};
    --gdg-drilldown-border: {t['border']};
    --gdg-accent-color: {t['accent']};
    --gdg-accent-fg: {t['surface']};
    --gdg-accent-light: {t['accent']}22;
    --gdg-link-color: {t['accent']};
    --gdg-cell-horizontal-padding: 8px;
    --gdg-cell-vertical-padding: 3px;
    --gdg-header-bg: {t['sidebar']};
    --gdg-header-icon-color: {t['muted']};
}}

/* File uploader */
.stApp [data-testid="stFileUploader"] section {{
    background-color: {t['surface']} !important;
    border: 1px dashed {t['border']} !important;
    color: {t['text']} !important;
}}

/* Alerts keep their semantic colours but tone surface to match */
.stApp [data-testid="stAlert"] {{ border: 1px solid {t['border']} !important; }}

/* Code blocks */
.stApp code, .stApp pre {{
    background-color: {t['sidebar']} !important;
    color: {t['text']} !important;
}}

/* Themed HTML sheet view (fallback so values are always visible) */
.themed-sheet-wrap {{
    max-height: 480px; overflow: auto;
    border: 1px solid {t['border']}; border-radius: 8px;
    background: {t['surface']};
}}
.themed-sheet {{
    width: 100%; border-collapse: collapse; font-size: 12px;
    color: {t['text']}; background: {t['surface']};
}}
.themed-sheet thead th {{
    position: sticky; top: 0; z-index: 2;
    background: {t['sidebar']}; color: {t['text']};
    text-align: left; padding: 8px 10px;
    border-bottom: 2px solid {t['border']};
    font-weight: 600; white-space: nowrap;
}}
.themed-sheet tbody td {{
    padding: 6px 10px; border-bottom: 1px solid {t['border']};
    color: {t['text']}; white-space: nowrap;
}}
.themed-sheet tbody tr:hover td {{ background: {t['sidebar']}; }}

/* ─────────────── Responsive scaling for smaller screens ───────────────
   Keeps the same layout structure (columns stay side-by-side) but
   shrinks paddings, fonts, and KPI values so a 13"–15" laptop shows the
   same view a 27" monitor does without horizontal overflow or clipping. */

/* Ensure horizontal columns never overflow their container */
.stApp [data-testid="stHorizontalBlock"] {{
    flex-wrap: nowrap !important;
    gap: 0.5rem !important;
}}
.stApp [data-testid="column"] {{
    min-width: 0 !important;
    overflow: hidden;
}}
.stApp [data-testid="stPlotlyChart"],
.stApp [data-testid="stPlotlyChart"] > div,
.stApp [data-testid="stPlotlyChart"] .js-plotly-plot,
.stApp [data-testid="stPlotlyChart"] .plot-container {{
    width: 100% !important;
    max-width: 100% !important;
}}

/* Laptop-class screens (≤ 1600px) */
@media (max-width: 1600px) {{
    .stApp {{ font-size: 13.5px; }}
    .block-container {{ padding-left: 0.75rem !important; padding-right: 0.75rem !important; }}
    .kpi-value {{ font-size: 18px !important; }}
    .kpi-label {{ font-size: 8.5px !important; }}
    .stApp h1 {{ font-size: 1.55rem !important; }}
    .stApp h2 {{ font-size: 1.25rem !important; }}
    .stApp h3 {{ font-size: 1.05rem !important; }}
    .stApp [data-testid="stMetricValue"] {{ font-size: 1.3rem !important; }}
    .section-frame {{ padding: 8px 10px !important; }}
}}

/* Small laptops / narrow windows (≤ 1366px) */
@media (max-width: 1366px) {{
    .stApp {{ font-size: 12.5px; }}
    .block-container {{ padding-left: 0.5rem !important; padding-right: 0.5rem !important; }}
    .kpi-value {{ font-size: 16px !important; }}
    .kpi-card {{ padding: 6px 8px !important; }}
    .stApp h1 {{ font-size: 1.35rem !important; }}
    .stApp h2 {{ font-size: 1.15rem !important; }}
    .stApp h3 {{ font-size: 1rem !important; }}
    .stApp [data-testid="stMetricValue"] {{ font-size: 1.15rem !important; }}
    .stApp [data-testid="stMetricLabel"] {{ font-size: 0.75rem !important; }}
    .gov-stage {{ min-width: 90px !important; padding: 6px !important; }}
    .themed-sheet {{ font-size: 11px !important; }}
}}

/* Very small windows (≤ 1200px) — allow inner scroll rather than distort */
@media (max-width: 1200px) {{
    .stApp {{ font-size: 12px; }}
    .kpi-value {{ font-size: 15px !important; }}
    .stApp [data-testid="stHorizontalBlock"] {{ overflow-x: auto !important; }}
}}
</style>

"""


def render_sheet(df, max_rows: int = 500, key: str | None = None,
                 sortable: bool = True, filterable: bool = True) -> None:
    """Render a DataFrame using Streamlit's native dataframe.

    - Missing / blank cells display as "NA" so pages never break on empty data.
    - When a "Project ID" column is present, it is rendered as a clickable
      link that opens the Project Infographic page for that project.
    """
    import pandas as pd
    if df is None or len(df) == 0:
        st.info("No rows to display.")
        return

    if key:
        base_key = key
    else:
        _n = st.session_state.get("_render_sheet_seq", 0) + 1
        st.session_state["_render_sheet_seq"] = _n
        base_key = f"sheet_{abs(hash(tuple(map(str, df.columns)))) % 10**8}_{len(df)}_{_n}"

    view = df.copy()

    col_cfg = {}
    # Convert "Project ID" values into links to the Project Infographic page.
    if "Project ID" in view.columns:
        try:
            view["Project ID"] = view["Project ID"].apply(
                lambda v: (f"/Project_Infographic?project_id={str(v).strip()}"
                           if pd.notna(v) and str(v).strip() else None))
            col_cfg["Project ID"] = st.column_config.LinkColumn(
                "Project ID",
                display_text=r"project_id=(.+)$",
                help="Open the Project Infographic for this project.",
            )
        except Exception:
            pass

    # Fill missing values with "NA" so blank cells never crash downstream.
    try:
        for c in view.columns:
            if c == "Project ID":
                continue
            if view[c].dtype == object:
                view[c] = view[c].where(view[c].notna() & (view[c].astype(str).str.strip() != ""), "NA")
            else:
                view[c] = view[c].where(view[c].notna(), "NA")
    except Exception:
        view = view.fillna("NA")

    st.dataframe(view.head(max_rows),
                 use_container_width=True, hide_index=True,
                 column_config=col_cfg or None)

    st.caption(
        f"Showing {min(len(view), max_rows):,} of {len(view):,} "
        f"row(s) — original {len(df):,}. Click a column header to sort."
    )


def pd_isna(v) -> bool:
    try:
        import pandas as pd
        return bool(pd.isna(v))
    except Exception:
        return v is None


def apply_theme() -> None:
    # Avoid recomputing the CSS string on every rerun.
    t = get_theme()
    sig = (t.get("preset"), tuple(sorted((k, v) for k, v in t.items() if isinstance(v, str))))
    if st.session_state.get("_theme_sig") != sig:
        st.session_state["_theme_css"] = _css(t)
        st.session_state["_theme_sig"] = sig
    st.markdown(st.session_state["_theme_css"], unsafe_allow_html=True)


# ─────────────────────────── Sidebar picker ───────────────────────────
_CUSTOMISABLE_KEYS = [
    ("bg",       "Background"),
    ("surface",  "Surface / cards"),
    ("sidebar",  "Sidebar"),
    ("text",     "Body text"),
    ("heading",  "Headings & chart titles"),
    ("muted",    "Muted text"),
    ("border",   "Section lines"),
    ("accent",   "Accent"),
    ("accent2",  "Accent 2"),
]


def theme_picker_sidebar() -> None:
    cfg = _load()
    with st.sidebar.expander("🎨 Theme", expanded=False):
        choice = st.radio(
            "Mode",
            ["light", "dark", "custom"],
            index=["light", "dark", "custom"].index(cfg.get("preset", "light")),
            horizontal=True,
        )
        if choice != cfg.get("preset"):
            cfg["preset"] = choice
            if choice == "custom" and "custom" not in cfg:
                cfg["custom"] = dict(PRESETS["light"])
            _save(cfg); st.rerun()

        st.markdown("---")
        st.caption(f"Customise colours for the **{choice}** theme.")

        if choice == "custom":
            base = cfg.get("custom") or dict(PRESETS["light"])
        else:
            overrides = cfg.get("overrides", {}).get(choice, {})
            base = {**_PRESET_DEFAULTS[choice], **overrides}

        new = dict(base)
        for k, label in _CUSTOMISABLE_KEYS:
            default = base.get(k, _PRESET_DEFAULTS["light"].get(k, "#000000"))
            new[k] = st.color_picker(label, default, key=f"theme_{choice}_{k}")
        new["grid"] = base.get("grid", _PRESET_DEFAULTS[choice if choice != 'custom' else 'light']["grid"])

        c1, c2 = st.columns(2)
        with c1:
            if st.button("Apply", use_container_width=True, key=f"apply_{choice}"):
                if choice == "custom":
                    new["mode"] = "custom"
                    cfg["custom"] = new
                else:
                    cfg.setdefault("overrides", {})[choice] = new
                _save(cfg); st.rerun()
        with c2:
            if st.button("Reset to default", use_container_width=True,
                         key=f"reset_{choice}"):
                if choice == "custom":
                    cfg["custom"] = dict(_PRESET_DEFAULTS["light"])
                else:
                    cfg.get("overrides", {}).pop(choice, None)
                _save(cfg); st.rerun()
