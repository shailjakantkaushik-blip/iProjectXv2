"""FY (Financial Year) allocation helpers.

Split each project's total Budget and Forecast across FY buckets
(e.g. FY27=40%, FY28=60%). Persists to the `FYAllocation` sheet of the
active workbook using the same write pipeline as the Data Editor.
"""
from __future__ import annotations
import re
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go

from utils.excel_loader import load_all
from utils.data_io import write_sheet
from utils.fy_axis import get_fy_start_month, fy_quarter

FY_SHEET = "FYAllocation"
ALLOC_COLS = ["Project ID", "Project Name", "FY",
              "Budget %", "Forecast %",
              "Budget Amount", "Forecast Amount", "Notes"]


# ─────────────────────── Project totals ───────────────────────
def project_budget(row: pd.Series) -> float:
    for k in ("Approved Funding", "Budget", "CAPEX Approved", "Total Funding"):
        v = row.get(k, 0)
        try:
            f = float(v)
            if f: return f
        except Exception:
            pass
    return 0.0


def project_forecast(row: pd.Series) -> float:
    for k in ("Forecast At Completion", "Forecast", "Approved Funding", "Budget"):
        v = row.get(k, 0)
        try:
            f = float(v)
            if f: return f
        except Exception:
            pass
    return 0.0


# ─────────────────────── FY range helpers ───────────────────────
def fy_label(year: int) -> str:
    return f"FY{str(year)[-2:]}"


def default_fy_list(projects: pd.DataFrame, n_years: int = 5) -> list[str]:
    """Derive an FY range around project start/end dates."""
    fy_start = get_fy_start_month()
    dates = []
    for col in ("Start Date", "End Date", "Target Go-Live", "Target Date"):
        if col in projects.columns:
            dates.extend(pd.to_datetime(projects[col], errors="coerce").dropna().tolist())
    if not dates:
        this_year = pd.Timestamp.today().year
        years = list(range(this_year, this_year + n_years))
    else:
        s, e = min(dates), max(dates)
        _, y0 = fy_quarter(s, fy_start)
        _, y1 = fy_quarter(e, fy_start)
        years = list(range(int(y0), int(y1) + 1))
        if len(years) < n_years:
            years = list(range(years[0], years[0] + n_years))
    return [fy_label(y) for y in years]


# ─────────────────────── Load / save ───────────────────────
def _find_sheet(sheets: dict) -> pd.DataFrame:
    """Case/whitespace-insensitive lookup for the FYAllocation sheet."""
    if not sheets:
        return pd.DataFrame()
    target = "".join(FY_SHEET.lower().split())
    for name, df in sheets.items():
        if "".join(str(name).lower().split()) == target:
            return df if isinstance(df, pd.DataFrame) else pd.DataFrame()
    return pd.DataFrame()


def load_allocations() -> pd.DataFrame:
    data = load_all()
    df = _find_sheet(data.get("_sheets", {})).copy()
    if df.empty:
        alt = data.get("fyallocation", pd.DataFrame())
        if isinstance(alt, pd.DataFrame) and not alt.empty:
            df = alt.copy()
    if df.empty:
        return pd.DataFrame(columns=ALLOC_COLS)
    for c in ALLOC_COLS:
        if c not in df.columns:
            df[c] = "" if c in ("Notes",) else 0
    for c in ("Budget %", "Forecast %", "Budget Amount", "Forecast Amount"):
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)
    df["FY"] = df["FY"].astype(str)
    df["Project ID"] = df["Project ID"].astype(str)
    df = df[df["Project ID"].str.strip().str.upper().ne("NA")]
    df = df[df["Project ID"].str.strip() != ""]
    return df[ALLOC_COLS].reset_index(drop=True)


def save_project_allocation(project_id: str, project_name: str,
                            editor_df: pd.DataFrame,
                            budget_total: float, forecast_total: float,
                            notes_by_fy: dict[str, str] | None = None):
    """Replace all rows for `project_id` in the FYAllocation sheet."""
    all_alloc = load_allocations()
    # drop existing rows for this project
    all_alloc = all_alloc[all_alloc["Project ID"].astype(str) != str(project_id)]
    notes_by_fy = notes_by_fy or {}
    rows = []
    for _, r in editor_df.iterrows():
        fy = str(r.get("FY", "")).strip()
        if not fy:
            continue
        bp = float(r.get("Budget %", 0) or 0)
        fp = float(r.get("Forecast %", 0) or 0)
        if bp == 0 and fp == 0:
            continue
        rows.append({
            "Project ID": project_id,
            "Project Name": project_name,
            "FY": fy,
            "Budget %": round(bp, 2),
            "Forecast %": round(fp, 2),
            "Budget Amount": round(budget_total * bp / 100, 2),
            "Forecast Amount": round(forecast_total * fp / 100, 2),
            "Notes": notes_by_fy.get(fy, str(r.get("Notes", "") or "")),
        })
    new_df = pd.concat([all_alloc, pd.DataFrame(rows, columns=ALLOC_COLS)],
                       ignore_index=True) if rows else all_alloc
    write_sheet(FY_SHEET, new_df[ALLOC_COLS])


# ─────────────────────── Analytics ───────────────────────
def merge_with_projects(alloc: pd.DataFrame, projects: pd.DataFrame) -> pd.DataFrame:
    if alloc.empty or projects.empty:
        return alloc.copy()
    keep = [c for c in ("Project ID", "Portfolio Category", "Governance Channel",
                        "Sponsor", "RAG", "Program", "Start Date", "End Date")
            if c in projects.columns]
    p = projects[keep].drop_duplicates("Project ID").copy()
    p["Project ID"] = p["Project ID"].astype(str)
    a = alloc.copy()
    a["Project ID"] = a["Project ID"].astype(str)
    return a.merge(p, on="Project ID", how="left")


def fy_sort_key(fy: str) -> int:
    m = re.search(r"(\d+)", str(fy))
    return int(m.group(1)) if m else 0


def totals_by_fy(alloc: pd.DataFrame) -> pd.DataFrame:
    if alloc.empty:
        return pd.DataFrame(columns=["FY", "Budget Amount", "Forecast Amount"])
    g = (alloc.groupby("FY", as_index=False)[["Budget Amount", "Forecast Amount"]]
         .sum())
    g["_k"] = g["FY"].map(fy_sort_key)
    return g.sort_values("_k").drop(columns="_k")


def kpis(alloc: pd.DataFrame, projects: pd.DataFrame) -> list[tuple[str, str]]:
    def fmt(v):
        v = float(v or 0)
        if abs(v) >= 1e9: return f"${v/1e9:.2f}B"
        if abs(v) >= 1e6: return f"${v/1e6:.2f}M"
        if abs(v) >= 1e3: return f"${v/1e3:.0f}K"
        return f"${v:,.0f}"
    total_b = alloc["Budget Amount"].sum() if not alloc.empty else 0
    total_f = alloc["Forecast Amount"].sum() if not alloc.empty else 0
    var = total_f - total_b
    n_alloc = alloc["Project ID"].nunique() if not alloc.empty else 0
    n_all = projects["Project ID"].nunique() if not projects.empty and "Project ID" in projects.columns else 0
    n_missing = max(0, n_all - n_alloc)
    coverage = (n_alloc / n_all * 100) if n_all else 0
    return [
        ("Total Budget Allocated", fmt(total_b)),
        ("Total Forecast Allocated", fmt(total_f)),
        ("Forecast vs Budget", fmt(var)),
        ("Projects Allocated", f"{n_alloc}/{n_all}"),
        ("Coverage", f"{coverage:.0f}%"),
        ("Missing Allocation", f"{n_missing}"),
    ]


# ─────────────────────── Charts ───────────────────────
_PALETTE = ["#3b82f6", "#8b5cf6", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4"]


def chart_totals_by_fy(alloc: pd.DataFrame) -> go.Figure:
    g = totals_by_fy(alloc)
    fig = go.Figure()
    fig.add_bar(name="Budget", x=g["FY"], y=g["Budget Amount"],
                marker_color="#3b82f6",
                text=[f"${v/1e6:.1f}M" for v in g["Budget Amount"]],
                textposition="outside")
    fig.add_bar(name="Forecast", x=g["FY"], y=g["Forecast Amount"],
                marker_color="#f59e0b",
                text=[f"${v/1e6:.1f}M" for v in g["Forecast Amount"]],
                textposition="outside")
    fig.update_layout(barmode="group", title="Budget vs Forecast by FY",
                      yaxis_title="Amount", height=420,
                      legend=dict(orientation="h", y=1.1))
    return fig


def chart_project_mix(alloc: pd.DataFrame, top_n: int = 15) -> go.Figure:
    if alloc.empty:
        return go.Figure()
    totals = (alloc.groupby("Project Name")["Forecast Amount"].sum()
              .sort_values(ascending=False).head(top_n).index.tolist())
    df = alloc[alloc["Project Name"].isin(totals)].copy()
    df["_k"] = df["FY"].map(fy_sort_key)
    df = df.sort_values("_k")
    fig = px.bar(df, x="Project Name", y="Forecast Amount", color="FY",
                 title=f"Forecast Allocation Mix — Top {len(totals)} Projects",
                 color_discrete_sequence=_PALETTE)
    fig.update_layout(height=460, xaxis_tickangle=-30, barmode="stack")
    return fig


def chart_heatmap(alloc: pd.DataFrame, top_n: int = 20) -> go.Figure:
    if alloc.empty:
        return go.Figure()
    totals = (alloc.groupby("Project Name")["Forecast Amount"].sum()
              .sort_values(ascending=False).head(top_n).index.tolist())
    df = alloc[alloc["Project Name"].isin(totals)]
    pivot = df.pivot_table(index="Project Name", columns="FY",
                           values="Forecast Amount", aggfunc="sum",
                           fill_value=0)
    pivot = pivot[sorted(pivot.columns, key=fy_sort_key)]
    fig = px.imshow(pivot, aspect="auto", color_continuous_scale="Blues",
                    labels=dict(color="Forecast $"),
                    title="Forecast Heatmap — Project × FY")
    fig.update_layout(height=520)
    return fig


def chart_waterfall(alloc: pd.DataFrame) -> go.Figure:
    g = totals_by_fy(alloc)
    if g.empty:
        return go.Figure()
    fig = go.Figure(go.Waterfall(
        x=g["FY"].tolist(),
        y=g["Forecast Amount"].tolist(),
        measure=["relative"] * len(g),
        text=[f"${v/1e6:.1f}M" for v in g["Forecast Amount"]],
        textposition="outside",
        connector={"line": {"color": "#94a3b8"}},
    ))
    fig.update_layout(title="Forecast Roll-Forward by FY", height=420)
    return fig


def chart_roadmap(alloc: pd.DataFrame, projects: pd.DataFrame) -> go.Figure:
    """FY roadmap — one bar per project × FY, coloured by RAG, sized by $."""
    if alloc.empty:
        return go.Figure()
    fy_start = get_fy_start_month()
    merged = merge_with_projects(alloc, projects)
    rows = []
    for _, r in merged.iterrows():
        fy = str(r["FY"])
        m = re.search(r"(\d+)", fy)
        if not m: continue
        yy = int(m.group(1))
        year = 2000 + yy if yy < 100 else yy
        start = pd.Timestamp(year=year - (1 if fy_start > 1 else 0),
                             month=fy_start, day=1) if fy_start > 1 else \
                pd.Timestamp(year=year, month=1, day=1)
        end = (start + pd.DateOffset(years=1)) - pd.Timedelta(days=1)
        rows.append({
            "Project": r.get("Project Name", ""),
            "FY": fy,
            "Start": start, "End": end,
            "Forecast": float(r.get("Forecast Amount", 0) or 0),
            "RAG": r.get("RAG", "NA") or "NA",
        })
    df = pd.DataFrame(rows)
    if df.empty:
        return go.Figure()
    color_map = {"Green": "#22c55e", "Amber": "#f59e0b", "Red": "#ef4444", "NA": "#94a3b8"}
    fig = px.timeline(df, x_start="Start", x_end="End", y="Project",
                      color="RAG", color_discrete_map=color_map,
                      hover_data={"FY": True, "Forecast": ":,.0f",
                                  "Start": False, "End": False},
                      title="FY Allocation Roadmap")
    fig.update_yaxes(autorange="reversed")
    fig.update_layout(height=max(400, 26 * df["Project"].nunique()))
    try:
        from utils.fy_axis import apply_fy_quarter_axis
        fig = apply_fy_quarter_axis(fig)
    except Exception:
        pass
    return fig
