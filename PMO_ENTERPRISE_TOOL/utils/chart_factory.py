"""Reusable Plotly chart builders driven by the active theme."""
from __future__ import annotations
import html
from urllib.parse import quote
import plotly.express as px
import plotly.graph_objects as go
import pandas as pd
from collections.abc import Mapping

from config import RAG_COLORS, THEME_COLORS, STAGES
from utils.theme_manager import plotly_layout, get_theme


class _ThemeDict(Mapping):
    """Live proxy to theme_manager.plotly_layout() so charts re-theme on rerun."""
    def _src(self): return plotly_layout()
    def __getitem__(self, k): return self._src()[k]
    def __iter__(self):       return iter(self._src())
    def __len__(self):        return len(self._src())


DARK_LAYOUT = _ThemeDict()  # name kept for backward compatibility


def _lay(height=None):
    d = plotly_layout()
    if height is not None: d["height"] = height
    return d


def _is_na(value) -> bool:
    """True for blanks / spreadsheet-style NA values."""
    if value is None:
        return True
    try:
        if pd.isna(value):
            return True
    except Exception:
        pass
    return str(value).strip() in {"", "NA", "N/A", "nan", "None", "NaT"}


def _project_name_lookup(projects_df=None) -> dict[str, str]:
    """Project ID -> Project Name from the Projects sheet."""
    if projects_df is None or getattr(projects_df, "empty", True):
        return {}
    if "Project ID" not in projects_df.columns or "Project Name" not in projects_df.columns:
        return {}
    clean = projects_df[["Project ID", "Project Name"]].dropna(subset=["Project ID"]).drop_duplicates("Project ID")
    return {
        str(r["Project ID"]).strip(): str(r["Project Name"]).strip()
        for _, r in clean.iterrows()
        if not _is_na(r.get("Project ID")) and not _is_na(r.get("Project Name"))
    }


def _project_name(row, lookup: dict[str, str]) -> str:
    """Prefer a real name on the row, otherwise resolve it from Projects by ID."""
    raw = row.get("Project Name")
    if not _is_na(raw):
        return str(raw).strip()
    pid = str(row.get("Project ID") or "").strip()
    return lookup.get(pid, "NA")


def _project_link(pid: str) -> str:
    if not pid or pid == "NA":
        return "NA"
    safe_pid = html.escape(pid)
    return (f"<a href='/Project_Infographic?project_id={quote(pid)}' "
            f"style='color:#3b82f6;text-decoration:underline'>{safe_pid}</a>")


def donut_rag(df, title="Portfolio Health", height=220):
    fig = go.Figure(go.Pie(
        labels=df["RAG"], values=df["Count"], hole=.65,
        marker=dict(colors=[RAG_COLORS.get(r, "#888") for r in df["RAG"]]),
        textinfo="label+percent",
    ))
    fig.update_layout(title=title, **_lay(height))
    return fig


def bar_capex_vs_actual(kpis, height=220):
    cats = ["Approved", "Incurred", "Forecast", "Remaining"]
    vals = [kpis["capex_approved"], kpis["cost_incurred"], kpis["forecast"], kpis["remaining"]]
    fig = go.Figure(go.Bar(
        x=cats, y=vals,
        marker_color=["#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6"],
        text=[f"${v/1e6:.1f}M" for v in vals], textposition="outside",
    ))
    fig.update_layout(title="CAPEX vs Actual", **_lay(height))
    return fig


def line_monthly_spend(financials, height=220):
    months_order = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    if financials.empty or "Month" not in financials:
        months = months_order
        actual = [1.0,1.4,1.7,2.1,2.0,2.3,2.4,2.5,2.6,2.5,2.4,2.3]
        forecast = [v+0.2 for v in actual]
    else:
        agg = financials.groupby("Month")[["Actual","Forecast"]].sum().reindex(months_order).fillna(0)
        months = agg.index.tolist()
        actual, forecast = (agg["Actual"]/1e6).tolist(), (agg["Forecast"]/1e6).tolist()
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=months, y=actual, mode="lines+markers", name="Actual",
                             line=dict(color="#22c55e", width=2)))
    fig.add_trace(go.Scatter(x=months, y=forecast, mode="lines+markers", name="Forecast",
                             line=dict(color="#3b82f6", width=2, dash="dash")))
    fig.update_layout(title="Monthly Spend ($M)", **_lay(height),
                      legend=dict(orientation="h", y=-0.2))
    return fig


def donut_theme(df, height=220):
    fig = go.Figure(go.Pie(labels=df["Theme"], values=df["Count"], hole=.6,
                           marker=dict(colors=THEME_COLORS)))
    fig.update_layout(title="By Theme", **_lay(height),
                      legend=dict(font=dict(size=9)))
    return fig


def bar_priority(df, height=220):
    color_map = {"P1 - Critical": "#ef4444", "P2 - High": "#f59e0b",
                 "P3 - Medium": "#eab308", "P4 - Low": "#22c55e"}
    fig = go.Figure(go.Bar(
        y=df["Priority"], x=df["Count"], orientation="h",
        marker_color=[color_map.get(p, "#3b82f6") for p in df["Priority"]],
        text=df["Count"], textposition="outside",
    ))
    fig.update_layout(title="By Priority", **_lay(height))
    return fig


def sparkline(values, color="#3b82f6"):
    fig = go.Figure(go.Scatter(y=values, mode="lines", line=dict(color=color, width=2)))
    fig.update_layout(height=40, margin=dict(l=0, r=0, t=0, b=0),
                      paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
                      xaxis=dict(visible=False), yaxis=dict(visible=False))
    return fig


def governance_funnel(gov_df, height=220):
    """Horizontal funnel of project counts across governance stages (legacy)."""
    counts = gov_df["Stage"].value_counts().reindex(STAGES).fillna(0)
    fig = go.Figure(go.Funnel(
        y=STAGES, x=counts.values, textinfo="value+percent total",
        marker=dict(color=["#3b82f6","#6366f1","#8b5cf6","#a855f7","#ec4899",
                           "#f59e0b","#22c55e","#10b981","#06b6d4"])
    ))
    fig.update_layout(title="Governance Flow (Idea → Realisation)", **_lay(height))
    return fig

# ─────────────────── Governance Flow (Plotly horizontal — exportable) ───────────────────
# Distinct colour + icon per stage so the workflow reads pictorially.
# Professional corporate palette (PRINCE2/PMI-style sequential blues → greens)
# Idea → Discovery → Business Case → Funding → Plan → Gate → Delivery → Benefits → Closure
STAGE_COLORS = [
    "#475569",  # slate — Idea
    "#1e40af",  # navy — Discovery
    "#1d4ed8",  # royal blue — Business Case
    "#0369a1",  # deep sky — Funding
    "#0891b2",  # teal-cyan — Plan
    "#0e7490",  # dark teal — Gate
    "#0f766e",  # forest teal — Delivery
    "#15803d",  # corporate green — Benefits
    "#166534",  # deep green — Closure
]
STAGE_ICONS = ["💡", "🔍", "📐", "✅", "🛠️", "🚦", "🚀", "📈", "🏁"]


def governance_flow_plotly(gov_df, projects_df=None, max_per_stage=5, height=380):
    """Pictorial horizontal stage-board: each governance gate is rendered as a
    coloured card with icon, stage number, project chips, and a progress
    rail with filled nodes for stages that currently hold projects."""
    t = get_theme()
    stage_map = {s: [] for s in STAGES}
    project_names = _project_name_lookup(projects_df)
    if gov_df is not None and not gov_df.empty and "Stage" in gov_df.columns:
        merged = gov_df.copy()
        for _, row in merged.iterrows():
            s = row.get("Stage")
            if s in stage_map:
                pid = "NA" if _is_na(row.get("Project ID")) else str(row.get("Project ID")).strip()
                pname = _project_name(row, project_names)
                pid_html = _project_link(pid)
                label = f"{pid_html} · {html.escape(pname)}" if (pid != "NA" or pname != "NA") else "NA"
                status = (str(row.get("Gate Status") or "")).strip()
                dot = {"Approved": "🟢", "Pending": "🟡",
                       "Rejected": "🔴"}.get(status, "⚪")
                stage_map[s].append(f"{dot} {label}")

    n = len(STAGES)
    box_w, gap = 1.0, 0.20
    total_w = n * (box_w + gap)
    fig = go.Figure()

    # Bottom progress rail
    fig.add_shape(type="line", x0=0, y0=-0.15, x1=total_w - gap, y1=-0.15,
                  line=dict(color=t["border"], width=4))

    for i, stage in enumerate(STAGES):
        x0 = i * (box_w + gap); x1 = x0 + box_w
        col = STAGE_COLORS[i % len(STAGE_COLORS)]
        icon = STAGE_ICONS[i % len(STAGE_ICONS)]
        active = bool(stage_map[stage])

        # Card body
        fig.add_shape(type="rect", x0=x0, y0=0, x1=x1, y1=2.05,
                      line=dict(color=col if active else t["border"],
                                width=3 if active else 1),
                      fillcolor=t["surface"])
        # Coloured header band
        fig.add_shape(type="rect", x0=x0, y0=1.78, x1=x1, y1=2.05,
                      line=dict(color=col, width=0), fillcolor=col)
        fig.add_annotation(x=(x0 + x1) / 2, y=1.915,
                           text=f"<b>{icon}  {i+1}. {stage}</b>",
                           showarrow=False,
                           font=dict(size=12, color="#ffffff"))

        # Count badge
        cnt = len(stage_map[stage])
        fig.add_annotation(x=x1 - 0.08, y=1.62,
                           text=f"<b>{cnt}</b>",
                           showarrow=False,
                           font=dict(size=11, color="#ffffff"),
                           bgcolor=col, bordercolor=col, borderpad=3)

        projs = stage_map[stage][:max_per_stage]
        extra = len(stage_map[stage]) - max_per_stage
        if not projs:
            txt = "<i style='color:#9ca3af'>— no projects —</i>"
        else:
            txt = "<br>".join(projs) + (f"<br><i>+{extra} more</i>" if extra > 0 else "")
        fig.add_annotation(x=(x0 + x1) / 2, y=1.70, text=txt,
                           showarrow=False, yanchor="top", align="left",
                           font=dict(size=10, color=t["text"]))

        # Progress rail marker
        fig.add_shape(type="circle",
                      x0=(x0+x1)/2 - 0.08, x1=(x0+x1)/2 + 0.08,
                      y0=-0.28, y1=-0.02,
                      line=dict(color=col, width=2),
                      fillcolor=col if active else t["surface"])

        if i < n - 1:
            fig.add_annotation(x=x1 + gap * 0.95, y=1.0,
                               ax=x1 + gap * 0.05, ay=1.0,
                               xref="x", yref="y", axref="x", ayref="y",
                               showarrow=True, arrowhead=3, arrowsize=1.6,
                               arrowwidth=2, arrowcolor=col)

    fig.update_xaxes(visible=False, range=[-0.1, total_w])
    fig.update_yaxes(visible=False, range=[-0.5, 2.2])
    fig.update_layout(title="Governance Flow — current stage per project",
                      height=height,
                      paper_bgcolor=t["surface"], plot_bgcolor=t["surface"],
                      margin=dict(l=10, r=10, t=44, b=10),
                      font=dict(color=t["text"]),
                      title_font_color=t.get("heading", t["text"]))
    return fig


# ─────────────────── Governance Flow (HTML horizontal) ───────────────────
def governance_flow_html(gov_df, projects_df=None, max_per_stage=6) -> str:
    """Render the governance workflow as a horizontal HTML flow with each
    project listed under its current stage. Returns an HTML string suitable
    for st.markdown(..., unsafe_allow_html=True)."""
    t = get_theme()
    # Build stage -> [project labels]
    stage_map = {s: [] for s in STAGES}
    project_names = _project_name_lookup(projects_df)
    if gov_df is not None and not gov_df.empty and "Stage" in gov_df.columns:
        merged = gov_df.copy()
        for _, row in merged.iterrows():
            stage = row.get("Stage")
            if stage in stage_map:
                pid = "NA" if _is_na(row.get("Project ID")) else str(row.get("Project ID")).strip()
                pname = _project_name(row, project_names)
                pid_html = _project_link(pid)
                label = f"{pid_html} · {html.escape(pname)}" if (pid != "NA" or pname != "NA") else "NA"
                status = (str(row.get("Gate Status") or "")).strip()
                dot = {"Approved": "🟢", "Pending": "🟡", "Rejected": "🔴"}.get(status, "⚪")
                stage_map[stage].append(f"{dot} {label}")
    parts = ["<div class='gov-flow'>"]
    for i, stage in enumerate(STAGES):
        projs = stage_map[stage]
        active = " active" if projs else ""
        items = "".join(f"<div class='gov-proj'>{p}</div>" for p in projs[:max_per_stage]) \
                or f"<div class='gov-proj' style='color:{t['muted']}'>—</div>"
        more = (f"<div class='gov-proj' style='color:{t['muted']}'>"
                f"+{len(projs)-max_per_stage} more</div>") if len(projs) > max_per_stage else ""
        parts.append(
            f"<div class='gov-stage{active}'>"
            f"<div class='gov-stage-head'><span class='gov-dot'>{i+1}</span>"
            f"<span>{html.escape(stage)}</span></div>"
            f"{items}{more}</div>"
        )
        if i < len(STAGES) - 1:
            parts.append("<div class='gov-arrow'>→</div>")
    parts.append("</div>")
    return "".join(parts)
