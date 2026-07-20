"""Gantt-style roadmap that overlays the FULL governance workflow
(all stage gates) on every project bar and highlights the current gate.
"""
from __future__ import annotations
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from config import RAG_COLORS, STAGES
from utils.chart_factory import DARK_LAYOUT
from utils.fy_axis import apply_fy_quarter_axis



_GATE_COLOR = {"Approved": "#22c55e", "Pending": "#f59e0b", "Rejected": "#ef4444"}


def gantt(projects: pd.DataFrame, governance: pd.DataFrame | None = None,
          height: int = 650, group_col: str | None = None):
    df = projects.dropna(subset=["Start Date", "End Date"]).copy()
    if df.empty:
        return None
    df["Start Date"] = pd.to_datetime(df["Start Date"])
    df["End Date"]   = pd.to_datetime(df["End Date"])
    df["RAG"] = df.get("RAG", "Green").fillna("Green")

    # Group projects by segmentation as sections within the chart (facet rows)
    use_group = bool(group_col and group_col in df.columns
                     and df[group_col].nunique() > 1)
    px_kwargs = dict(
        x_start="Start Date", x_end="End Date", y="Project Name",
        color="RAG", color_discrete_map=RAG_COLORS,
        hover_data=["Status", "Program", "Sponsor"],
        opacity=0.55,
    )
    if use_group:
        px_kwargs["facet_row"] = group_col
        df = df.sort_values([group_col, "Start Date"])
        # Scale height by number of segments
        height = max(height, 220 * df[group_col].nunique())
    fig = px.timeline(df, **px_kwargs)
    fig.update_yaxes(autorange="reversed", matches=None, showticklabels=True)
    if use_group:
        # Clean facet labels: show segment name, no "col=" prefix
        fig.for_each_annotation(lambda a: a.update(
            text=f"<b>{a.text.split('=')[-1]}</b>",
            font=dict(size=12)))

    fig.update_layout(
        title="Portfolio Roadmap — Governance Workflow (all gates, ◆ = current)",
        height=height, **DARK_LAYOUT,
        legend=dict(
            orientation="v",
            yanchor="top", y=1,
            xanchor="left", x=1.02,
            bgcolor="rgba(0,0,0,0)",
            title=dict(text="RAG"),
        ),
    )
    # Widen right margin to make room for vertical legend
    _m = dict(DARK_LAYOUT.get("margin", {}))
    _m["r"] = 160
    fig.update_layout(margin=_m)

    n = len(STAGES)
    # Current stage lookup
    current_stage = {}
    current_status = {}
    if governance is not None and not governance.empty:
        g = governance.copy()
        for _, row in g.iterrows():
            pid = row.get("Project ID")
            current_stage[pid] = row.get("Stage")
            current_status[pid] = row.get("Gate Status")

    # Determine axis mapping per facet (segment) when faceted
    seg_axes: dict = {}
    if use_group:
        for tr in fig.data:
            ax = (getattr(tr, "xaxis", "x") or "x", getattr(tr, "yaxis", "y") or "y")
            for y in list(getattr(tr, "y", []) or []):
                match = df[df["Project Name"] == y]
                if not match.empty:
                    seg_axes[match.iloc[0][group_col]] = ax

    from collections import defaultdict
    planned = defaultdict(lambda: dict(x=[], y=[], text=[], hover=[]))
    current = defaultdict(lambda: dict(x=[], y=[], text=[], color=[], hover=[]))

    for _, r in df.iterrows():
        pid = r.get("Project ID")
        name = r["Project Name"]
        span = (r["End Date"] - r["Start Date"])
        ax = seg_axes.get(r[group_col], ("x", "y")) if use_group else ("x", "y")
        for i, stage in enumerate(STAGES):
            x = r["Start Date"] + span * ((i + 0.5) / n)
            is_current = current_stage.get(pid) == stage
            if is_current:
                c = current[ax]
                c["x"].append(x); c["y"].append(name); c["text"].append(stage)
                c["color"].append(_GATE_COLOR.get(current_status.get(pid), "#94a3b8"))
                c["hover"].append(f"<b>{name}</b><br>Current Gate: {stage}"
                                  f"<br>Status: {current_status.get(pid,'—')}")
            else:
                p = planned[ax]
                p["x"].append(x); p["y"].append(name); p["text"].append(stage)
                p["hover"].append(f"{name}<br>Gate: {stage}")

    show_p, show_c = True, True
    for ax, d in planned.items():
        if not d["x"]: continue
        fig.add_trace(go.Scatter(
            x=d["x"], y=d["y"], mode="markers+text",
            marker=dict(symbol="line-ns", size=14, color="#cbd5e1",
                        line=dict(color="#cbd5e1", width=2)),
            text=[s[:1] for s in d["text"]], textposition="top center",
            textfont=dict(size=8, color="#94a3b8"),
            name="Gate (planned)", showlegend=show_p, legendgroup="planned",
            hovertext=d["hover"], hoverinfo="text",
            xaxis=ax[0], yaxis=ax[1],
        ))
        show_p = False

    for ax, d in current.items():
        if not d["x"]: continue
        fig.add_trace(go.Scatter(
            x=d["x"], y=d["y"], mode="markers+text",
            marker=dict(symbol="diamond", size=18, color=d["color"],
                        line=dict(color="white", width=2)),
            text=d["text"], textposition="top center",
            textfont=dict(size=10, color="#e2e8f0", family="Arial Black"),
            name="Current Gate", showlegend=show_c, legendgroup="current",
            hovertext=d["hover"], hoverinfo="text",
            xaxis=ax[0], yaxis=ax[1],
        ))
        show_c = False

    # Target Date markers (🎯) — falls back to Target Go-Live / Go Live Date / End Date
    tgt_by_ax: dict = {}
    for _, r in df.iterrows():
        tgt = pd.NaT
        for k in ("Target Date", "Target Go-Live", "Go Live Date", "End Date"):
            v = pd.to_datetime(r.get(k), errors="coerce") if k in r.index else pd.NaT
            if pd.notna(v):
                tgt = v; break
        if pd.isna(tgt): continue
        ax = seg_axes.get(r[group_col], ("x", "y")) if use_group else ("x", "y")
        d = tgt_by_ax.setdefault(ax, dict(x=[], y=[], hover=[]))
        d["x"].append(tgt); d["y"].append(r["Project Name"])
        d["hover"].append(f"<b>{r['Project Name']}</b><br>🎯 Target: {tgt.strftime('%Y-%m-%d')}")

    show_t = True
    for ax, d in tgt_by_ax.items():
        if not d["x"]: continue
        fig.add_trace(go.Scatter(
            x=d["x"], y=d["y"], mode="markers",
            marker=dict(symbol="star", size=14, color="#fbbf24",
                        line=dict(color="#b45309", width=1)),
            name="🎯 Target Date", showlegend=show_t, legendgroup="target",
            hovertext=d["hover"], hoverinfo="text",
            xaxis=ax[0], yaxis=ax[1],
        ))
        show_t = False

    apply_fy_quarter_axis(fig)
    return fig


