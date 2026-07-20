"""Shared bucket-timeline renderer used by Executive Dashboard & Timeline page.

Provides a single `render_view(flt, data, view, key_prefix)` entry point that
draws grouped project timelines with planned span, dark actual-progress
overlay, planned/current stage-gate markers, and target-date stars.
"""
from __future__ import annotations
from datetime import datetime as _dt
import pandas as pd
import plotly.express as _px
import plotly.graph_objects as _go
import streamlit as st

from config import STAGES as _STAGES
from utils.theme_manager import plotly_layout as _plotly_layout
from utils.fy_axis import apply_fy_quarter_axis as _apply_fy


_RAG_COLOR_EX = {"Green": "#22c55e", "Amber": "#f59e0b", "Red": "#ef4444", "Blue": "#3b82f6"}
_RAG_DARK     = {"Green": "#15803d", "Amber": "#b45309", "Red": "#991b1b", "Blue": "#1d4ed8"}
_GATE_STATUS_COLOR = {"Approved": "#22c55e", "Pending": "#f59e0b", "Rejected": "#ef4444",
                      "In Progress": "#3b82f6", "Complete": "#22c55e"}

# Named views → column name + icon
VIEW_OPTIONS = {
    "Portfolio View": ("Portfolio Category", "📁"),
    "Program View":   ("Program",            "🎯"),
    "Health View":    ("RAG",                "🚦"),
    "Priority View":  ("Priority",           "⭐"),
    "Theme View":     ("Theme",              "🎨"),
    "Sponsor View":   ("Sponsor",            "👤"),
    "Status View":    ("Status",             "📌"),
}


def _money(v):
    try: return f"${float(v):,.0f}"
    except Exception: return "—"


def _target_date(p):
    for k in ("Target Date", "Target Go-Live", "Go Live Date", "End Date"):
        v = pd.to_datetime(p.get(k), errors="coerce")
        if not pd.isna(v): return v
    return pd.NaT


def _add_month_year_axis(fig):
    try:
        fig.update_xaxes(tickformat="%b %Y", dtick="M1",
                         showgrid=True, gridcolor="rgba(148,163,184,0.15)",
                         side="top", mirror=False)
    except Exception:
        pass


def render_view_selector(key: str, default: str = "Portfolio View") -> str:
    """Streamlit dropdown that returns the selected view label."""
    labels = list(VIEW_OPTIONS.keys())
    idx = labels.index(default) if default in labels else 0
    return st.selectbox("Group by", labels, index=idx, key=key)


def build_bucket_timeline_figs(flt: pd.DataFrame, data: dict, view_label: str
                               ) -> list[tuple[str, "_go.Figure"]]:
    """Headless version of `render_bucket_timelines` — returns a list of
    `(bucket_label, plotly_figure)` for every group in the chosen view, with
    ALL project timelines expanded. Used by the Executive Dashboard PDF export.
    """
    if view_label not in VIEW_OPTIONS:
        return []
    group_col, icon = VIEW_OPTIONS[view_label]
    if group_col not in flt.columns or not flt[group_col].notna().any():
        return []

    gov_df = data.get("governance", pd.DataFrame()) if isinstance(data, dict) else pd.DataFrame()
    cur_stage, cur_status = {}, {}
    if isinstance(gov_df, pd.DataFrame) and not gov_df.empty:
        for _, _r in gov_df.iterrows():
            cur_stage[_r.get("Project ID")] = _r.get("Stage")
            cur_status[_r.get("Project ID")] = _r.get("Gate Status")

    pv = flt.copy()
    pv[group_col] = pv[group_col].fillna("Unassigned").astype(str)
    n_stages = len(_STAGES)

    out: list[tuple[str, _go.Figure]] = []
    for bucket in sorted(pv[group_col].unique()):
        sub = pv[pv[group_col] == bucket]
        if sub.empty:
            continue
        fig = _build_bucket_fig(sub, bucket, cur_stage, cur_status, n_stages)
        if fig is not None:
            out.append((f"{icon} {bucket}", fig))
    return out


def _build_bucket_fig(sub, bucket, cur_stage, cur_status, n_stages):
    rows, progress_bars, progress_text = [], [], []
    gate_rows = {"planned": [], "current": [], "target": []}
    for _, p in sub.iterrows():
        s = pd.to_datetime(p.get("Start Date"), errors="coerce")
        e = pd.to_datetime(p.get("Go Live Date") or p.get("End Date"), errors="coerce")
        if pd.isna(s) or pd.isna(e):
            continue
        p_apr = pd.to_numeric(p.get("Approved Funding"), errors="coerce")
        p_act = pd.to_numeric(p.get("Actual Spend"),     errors="coerce")
        p_fac = pd.to_numeric(p.get("Forecast At Completion"), errors="coerce")
        p_ben = pd.to_numeric(p.get("Benefits Realised"), errors="coerce")
        pid = p.get("Project ID")
        tgt = _target_date(p)
        tgt_str = tgt.strftime("%Y-%m-%d") if not pd.isna(tgt) else "—"
        rag_v = str(p.get("RAG", ""))
        label = (f"{pid} — {p.get('Project Name','')}  "
                 f"[Apr {_money(p_apr)} · Act {_money(p_act)} · "
                 f"FAC {_money(p_fac)} · Ben {_money(p_ben)} · 🎯 {tgt_str}]")
        rows.append(dict(Project=label, Start=s, Finish=e, RAG=rag_v,
                         Status=str(p.get("Status", "")),
                         Sponsor=str(p.get("Sponsor", "")),
                         Approved=_money(p_apr), Actual=_money(p_act),
                         FAC=_money(p_fac), Benefits=_money(p_ben),
                         Target=tgt_str))
        span = e - s
        cs = cur_stage.get(pid); cst = cur_status.get(pid)
        try:
            idx = _STAGES.index(cs) if cs in _STAGES else -1
        except Exception:
            idx = -1
        if idx >= 0:
            frac = (idx + 0.5) / n_stages
        else:
            pp = pd.to_numeric(p.get("Progress %"), errors="coerce")
            frac = (float(pp) / 100.0) if not pd.isna(pp) else 0.0
        frac = max(0.0, min(1.0, frac))
        cur_x = s + span * frac
        progress_bars.append((s, cur_x, label, _RAG_DARK.get(rag_v, "#1e293b")))
        progress_text.append((s + span * frac / 2, label, f"{int(frac*100)}%"))
        for i, stg in enumerate(_STAGES):
            x = s + span * ((i + 0.5) / n_stages)
            if stg == cs:
                gate_rows["current"].append((x, label, stg,
                    _GATE_STATUS_COLOR.get(cst, "#94a3b8"), cst))
            else:
                gate_rows["planned"].append((x, label, stg))
        if not pd.isna(tgt):
            gate_rows["target"].append((tgt, label, tgt_str))

    if not rows:
        return None

    gdf = pd.DataFrame(rows)
    chart_height = max(340, 64 * len(gdf) + 160)
    gfig = _px.timeline(
        gdf, x_start="Start", x_end="Finish", y="Project",
        color="RAG", color_discrete_map=_RAG_COLOR_EX,
        hover_data=["Status", "Sponsor", "Approved", "Actual", "FAC", "Benefits", "Target"],
        title=f"{bucket} — Project Timelines (planned span · dark overlay = actual progress)",
        opacity=0.45)
    gfig.update_yaxes(autorange="reversed", automargin=True)
    gfig.update_layout(**_plotly_layout(height=chart_height))
    gfig.add_vline(x=pd.Timestamp(_dt.now().date()),
                   line=dict(color="#ef4444", dash="dash", width=2))

    for s_, cur_x, lab, col in progress_bars:
        gfig.add_trace(_go.Bar(
            x=[(cur_x - s_).total_seconds() * 1000], base=[s_], y=[lab],
            orientation="h", marker=dict(color=col), width=0.55,
            showlegend=False, hoverinfo="skip"))
    if progress_text:
        tx, ty, tt = zip(*progress_text)
        gfig.add_trace(_go.Scatter(
            x=list(tx), y=list(ty), mode="text", text=list(tt),
            textfont=dict(size=11, color="#f8fafc", family="Arial Black"),
            showlegend=False, hoverinfo="skip"))
    if gate_rows["planned"]:
        px_, py_, pt_ = zip(*gate_rows["planned"])
        gfig.add_trace(_go.Scatter(
            x=list(px_), y=list(py_), mode="markers+text",
            marker=dict(symbol="line-ns", size=14, color="#cbd5e1",
                        line=dict(color="#cbd5e1", width=2)),
            text=[s[:1] for s in pt_], textposition="top center",
            textfont=dict(size=8, color="#94a3b8"),
            name="Gate (planned)", legendgroup="planned",
            hovertext=[f"Gate: {s}" for s in pt_], hoverinfo="text"))
    if gate_rows["current"]:
        cx, cy, ct, cc, cstat = zip(*gate_rows["current"])
        gfig.add_trace(_go.Scatter(
            x=list(cx), y=list(cy), mode="markers+text",
            marker=dict(symbol="diamond", size=18, color=list(cc),
                        line=dict(color="white", width=2)),
            text=list(ct), textposition="top center",
            textfont=dict(size=10, color="#e2e8f0", family="Arial Black"),
            name="Current Gate", legendgroup="current",
            hovertext=[f"Current Gate: {s}<br>Status: {st_}"
                       for s, st_ in zip(ct, cstat)], hoverinfo="text"))
    if gate_rows["target"]:
        tx, ty, ttxt = zip(*gate_rows["target"])
        gfig.add_trace(_go.Scatter(
            x=list(tx), y=list(ty), mode="markers",
            marker=dict(symbol="star", size=16, color="#fbbf24",
                        line=dict(color="#b45309", width=1)),
            name="🎯 Target Date",
            hovertext=[f"Target Date: {t}" for t in ttxt],
            hoverinfo="text"))
    gfig.update_layout(barmode="overlay")
    _add_month_year_axis(gfig)
    _apply_fy(gfig)
    return gfig


def render_bucket_timelines(flt: pd.DataFrame, data: dict, view_label: str,
                            key_prefix: str = "tl") -> None:
    """Render one bucket-timeline section for the chosen view."""
    if view_label not in VIEW_OPTIONS:
        st.info(f"Unknown view: {view_label}"); return
    group_col, icon = VIEW_OPTIONS[view_label]
    if group_col not in flt.columns or not flt[group_col].notna().any():
        st.info(f"No `{group_col}` data available for this view.")
        return


    # Governance lookup for current stage/status per project
    gov_df = data.get("governance", pd.DataFrame()) if isinstance(data, dict) else pd.DataFrame()
    cur_stage, cur_status = {}, {}
    if isinstance(gov_df, pd.DataFrame) and not gov_df.empty:
        for _, _r in gov_df.iterrows():
            cur_stage[_r.get("Project ID")] = _r.get("Stage")
            cur_status[_r.get("Project ID")] = _r.get("Gate Status")

    st.markdown(f"<div class='section-frame'>"
                f"<div class='section-title'>{view_label} — click a group to expand its project timelines</div>",
                unsafe_allow_html=True)
    st.markdown("""
    <style>
    .pv-card{border:1px solid rgba(148,163,184,0.25);border-radius:10px;padding:10px 14px;margin-bottom:6px;
      background:linear-gradient(90deg, rgba(59,130,246,0.06), rgba(148,163,184,0.02));}
    .pv-row{display:flex;flex-wrap:wrap;gap:18px;align-items:center;}
    .pv-kv{font-size:12px;opacity:0.85;} .pv-kv b{font-size:14px;display:block;}
    </style>
    """, unsafe_allow_html=True)

    pv = flt.copy()
    pv[group_col] = pv[group_col].fillna("Unassigned").astype(str)
    n_stages = len(_STAGES)

    for bucket in sorted(pv[group_col].unique()):
        sub = pv[pv[group_col] == bucket]
        if sub.empty: continue
        apr = float(pd.to_numeric(sub.get("Approved Funding"), errors="coerce").fillna(0).sum())
        act = float(pd.to_numeric(sub.get("Actual Spend"),     errors="coerce").fillna(0).sum())
        fac = float(pd.to_numeric(sub.get("Forecast At Completion"), errors="coerce").fillna(0).sum())
        ben = float(pd.to_numeric(sub.get("Benefits Realised"), errors="coerce").fillna(0).sum())
        rags = sub.get("RAG", pd.Series(dtype=str)).astype(str)
        g = (rags=="Green").sum(); a = (rags=="Amber").sum(); r = (rags=="Red").sum()
        util = (act/apr*100) if apr > 0 else 0
        st.markdown(f"""
        <div class='pv-card'><div class='pv-row'>
          <div style='font-size:16px;font-weight:700;min-width:200px;'>{icon} {bucket}</div>
          <div class='pv-kv'>Projects<b>{len(sub)}</b></div>
          <div class='pv-kv'>Approved<b>{_money(apr)}</b></div>
          <div class='pv-kv'>Actual<b>{_money(act)}</b></div>
          <div class='pv-kv'>FAC<b>{_money(fac)}</b></div>
          <div class='pv-kv'>Utilisation<b>{util:.0f}%</b></div>
          <div class='pv-kv'>Benefits<b>{_money(ben)}</b></div>
          <div class='pv-kv'>RAG<b>🟢 {g} &nbsp; 🟡 {a} &nbsp; 🔴 {r}</b></div>
        </div></div>
        """, unsafe_allow_html=True)

        with st.expander(f"▾ Show project timelines for {bucket} ({len(sub)} projects)", expanded=False):
            rows, progress_bars, progress_text = [], [], []
            gate_rows = {"planned": [], "current": [], "target": []}
            for _, p in sub.iterrows():
                s = pd.to_datetime(p.get("Start Date"), errors="coerce")
                e = pd.to_datetime(p.get("Go Live Date") or p.get("End Date"), errors="coerce")
                if pd.isna(s) or pd.isna(e): continue
                p_apr = pd.to_numeric(p.get("Approved Funding"), errors="coerce")
                p_act = pd.to_numeric(p.get("Actual Spend"),     errors="coerce")
                p_fac = pd.to_numeric(p.get("Forecast At Completion"), errors="coerce")
                p_ben = pd.to_numeric(p.get("Benefits Realised"), errors="coerce")
                pid = p.get("Project ID")
                tgt = _target_date(p)
                tgt_str = tgt.strftime("%Y-%m-%d") if not pd.isna(tgt) else "—"
                rag_v = str(p.get("RAG",""))
                pid_link = (f"<a href='/Project_Infographic?project_id={pid}' "
                            f"style='color:#3b82f6;text-decoration:underline'>{pid}</a>"
                            if pid else "NA")
                label = (f"{pid_link} — {p.get('Project Name','')}  "
                         f"[Apr {_money(p_apr)} · Act {_money(p_act)} · "
                         f"FAC {_money(p_fac)} · Ben {_money(p_ben)} · 🎯 {tgt_str}]")
                rows.append(dict(Project=label, Start=s, Finish=e, RAG=rag_v,
                                 Status=str(p.get("Status","")),
                                 Sponsor=str(p.get("Sponsor","")),
                                 Approved=_money(p_apr), Actual=_money(p_act),
                                 FAC=_money(p_fac), Benefits=_money(p_ben),
                                 Target=tgt_str))
                span = e - s
                cs = cur_stage.get(pid); cst = cur_status.get(pid)
                try:
                    idx = _STAGES.index(cs) if cs in _STAGES else -1
                except Exception:
                    idx = -1
                if idx >= 0:
                    frac = (idx + 0.5) / n_stages
                else:
                    pp = pd.to_numeric(p.get("Progress %"), errors="coerce")
                    frac = (float(pp)/100.0) if not pd.isna(pp) else 0.0
                frac = max(0.0, min(1.0, frac))
                cur_x = s + span * frac
                progress_bars.append((s, cur_x, label, _RAG_DARK.get(rag_v, "#1e293b")))
                progress_text.append((s + span * frac/2, label, f"{int(frac*100)}%"))

                for i, stg in enumerate(_STAGES):
                    x = s + span * ((i + 0.5) / n_stages)
                    if stg == cs:
                        gate_rows["current"].append((x, label, stg,
                            _GATE_STATUS_COLOR.get(cst, "#94a3b8"), cst))
                    else:
                        gate_rows["planned"].append((x, label, stg))
                if not pd.isna(tgt):
                    gate_rows["target"].append((tgt, label, tgt_str))

            if not rows:
                st.info("No timeline data for this group."); continue

            gdf = pd.DataFrame(rows)
            chart_height = max(340, 64*len(gdf) + 160)
            gfig = _px.timeline(
                gdf, x_start="Start", x_end="Finish", y="Project",
                color="RAG", color_discrete_map=_RAG_COLOR_EX,
                hover_data=["Status","Sponsor","Approved","Actual","FAC","Benefits","Target"],
                title=f"{bucket} — Project Timelines (planned span · dark overlay = actual progress)",
                opacity=0.45)
            gfig.update_yaxes(autorange="reversed", automargin=True)
            gfig.update_layout(**_plotly_layout(height=chart_height))
            gfig.add_vline(x=pd.Timestamp(_dt.now().date()),
                           line=dict(color="#ef4444", dash="dash", width=2))

            for s_, cur_x, lab, col in progress_bars:
                gfig.add_trace(_go.Bar(
                    x=[(cur_x - s_).total_seconds()*1000], base=[s_], y=[lab],
                    orientation="h", marker=dict(color=col), width=0.55,
                    showlegend=False, hoverinfo="skip"))
            if progress_text:
                tx, ty, tt = zip(*progress_text)
                gfig.add_trace(_go.Scatter(
                    x=list(tx), y=list(ty), mode="text", text=list(tt),
                    textfont=dict(size=11, color="#f8fafc", family="Arial Black"),
                    showlegend=False, hoverinfo="skip"))

            if gate_rows["planned"]:
                px_, py_, pt_ = zip(*gate_rows["planned"])
                gfig.add_trace(_go.Scatter(
                    x=list(px_), y=list(py_), mode="markers+text",
                    marker=dict(symbol="line-ns", size=14, color="#cbd5e1",
                                line=dict(color="#cbd5e1", width=2)),
                    text=[s[:1] for s in pt_], textposition="top center",
                    textfont=dict(size=8, color="#94a3b8"),
                    name="Gate (planned)", legendgroup="planned",
                    hovertext=[f"Gate: {s}" for s in pt_], hoverinfo="text"))
            if gate_rows["current"]:
                cx, cy, ct, cc, cstat = zip(*gate_rows["current"])
                gfig.add_trace(_go.Scatter(
                    x=list(cx), y=list(cy), mode="markers+text",
                    marker=dict(symbol="diamond", size=18, color=list(cc),
                                line=dict(color="white", width=2)),
                    text=list(ct), textposition="top center",
                    textfont=dict(size=10, color="#e2e8f0", family="Arial Black"),
                    name="Current Gate", legendgroup="current",
                    hovertext=[f"Current Gate: {s}<br>Status: {st_}"
                               for s, st_ in zip(ct, cstat)], hoverinfo="text"))
            if gate_rows["target"]:
                tx, ty, ttxt = zip(*gate_rows["target"])
                gfig.add_trace(_go.Scatter(
                    x=list(tx), y=list(ty), mode="markers",
                    marker=dict(symbol="star", size=16, color="#fbbf24",
                                line=dict(color="#b45309", width=1)),
                    name="🎯 Target Date",
                    hovertext=[f"Target Date: {t}" for t in ttxt],
                    hoverinfo="text"))

            gfig.update_layout(barmode="overlay")
            _add_month_year_axis(gfig)
            _apply_fy(gfig)
            st.plotly_chart(gfig, use_container_width=True,
                            config={"displayModeBar": False},
                            key=f"{key_prefix}_{view_label}_{bucket}")

    st.markdown("</div>", unsafe_allow_html=True)
