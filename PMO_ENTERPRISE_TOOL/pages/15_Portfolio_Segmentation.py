"""Portfolio Segmentation — separate views per portfolio bucket with filters."""
from __future__ import annotations
import pandas as pd
import streamlit as st
from utils import auth as _auth; _auth.login_gate()
import plotly.express as px

from utils.excel_loader import load_all
from utils.theme_manager import apply_theme, render_sheet, plotly_layout
from utils.portfolio_engine import segment_summary, compute_project_health

apply_theme()

st.title("🗂️ Portfolio Segmentation")
st.caption("Drill into each portfolio bucket. Apply filters to slice across the enterprise.")

data = load_all()
projects = data.get("projects", pd.DataFrame())
stagegates = data.get("stagegates", pd.DataFrame())

if projects.empty:
    st.warning("No projects loaded."); st.stop()

projects = compute_project_health(projects, stagegates)

# ────────── filters (inline, no extra expander panel) ──────────
def _opts(col): return sorted(projects[col].dropna().astype(str).unique().tolist()) if col in projects.columns else []
c1, c2, c3, c4 = st.columns(4)
fy   = c1.multiselect("Financial Year", _opts("Financial Year"))
bu   = c2.multiselect("Business Unit",  _opts("Business Unit"))
sp   = c3.multiselect("Sponsor",        _opts("Sponsor"))
dl   = c4.multiselect("Delivery Lead",  _opts("Delivery Lead"))
c5, c6, c7, c8 = st.columns(4)
theme= c5.multiselect("Strategic Theme",_opts("Theme"))
prog = c6.multiselect("Program",        _opts("Program"))
stat = c7.multiselect("Status",         _opts("Status"))
rag  = c8.multiselect("RAG",            _opts("RAG"))
c9, c10, _, _ = st.columns(4)
ftype= c9.multiselect("Funding Type",   _opts("Funding Type"))
ch   = c10.multiselect("Governance Channel", _opts("Governance Channel"))

f = projects.copy()
for col, sel in [("Financial Year",fy),("Business Unit",bu),("Sponsor",sp),
                 ("Delivery Lead",dl),("Theme",theme),("Program",prog),
                 ("Status",stat),("RAG",rag),("Funding Type",ftype),
                 ("Governance Channel",ch)]:
    if sel and col in f.columns:
        f = f[f[col].astype(str).isin(sel)]

# ────────── segment cards ──────────
st.markdown("### Segment Summary")
seg = segment_summary(f)
render_sheet(seg)

cA, cB = st.columns(2)
with cA:
    if not seg.empty:
        fig = px.bar(seg[seg["Portfolio"] != "All Portfolio"],
                     x="Portfolio", y="Approved Funding",
                     color="Portfolio", title="Approved Funding by Portfolio")
        fig.update_layout(**plotly_layout(height=320))
        st.plotly_chart(fig, use_container_width=True)
with cB:
    if not seg.empty:
        melt = seg[seg["Portfolio"] != "All Portfolio"].melt(
            id_vars="Portfolio", value_vars=["Green","Amber","Red"],
            var_name="RAG", value_name="Count")
        fig = px.bar(melt, x="Portfolio", y="Count", color="RAG",
                     color_discrete_map={"Green":"#22c55e","Amber":"#f59e0b","Red":"#ef4444"},
                     title="RAG Mix by Portfolio")
        fig.update_layout(**plotly_layout(height=320), barmode="stack")
        st.plotly_chart(fig, use_container_width=True)

# ────────── per-bucket collapsible detail (mirrors Executive Dashboard) ──────────
import plotly.graph_objects as _go
from datetime import datetime as _dt
from config import STAGES as _STAGES
from utils.fy_axis import apply_fy_quarter_axis as _apply_fy

_RAG_COLOR_EX = {"Green":"#22c55e","Amber":"#f59e0b","Red":"#ef4444","Blue":"#3b82f6"}
_RAG_DARK     = {"Green":"#15803d","Amber":"#b45309","Red":"#991b1b","Blue":"#1d4ed8"}
_GATE_STATUS_COLOR = {"Approved":"#22c55e","Pending":"#f59e0b","Rejected":"#ef4444",
                      "In Progress":"#3b82f6","Complete":"#22c55e"}

def _money_ex(v):
    try: return f"${float(v):,.0f}"
    except Exception: return "—"

def _target_date(p):
    for k in ("Target Date","Target Go-Live","Go Live Date","End Date"):
        v = pd.to_datetime(p.get(k), errors="coerce")
        if not pd.isna(v): return v
    return pd.NaT

# Per-project current gate lookup
_gov_df = data.get("governance", pd.DataFrame())
_cur_stage, _cur_status = {}, {}
if isinstance(_gov_df, pd.DataFrame) and not _gov_df.empty:
    for _, _r in _gov_df.iterrows():
        _cur_stage[_r.get("Project ID")] = _r.get("Stage")
        _cur_status[_r.get("Project ID")] = _r.get("Gate Status")

st.markdown("### Portfolio View — click a portfolio to expand its project timelines")
st.markdown("""
<style>
.pv-card{border:1px solid rgba(148,163,184,0.25);border-radius:10px;padding:10px 14px;margin-bottom:6px;
  background:linear-gradient(90deg, rgba(59,130,246,0.06), rgba(148,163,184,0.02));}
.pv-row{display:flex;flex-wrap:wrap;gap:18px;align-items:center;}
.pv-kv{font-size:12px;opacity:0.85;} .pv-kv b{font-size:14px;display:block;}
</style>
""", unsafe_allow_html=True)

pv = f.copy()
if "Portfolio Category" not in pv.columns:
    st.info("No 'Portfolio Category' column available."); st.stop()
pv["Portfolio Category"] = pv["Portfolio Category"].fillna("Unassigned").astype(str)

for bucket in sorted(pv["Portfolio Category"].unique()):
    sub = pv[pv["Portfolio Category"] == bucket]
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
      <div style='font-size:16px;font-weight:700;min-width:200px;'>📁 {bucket}</div>
      <div class='pv-kv'>Projects<b>{len(sub)}</b></div>
      <div class='pv-kv'>Approved<b>{_money_ex(apr)}</b></div>
      <div class='pv-kv'>Actual<b>{_money_ex(act)}</b></div>
      <div class='pv-kv'>FAC<b>{_money_ex(fac)}</b></div>
      <div class='pv-kv'>Utilisation<b>{util:.0f}%</b></div>
      <div class='pv-kv'>Benefits<b>{_money_ex(ben)}</b></div>
      <div class='pv-kv'>RAG<b>🟢 {g} &nbsp; 🟡 {a} &nbsp; 🔴 {r}</b></div>
    </div></div>
    """, unsafe_allow_html=True)

    with st.expander(f"▾ Show project timelines for {bucket} ({len(sub)} projects)", expanded=False):
        rows = []
        progress_bars = []   # (start, current_x, label, dark_color)
        progress_text = []   # (mid_x, label, "NN%")
        gate_rows = {"planned": [], "current": [], "target": []}
        n_stages = len(_STAGES)
        for _, p in sub.iterrows():
            s = pd.to_datetime(p.get("Start Date"), errors="coerce")
            e = pd.to_datetime(p.get("Go Live Date") or p.get("End Date"), errors="coerce")
            if pd.isna(s) or pd.isna(e): continue
            p_apr = pd.to_numeric(p.get("Approved Funding"), errors="coerce")
            p_act = pd.to_numeric(p.get("Actual Spend"),     errors="coerce")
            p_fac = pd.to_numeric(p.get("Forecast At Completion"), errors="coerce")
            p_ben = pd.to_numeric(p.get("Benefits Realised"), errors="coerce")
            pid = p.get("Project ID")
            tgt = _target_date(p); tgt_str = tgt.strftime("%Y-%m-%d") if not pd.isna(tgt) else "—"
            rag_v = str(p.get("RAG",""))
            label = (f"{pid} — {p.get('Project Name','')}  "
                     f"[Apr {_money_ex(p_apr)} · Act {_money_ex(p_act)} · "
                     f"FAC {_money_ex(p_fac)} · Ben {_money_ex(p_ben)} · 🎯 {tgt_str}]")
            rows.append(dict(Project=label, Start=s, Finish=e, RAG=rag_v,
                             Status=str(p.get("Status","")), Sponsor=str(p.get("Sponsor","")),
                             Approved=_money_ex(p_apr), Actual=_money_ex(p_act),
                             FAC=_money_ex(p_fac), Benefits=_money_ex(p_ben), Target=tgt_str))

            span = e - s
            cs = _cur_stage.get(pid); cst = _cur_status.get(pid)
            # progress fraction = stages completed (current stage counted as half)
            try:
                idx = _STAGES.index(cs) if cs in _STAGES else -1
            except Exception:
                idx = -1
            if idx >= 0:
                frac = (idx + 0.5) / n_stages
            else:
                # fall back to explicit Progress % column
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
            st.info("No timeline data for this portfolio."); continue

        gdf = pd.DataFrame(rows)
        gfig = px.timeline(gdf, x_start="Start", x_end="Finish", y="Project",
                           color="RAG", color_discrete_map=_RAG_COLOR_EX,
                           hover_data=["Status","Sponsor","Approved","Actual","FAC","Benefits","Target"],
                           title=f"{bucket} — Project Timelines", opacity=0.45)
        gfig.update_yaxes(autorange="reversed")
        lay = plotly_layout(height=max(280, 46*len(gdf)+110))
        gfig.update_layout(**lay)
        gfig.add_vline(x=pd.Timestamp(_dt.now().date()),
                       line=dict(color="#ef4444", dash="dash", width=2))

        # Darker overlay bar up to current stage gate
        for s_, cur_x, lab, col in progress_bars:
            gfig.add_trace(_go.Bar(
                x=[(cur_x - s_).total_seconds()*1000], base=[s_], y=[lab],
                orientation="h", marker=dict(color=col), width=0.55,
                showlegend=False, hoverinfo="skip"))
        # Progress text labels
        if progress_text:
            tx, ty, tt = zip(*progress_text)
            gfig.add_trace(_go.Scatter(
                x=list(tx), y=list(ty), mode="text", text=list(tt),
                textfont=dict(size=11, color="#f8fafc", family="Arial Black"),
                showlegend=False, hoverinfo="skip"))

        # Planned gate ticks
        if gate_rows["planned"]:
            px_, py_, pt_ = zip(*gate_rows["planned"])
            gfig.add_trace(_go.Scatter(
                x=list(px_), y=list(py_), mode="markers+text",
                marker=dict(symbol="line-ns", size=14, color="#cbd5e1",
                            line=dict(color="#cbd5e1", width=2)),
                text=[s[:1] for s in pt_], textposition="top center",
                textfont=dict(size=8, color="#94a3b8"),
                name="Gate (planned)", hovertext=[f"Gate: {s}" for s in pt_], hoverinfo="text"))
        # Current gate diamonds
        if gate_rows["current"]:
            cx, cy, ct, cc, cstat = zip(*gate_rows["current"])
            gfig.add_trace(_go.Scatter(
                x=list(cx), y=list(cy), mode="markers+text",
                marker=dict(symbol="diamond", size=18, color=list(cc),
                            line=dict(color="white", width=2)),
                text=list(ct), textposition="top center",
                textfont=dict(size=10, color="#e2e8f0", family="Arial Black"),
                name="Current Gate",
                hovertext=[f"Current Gate: {s}<br>Status: {st_}" for s, st_ in zip(ct, cstat)],
                hoverinfo="text"))
        # Target date markers
        if gate_rows["target"]:
            tx, ty, ttxt = zip(*gate_rows["target"])
            gfig.add_trace(_go.Scatter(
                x=list(tx), y=list(ty), mode="markers",
                marker=dict(symbol="star", size=16, color="#fbbf24",
                            line=dict(color="#b45309", width=1)),
                name="🎯 Target Date",
                hovertext=[f"Target Date: {t}" for t in ttxt], hoverinfo="text"))

        gfig.update_layout(barmode="overlay")
        _apply_fy(gfig)
        st.plotly_chart(gfig, use_container_width=True, config={"displayModeBar": False})

