"""Project Infographic — executive single-project view."""
from __future__ import annotations
import pandas as pd
import streamlit as st
from utils import auth as _auth; _auth.login_gate()
import plotly.express as px
import plotly.graph_objects as go

from utils.excel_loader import load_all
from utils.theme_manager import apply_theme, render_sheet, plotly_layout, get_theme
from utils.portfolio_engine import compute_project_health

apply_theme()

data = load_all()
proj = data.get("projects", pd.DataFrame())
gov  = data.get("governance", pd.DataFrame())
sg   = data.get("stagegates", pd.DataFrame())
ben  = data.get("benefits", pd.DataFrame())
ms   = data.get("milestones", pd.DataFrame())
raid = data.get("raid", pd.DataFrame())

if proj.empty:
    st.warning("No projects loaded."); st.stop()

proj = compute_project_health(proj, sg)
names = proj["Project Name"].astype(str).tolist()

# Support deep-links from other pages: ?project_id=PROJ-001
_default_idx = 0
try:
    _qp_pid = st.query_params.get("project_id")
    if isinstance(_qp_pid, list):
        _qp_pid = _qp_pid[0] if _qp_pid else None
    if _qp_pid and "Project ID" in proj.columns:
        _match = proj[proj["Project ID"].astype(str).str.strip() == str(_qp_pid).strip()]
        if not _match.empty:
            _default_idx = names.index(str(_match["Project Name"].iloc[0]))
except Exception:
    pass

sel = st.selectbox("Select project", names, index=_default_idx)
p = proj[proj["Project Name"] == sel].iloc[0]

st.title(f"🪪 {p['Project Name']}")
st.caption(f"{p.get('Program','')} · {p.get('Portfolio Category','')} · {p.get('Governance Channel','')}")

# Header strip
hdr = st.columns(6)
for col, (l, v) in zip(hdr, [
    ("Sponsor", p.get("Sponsor","")), ("Delivery Lead", p.get("Delivery Lead","")),
    ("Stage", gov[gov["Project ID"] == p["Project ID"]]["Stage"].iloc[0] if not gov.empty and (gov["Project ID"]==p["Project ID"]).any() else "—"),
    ("Overall RAG", p.get("Overall RAG","")),
    ("Progress %", f"{p.get('Progress %','')}%"),
    ("Channel", p.get("Governance Channel","")),
]):
    col.markdown(f"<div class='kpi-card'><div class='kpi-label'>{l}</div>"
                 f"<div class='kpi-value'>{v}</div></div>", unsafe_allow_html=True)

# Funding gauges
st.markdown("### Funding")
fcols = st.columns(4)
approved = float(p.get("Approved Funding", 0) or 0)
actual   = float(p.get("Actual Spend", 0) or 0)
forecast = float(p.get("Forecast At Completion", 0) or 0)
remain   = approved - actual
for col, (l, v) in zip(fcols, [("Approved",approved),("Actual",actual),
                               ("Forecast",forecast),("Remaining",remain)]):
    col.markdown(f"<div class='kpi-card'><div class='kpi-label'>{l}</div>"
                 f"<div class='kpi-value'>${v/1e6:.2f}M</div></div>", unsafe_allow_html=True)

t = get_theme()
g = go.Figure(go.Indicator(
    mode="gauge+number", value=actual,
    gauge={"axis":{"range":[0, max(approved, forecast, 1)]},
           "bar":{"color":t["accent"]},
           "threshold":{"line":{"color":"#ef4444","width":3},"value":approved}},
    title={"text":"Spend vs Approved Budget"}))
g.update_layout(**plotly_layout(height=260))
st.plotly_chart(g, use_container_width=True)

# Stage gates strip
st.markdown("### Stage Gates")
sg_p = sg[sg["Project ID"] == p["Project ID"]] if not sg.empty else pd.DataFrame()
if not sg_p.empty:
    cols = st.columns(len(sg_p))
    for c, (_, row) in zip(cols, sg_p.iterrows()):
        icon = "✔" if row.get("Status") == "Complete" else "⚪"
        c.markdown(f"<div class='gov-stage'><div class='gov-stage-head'>"
                   f"<span class='gov-dot'>{icon}</span>{row['Stage']}</div>"
                   f"<div class='gov-proj'>{row.get('Status','')}</div></div>",
                   unsafe_allow_html=True)

# ── Project Timeline (gates + milestones + today) ──
st.markdown("### 📅 Project Timeline")
_GATE_COL = {"Complete":"#22c55e","In Progress":"#3b82f6","Pending":"#94a3b8",
             "On Hold":"#f59e0b","Delayed":"#ef4444","Approved":"#22c55e"}
tl = go.Figure()
today = pd.Timestamp(pd.Timestamp.now().date())
# Project span bar
start = pd.to_datetime(p.get("Start Date"), errors="coerce")
end   = pd.to_datetime(p.get("End Date") or p.get("Go Live Date"), errors="coerce")
if pd.notna(start) and pd.notna(end):
    tl.add_trace(go.Scatter(x=[start, end], y=[0,0], mode="lines",
                            line=dict(color="#64748b", width=6),
                            name="Project Span",
                            hovertemplate=f"Start: {start:%d %b %Y}<br>End: {end:%d %b %Y}<extra></extra>"))
# Gate markers
if not sg_p.empty:
    sg_pp = sg_p.copy()
    sg_pp["Planned Gate Date"] = pd.to_datetime(sg_pp["Planned Gate Date"], errors="coerce")
    sg_pp = sg_pp.sort_values("Planned Gate Date")
    for _, r in sg_pp.iterrows():
        if pd.isna(r["Planned Gate Date"]): continue
        status = str(r.get("Status","Pending"))
        col = _GATE_COL.get(status, "#94a3b8")
        tl.add_trace(go.Scatter(
            x=[r["Planned Gate Date"]], y=[0.4], mode="markers+text",
            marker=dict(size=22, color=col, line=dict(color="white", width=2),
                        symbol="diamond" if status=="In Progress" else "circle"),
            text=[r.get("Stage","")], textposition="top center", textfont=dict(size=11),
            name=str(r.get("Stage","")),
            hovertemplate=(f"<b>{r.get('Stage','')}</b><br>Status: {status}"
                           f"<br>Planned: {r['Planned Gate Date']:%d %b %Y}"
                           f"<br>Owner: {r.get('Owner','—')}<extra></extra>"),
            showlegend=False))
# Milestones below the axis
m_p_tl = ms[ms["Project ID"] == p["Project ID"]] if not ms.empty else pd.DataFrame()
if not m_p_tl.empty:
    mm = m_p_tl.copy()
    mm["Planned Date"] = pd.to_datetime(mm["Planned Date"], errors="coerce")
    for _, r in mm.iterrows():
        if pd.isna(r["Planned Date"]): continue
        tl.add_trace(go.Scatter(
            x=[r["Planned Date"]], y=[-0.4], mode="markers+text",
            marker=dict(size=14, color="#a855f7", symbol="triangle-up"),
            text=[r.get("Milestone","")], textposition="bottom center", textfont=dict(size=10),
            hovertemplate=(f"<b>{r.get('Milestone','')}</b><br>"
                           f"Planned: {r['Planned Date']:%d %b %Y}"
                           f"<br>Status: {r.get('Status','—')}<extra></extra>"),
            showlegend=False))
tl.add_vline(x=today, line=dict(color="#ef4444", dash="dash", width=2),
             annotation_text="Today", annotation_position="top")
_lay = plotly_layout(height=320)
_lay.pop("yaxis", None); _lay.pop("xaxis", None); _lay.pop("margin", None)
tl.update_layout(**_lay,
                 yaxis=dict(visible=False, range=[-1.2, 1.4]),
                 xaxis=dict(showgrid=True, gridcolor="rgba(148,163,184,0.2)"),
                 margin=dict(l=10,r=10,t=30,b=10), showlegend=False)
from utils.fy_axis import apply_fy_quarter_axis as _apply_fy
_apply_fy(tl)
st.plotly_chart(tl, use_container_width=True)

st.caption("🔵 Gates (above)  ·  🔺 Milestones (below)  ·  Today = dashed red line")

# ── Stage-Gate Phase Financials ────────────────────────────────────────────
st.markdown("### 💠 Stage Gates & Phase $")
from utils.health import project_phase_summary, project_rollup, rag_chip, RAG_HEX
_phase_all = data.get("phasefinancials", pd.DataFrame())
_phases = project_phase_summary(str(p["Project ID"]), _phase_all)
_rl = project_rollup(p, _phase_all)
st.markdown(
    "**Health:** " +
    rag_chip(_rl["Schedule Health"], f"Schedule · {_rl['Schedule Health']}") + " &nbsp; " +
    rag_chip(_rl["Financial Health"], f"Financial · {_rl['Financial Health']}") + " &nbsp; " +
    rag_chip(_rl["Health"], f"Overall · {_rl['Health']}") +
    f" &nbsp; · &nbsp; **Budget** ${_rl['Budget']/1e6:.2f}M · "
    f"**Actual** ${_rl['Actual']/1e6:.2f}M ({_rl['Consumed %']}%) · "
    f"**Remaining** ${_rl['Remaining']/1e6:.2f}M",
    unsafe_allow_html=True,
)
if _phases.empty:
    st.info("No phase financials yet — open the **Phase Financials** page to plan and track them.")
else:
    pcol1, pcol2 = st.columns([3, 2])
    with pcol1:
        _long = _phases.melt(id_vars=["Stage"],
                             value_vars=["Phase Budget", "Phase Forecast", "Phase Actual Spend"],
                             var_name="Type", value_name="Amount")
        _fig = px.bar(_long, x="Stage", y="Amount", color="Type", barmode="group",
                      color_discrete_map={"Phase Budget": "#3b82f6",
                                          "Phase Forecast": "#8b5cf6",
                                          "Phase Actual Spend": "#f59e0b"})
        _fig.update_layout(**plotly_layout(height=300))
        st.plotly_chart(_fig, use_container_width=True)
    with pcol2:
        _gauge = go.Figure(go.Indicator(
            mode="gauge+number", value=_rl["Actual"],
            number={"prefix": "$", "valueformat": ",.0f"},
            gauge={"axis": {"range": [0, max(_rl["Budget"], _rl["Forecast"], 1)]},
                   "bar": {"color": RAG_HEX[_rl["Financial Health"]]},
                   "threshold": {"line": {"color": "#ef4444", "width": 3},
                                 "value": _rl["Budget"]}},
            title={"text": "Actual vs Budget"}))
        _gauge.update_layout(**plotly_layout(height=300))
        st.plotly_chart(_gauge, use_container_width=True)
    _tbl = _phases[["Stage", "Status", "Planned End", "Actual End",
                    "Phase Budget", "Phase Actual Spend", "Remaining",
                    "Schedule Var (days)", "Health"]].copy()
    for c in ("Phase Budget", "Phase Actual Spend", "Remaining"):
        _tbl[c] = _tbl[c].apply(lambda v: f"${v:,.0f}")
    st.dataframe(_tbl, use_container_width=True, hide_index=True)

# Benefits
st.markdown("### Benefits")
b_p = ben[ben["Project ID"] == p["Project ID"]] if not ben.empty else pd.DataFrame()
if not b_p.empty:
    tot_t = pd.to_numeric(b_p["Target Value"], errors="coerce").fillna(0).sum()
    tot_r = pd.to_numeric(b_p["Realised Value"], errors="coerce").fillna(0).sum()
    bc = st.columns(3)
    bc[0].metric("Expected", f"${tot_t/1e6:.2f}M")
    bc[1].metric("Realised", f"${tot_r/1e6:.2f}M")
    bc[2].metric("Realisation %", f"{(100*tot_r/tot_t if tot_t else 0):.1f}%")
    fig = px.bar(b_p, x="Description", y=["Target Value","Realised Value"],
                 barmode="group", title="Benefits — Target vs Realised")
    fig.update_layout(**plotly_layout(height=320))
    st.plotly_chart(fig, use_container_width=True)
else:
    st.info("No benefits registered against this project.")

# Risks
st.markdown("### Top Risks & Issues")
r_p = raid[raid["Project ID"] == p["Project ID"]] if not raid.empty else pd.DataFrame()
if not r_p.empty:
    render_sheet(r_p.head(10))
else:
    st.info("No RAID items.")

# Milestones
st.markdown("### Upcoming Milestones")
m_p = ms[ms["Project ID"] == p["Project ID"]] if not ms.empty else pd.DataFrame()
if not m_p.empty:
    render_sheet(m_p)

# ─────────────────────────────────────────────────────────────
# 📄 Project Brief (Sections 1 & 2) + 🔗 Document Links
# ─────────────────────────────────────────────────────────────
from utils.data_io import write_sheet, append_row

brief_df = data.get("projectbrief", pd.DataFrame())
links_df = data.get("projectlinks", pd.DataFrame())

pid = str(p["Project ID"])
brief_row = {}
if not brief_df.empty and "Project ID" in brief_df.columns:
    hit = brief_df[brief_df["Project ID"].astype(str) == pid]
    if not hit.empty:
        brief_row = hit.iloc[0].to_dict()

st.markdown("---")
st.markdown(f"## 📄 Project Brief — {p['Project Name']}")

tab1, tab2, tab3 = st.tabs(
    ["Section 1 · Business Owner", "Section 2 · Solution Manager", "🔗 Document Links"]
)

def _v(k, default=""):
    v = brief_row.get(k, default)
    return "" if (v is None or (isinstance(v, float) and pd.isna(v))) else str(v)

with tab1:
    with st.form("brief_section1"):
        c1, c2, c3 = st.columns(3)
        pw = c1.text_input("Portfolio / Workstream", _v("Portfolio / Workstream"))
        sp = c2.text_input("Sponsor", _v("Sponsor") or str(p.get("Sponsor", "")))
        bo = c3.text_input("Business Owner", _v("Business Owner"))
        c4, c5 = st.columns(2)
        bsm = c4.text_input("Business Solution Manager", _v("Business Solution Manager"))
        _sa_opts = ["", "YES", "NO", "NA"]
        _sa_cur = _v("Strategic Alignment") or ""
        sa = c5.selectbox("Strategic Alignment", _sa_opts,
                          index=_sa_opts.index(_sa_cur) if _sa_cur in _sa_opts else 0)
        bg = st.text_area("Background and Context", _v("Background and Context"), height=120)
        op = st.text_area("Opportunity / Problem Statement",
                          _v("Opportunity / Problem Statement"), height=120)
        ob = st.text_area("Objective (SMART)", _v("Objective"), height=100)
        c6, c7 = st.columns(2)
        ins = c6.text_area("What is in Scope?", _v("In Scope"), height=100)
        outs = c7.text_area("What is out of Scope?", _v("Out of Scope"), height=100)
        ac = st.text_area("Assumptions & Constraints",
                          _v("Assumptions & Constraints"), height=100,
                          help="Category · Description · Validation Date")
        km = st.text_area("Key Metrics / Success Measures",
                          _v("Key Metrics / Success Measures"), height=100,
                          help="Benefit Category · Measure · Baseline · Target")
        s1 = st.form_submit_button("💾 Save Section 1")

with tab2:
    with st.form("brief_section2"):
        c1, c2 = st.columns(2)
        atype = c1.text_input("Approval Type", _v("Approval Type"))
        fask = c2.text_input("Funding Ask", _v("Funding Ask"))
        c3, c4 = st.columns(2)
        fsrc = c3.text_input("Funding Source", _v("Funding Source"))
        rask = c4.text_input("Resource Ask", _v("Resource Ask"))
        ecm = st.text_area("Estimate Commentary", _v("Estimate Commentary"), height=100)
        plc = st.text_area("P&L Benefits Commentary", _v("P&L Benefits Commentary"), height=100)
        dm = st.text_area("Summary of Delivery Milestones & Variance",
                          _v("Delivery Milestones"), height=120,
                          help="Output/Milestone · Type [Gold/Silver/Bronze] · Date")
        pr = st.text_area("Project Risks", _v("Project Risks"), height=120,
                          help="Description · Category · Residual · Mitigation · Due · Owner · $ Impact")
        dp = st.text_area("Dependencies", _v("Dependencies"), height=120,
                          help="Delivering · Dependent · Type · Overview · Impact · Due")
        s2 = st.form_submit_button("💾 Save Section 2")

def _save_brief(updates: dict):
    df = brief_df.copy() if not brief_df.empty else pd.DataFrame(columns=["Project ID"])
    if "Project ID" not in df.columns:
        df["Project ID"] = ""
    df["Project ID"] = df["Project ID"].astype(str)
    if (df["Project ID"] == pid).any():
        for k, v in updates.items():
            if k not in df.columns:
                df[k] = ""
            df.loc[df["Project ID"] == pid, k] = v
    else:
        row = {"Project ID": pid, **updates}
        for k in row:
            if k not in df.columns:
                df[k] = ""
        df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
    write_sheet("ProjectBrief", df.fillna(""))

if s1:
    try:
        _save_brief({
            "Portfolio / Workstream": pw, "Sponsor": sp, "Business Owner": bo,
            "Business Solution Manager": bsm, "Strategic Alignment": sa,
            "Background and Context": bg, "Opportunity / Problem Statement": op,
            "Objective": ob, "In Scope": ins, "Out of Scope": outs,
            "Assumptions & Constraints": ac, "Key Metrics / Success Measures": km,
        })
        st.success("Section 1 saved.")
    except Exception as e:
        st.error(f"Save failed: {e}")

if s2:
    try:
        _save_brief({
            "Approval Type": atype, "Funding Ask": fask, "Funding Source": fsrc,
            "Resource Ask": rask, "Estimate Commentary": ecm,
            "P&L Benefits Commentary": plc, "Delivery Milestones": dm,
            "Project Risks": pr, "Dependencies": dp,
        })
        st.success("Section 2 saved.")
    except Exception as e:
        st.error(f"Save failed: {e}")

with tab3:
    st.caption("Attach reference documents (SharePoint, Confluence, OneDrive, etc.)")
    my_links = pd.DataFrame()
    if not links_df.empty and "Project ID" in links_df.columns:
        my_links = links_df[links_df["Project ID"].astype(str) == pid].copy()

    if not my_links.empty:
        for i, lrow in my_links.reset_index(drop=True).iterrows():
            lc1, lc2, lc3, lc4 = st.columns([3, 5, 2, 1])
            lc1.write(f"**{lrow.get('Title','')}**")
            url = str(lrow.get("URL", ""))
            lc2.markdown(f"[{url}]({url})" if url else "—")
            lc3.write(str(lrow.get("Category", "")))
            if lc4.button("🗑", key=f"del_link_{i}"):
                try:
                    full = links_df.copy()
                    mask = ~((full["Project ID"].astype(str) == pid) &
                             (full["Title"].astype(str) == str(lrow.get("Title", ""))) &
                             (full["URL"].astype(str) == url))
                    write_sheet("ProjectLinks", full[mask].fillna(""))
                    st.rerun()
                except Exception as e:
                    st.error(f"Delete failed: {e}")
    else:
        st.info("No links yet.")

    with st.form("add_link"):
        lc1, lc2, lc3 = st.columns([3, 5, 2])
        title = lc1.text_input("Title")
        url_v = lc2.text_input("URL", placeholder="https://…")
        cat = lc3.text_input("Category", placeholder="e.g. Business Case")
        add = st.form_submit_button("➕ Add link")
    if add:
        if not (title and url_v):
            st.warning("Title and URL are required.")
        else:
            try:
                append_row("ProjectLinks", {
                    "Project ID": pid, "Title": title, "URL": url_v,
                    "Category": cat, "Added": pd.Timestamp.now(),
                })
                st.success("Link added.")
                st.rerun()
            except Exception as e:
                st.error(f"Add failed: {e}")

