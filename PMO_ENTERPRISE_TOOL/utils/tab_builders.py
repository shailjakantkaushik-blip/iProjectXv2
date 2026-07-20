"""Centralised builders that produce the exact figures + tables each tab shows.
Both the page renderers and the global PPT exporter use these — guaranteeing
PPT/PDF/Image exports look identical to the live tab.

Each builder returns:
  {"title": str, "subtitle": str,
   "figs":   [(name, plotly.graph_objects.Figure), ...],
   "tables": [(name, pandas.DataFrame), ...],
   "kpis":   [(label, value), ...]}
"""
from __future__ import annotations
import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

from config import STAGES, RAG_COLORS
from utils.chart_factory import (donut_rag, bar_capex_vs_actual, line_monthly_spend,
                                 donut_theme, bar_priority, governance_funnel,
                                 governance_flow_plotly, DARK_LAYOUT)
from utils.kpi_engine import compute_kpis, rag_distribution, by_theme, by_priority, kpi_trends
from utils.risk_engine import score_risks
from utils.roadmap_builder import gantt


# ───────────────────────── 1 · Executive Dashboard ─────────────────────────
def build_executive(data, flt=None):
    projects   = flt if flt is not None else data["projects"]
    financials = data["financials"]
    risks      = data["risks"]
    gov        = data["governance"]
    k = compute_kpis(projects, financials)
    figs = [
        ("Governance Flow",   governance_flow_plotly(gov, projects_df=projects, height=520, max_per_stage=999)),
        ("Portfolio Health",  donut_rag(rag_distribution(projects), height=320)),
        ("CAPEX vs Actual",   bar_capex_vs_actual(k, height=320)),
        ("Monthly Spend",     line_monthly_spend(financials, height=320)),
    ]
    td = by_theme(projects); pd_ = by_priority(projects)
    if not td.empty: figs.append(("By Theme",    donut_theme(td, height=320)))
    if not pd_.empty: figs.append(("By Priority", bar_priority(pd_, height=320)))

    # Top 10 Projects by ROI % — resilient to missing per-project data
    try:
        cb = data.get("costbenefit", pd.DataFrame())
        if cb is not None and not cb.empty:
            cb_f = cb.copy()
            if "Project ID" in cb_f.columns and "Project ID" in projects.columns:
                cb_f = cb_f[cb_f["Project ID"].isin(projects["Project ID"])]
            # Ensure numeric columns exist even on sparse workbooks
            for _col in ("Total Cost", "Total Benefit", "CAPEX", "OPEX",
                          "Benefit Recurring", "Benefit One-Off", "Benefit"):
                if _col in cb_f.columns:
                    cb_f[_col] = pd.to_numeric(cb_f[_col], errors="coerce").fillna(0)
            if "Total Cost" not in cb_f.columns:
                cb_f["Total Cost"] = cb_f.get("CAPEX", 0) + cb_f.get("OPEX", 0)
            if "Total Benefit" not in cb_f.columns:
                cb_f["Total Benefit"] = (cb_f.get("Benefit Recurring", 0)
                                          + cb_f.get("Benefit One-Off", 0))
                if (cb_f["Total Benefit"] == 0).all() and "Benefit" in cb_f.columns:
                    cb_f["Total Benefit"] = cb_f["Benefit"]
            group_cols = [c for c in ("Project ID", "Project Name") if c in cb_f.columns]
            if group_cols:
                per = (cb_f.groupby(group_cols, dropna=False)[["Total Cost","Total Benefit"]]
                            .sum().reset_index())
                # Drop rows with no cost data — they can't produce ROI% and
                # would otherwise hide valid projects behind zeros.
                per = per[per["Total Cost"] > 0].copy()
                if not per.empty:
                    per["ROI %"] = ((per["Total Benefit"] - per["Total Cost"])
                                     / per["Total Cost"] * 100).round(1)
                    if "Project Name" not in per.columns:
                        per["Project Name"] = per["Project ID"]
                    per["Project Name"] = per["Project Name"].fillna(per.get("Project ID", ""))
                    top = per.sort_values("ROI %", ascending=False).head(10) \
                             .sort_values("ROI %", ascending=True)
                    if not top.empty:
                        f_roi = px.bar(top, x="ROI %", y="Project Name", orientation="h",
                                        color="ROI %", color_continuous_scale="RdYlGn",
                                        text=top["ROI %"].round(0).astype(int).astype(str) + "%")
                        f_roi.update_layout(title="Top 10 Projects by ROI %", **DARK_LAYOUT,
                                             height=320, coloraxis_showscale=False)
                        _m = dict(DARK_LAYOUT.get("margin", {}))
                        _m.update(dict(l=10, r=10, t=40, b=10))
                        f_roi.update_layout(margin=_m)
                        f_roi.update_traces(textposition="outside", cliponaxis=False)
                        figs.append(("Top 10 ROI", f_roi))
    except Exception as _e:
        # Never let one bad project block the whole dashboard
        import logging; logging.getLogger(__name__).warning("ROI chart skipped: %s", _e)

    # Portfolio Segmentation — count + approved funding by Portfolio Category
    if "Portfolio Category" in projects.columns and projects["Portfolio Category"].notna().any():
        seg = projects.copy()
        seg["Portfolio Category"] = seg["Portfolio Category"].fillna("Unassigned").astype(str)
        agg = seg.groupby("Portfolio Category").agg(
            Projects=("Project ID", "count"),
            Approved=("Approved Funding", "sum") if "Approved Funding" in seg.columns else ("Project ID", "count"),
        ).reset_index().sort_values("Projects", ascending=False)
        f_seg = px.bar(agg, x="Portfolio Category", y="Projects",
                       color="Portfolio Category",
                       text="Projects",
                       hover_data={"Approved": ":,.0f"} if "Approved Funding" in seg.columns else None,
                       title="Portfolio Segmentation — Projects by Portfolio")
        f_seg.update_layout(**DARK_LAYOUT, height=320, showlegend=False)
        f_seg.update_traces(textposition="outside", cliponaxis=False)
        figs.append(("Portfolio Segmentation", f_seg))

    # Projects by Governance Channel
    if "Governance Channel" in projects.columns and projects["Governance Channel"].notna().any():
        gc = projects.copy()
        gc["Governance Channel"] = gc["Governance Channel"].fillna("Unassigned").astype(str)
        gagg = (gc.groupby("Governance Channel")
                  .agg(Projects=("Project ID", "count"))
                  .reset_index()
                  .sort_values("Projects", ascending=False))
        f_gc = px.bar(gagg, x="Governance Channel", y="Projects",
                      color="Governance Channel", text="Projects",
                      title="Projects by Governance Channel")
        f_gc.update_layout(**DARK_LAYOUT, height=320, showlegend=False)
        f_gc.update_traces(textposition="outside", cliponaxis=False)
        figs.append(("Governance Channel", f_gc))
    top_risks = score_risks(risks).head(5)[
        ["Risk ID","Project ID","Description","Risk Score","Status"]]
    return {
        "title": "1 · Executive Dashboard",
        "subtitle": "Single-screen cockpit",
        "kpis": [
            ("CAPEX Approved", f"${k['capex_approved']/1e6:.1f}M"),
            ("Incurred",       f"${k['cost_incurred']/1e6:.1f}M"),
            ("Forecast",       f"${k['forecast']/1e6:.1f}M"),
            ("Remaining",      f"${k['remaining']/1e6:.1f}M"),
            ("Active",         k["active"]),
            ("Completed",      k["completed"]),
            ("Overdue",        k["overdue"]),
            ("RAG Score",      f"{k['avg_rag']}/5"),
        ],
        "trends": kpi_trends(projects, financials),
        "figs": figs,
        "tables": [("Top Risks", top_risks)],
    }


# ───────────────────────── 2 · Portfolio Roadmap ─────────────────────────
def build_roadmap(data, group_col: str | None = "Portfolio Category"):
    projects = data["projects"]; gov = data["governance"]
    fig = gantt(projects, governance=gov, height=650, group_col=group_col)
    gov_cols = [c for c in ["Project ID","Stage","Gate Status","Next Gate"]
                if c in gov.columns] if not gov.empty else []
    if gov_cols and "Project ID" in projects.columns:
        merged = projects.merge(gov[gov_cols], on="Project ID", how="left")
    else:
        merged = projects.copy()
    for c in ["Stage","Gate Status","Next Gate"]:
        if c not in merged.columns:
            merged[c] = "NA"
    want = ["Project ID","Project Name","Program","Status","RAG",
            "Start Date","End Date","Stage","Gate Status","Next Gate"]
    tbl = merged[[c for c in want if c in merged.columns]]
    return {"title": "2 · Portfolio Roadmap",
            "subtitle": "Gantt grouped by segmentation + current governance gate (◆ marker)",
            "kpis": [("Projects", len(projects)), ("With Gate Data", merged["Stage"].notna().sum())],
            "figs": [("Roadmap with Governance Gates", fig)] if fig else [],
            "tables": [("Roadmap Detail", tbl)]}


# ───────────────────────── 3 · Projects ─────────────────────────
def build_projects(data):
    projects = data["projects"].copy()
    gov      = data.get("governance", pd.DataFrame())
    # Merge governance current phase into the register so users see, per project,
    # which stage gate the project is currently at and its approval status.
    if not gov.empty and "Project ID" in projects.columns and "Project ID" in gov.columns:
        gcols = [c for c in ["Project ID", "Stage", "Gate Status", "Next Gate",
                             "Checklist Complete %"] if c in gov.columns]
        gov_one = (gov[gcols]
                   .dropna(subset=["Project ID"])
                   .drop_duplicates(subset=["Project ID"], keep="first"))
        projects = projects.merge(
            gov_one.rename(columns={"Stage": "Current Phase",
                                    "Gate Status": "Gate Status",
                                    "Next Gate": "Next Gate"}),
            on="Project ID", how="left")
    # Guard: dedupe by Project ID so counts reflect unique projects, not merged rows
    if "Project ID" in projects.columns:
        projects = projects.drop_duplicates(subset=["Project ID"], keep="first")

    rag_fig = donut_rag(rag_distribution(projects), height=320)
    prog = projects.groupby("Program").size().reset_index(name="Count").sort_values("Count", ascending=False)
    fig = px.bar(prog, x="Program", y="Count", color="Count", color_continuous_scale="Blues")
    fig.update_layout(title="Projects by Program", **DARK_LAYOUT, height=320)

    # Phase distribution chart (only if we have governance data)
    figs = [("RAG Distribution", rag_fig), ("Projects by Program", fig)]
    if "Current Phase" in projects.columns and projects["Current Phase"].notna().any():
        phase = (projects["Current Phase"].fillna("Unassigned")
                 .value_counts().reindex(STAGES + ["Unassigned"]).dropna()
                 .reset_index())
        phase.columns = ["Phase", "Count"]
        fph = px.bar(phase, x="Phase", y="Count", color="Count",
                     color_continuous_scale="Tealgrn")
        fph.update_layout(title="Current Governance Phase Distribution",
                          **DARK_LAYOUT, height=320)
        figs.append(("Governance Phase", fph))

    return {"title": "3 · Project Register",
            "subtitle": f"{len(projects)} projects · current phase shown per row",
            "kpis": [("Total", len(projects)),
                     ("Active",    int((projects.get("Status")=="Active").sum())),
                     ("Completed", int((projects.get("Status")=="Completed").sum())),
                     ("Pipeline",  int((projects.get("Status")=="Pipeline").sum()))],
            "figs": figs,
            "tables": [("Project Register (with Current Phase)", projects)]}


# ───────────────────────── 4 · Risks ─────────────────────────
def build_risks(data):
    risks = score_risks(data["risks"])
    figs = []
    if not risks.empty:
        f = px.scatter(risks, x="Probability", y="Impact", size="Risk Score",
                       color="Risk Score", hover_data=["Description","Owner"],
                       color_continuous_scale="Reds")
        f.update_layout(title="Risk Heatmap (P × I)", **DARK_LAYOUT, height=400)
        figs.append(("Risk Heatmap", f))
    return {"title": "4 · Risk Intelligence",
            "subtitle": "Score = Probability × Impact × Velocity",
            "kpis": [("Total Risks", len(risks)),
                     ("Escalated",   int(risks.get("Escalate", pd.Series([])).sum()) if not risks.empty else 0),
                     ("Avg Score",   round(risks["Risk Score"].mean(),1) if not risks.empty else 0)],
            "figs": figs,
            "tables": [("Scored Risks", risks)]}


# ───────────────────────── 5 · Financials ─────────────────────────
def build_financials(data):
    fin = data["financials"]
    if fin.empty:
        return {"title":"5 · Financials","subtitle":"No data","kpis":[],"figs":[],"tables":[]}
    pv = fin["Planned Value"].sum() if "Planned Value" in fin else fin["Forecast"].sum()
    ev = fin["Earned Value"].sum()  if "Earned Value"  in fin else fin["Actual"].sum()*0.9
    ac = fin["Actual"].sum(); bac = fin["Forecast"].sum()
    spi = round(ev/pv,2) if pv else 0; cpi = round(ev/ac,2) if ac else 0
    eac = round(bac/cpi,0) if cpi else 0

    agg = fin.groupby("Project ID")[["CAPEX","OPEX"]].sum().reset_index()
    f1 = px.bar(agg, x="Project ID", y=["CAPEX","OPEX"], barmode="stack",
                color_discrete_sequence=["#3b82f6","#f59e0b"])
    f1.update_layout(title="CAPEX vs OPEX by Project", **DARK_LAYOUT, height=400)

    evm = fin.groupby("Project ID")[["Planned Value","Earned Value","Actual"]].sum().reset_index()
    f2 = px.bar(evm, x="Project ID", y=["Planned Value","Earned Value","Actual"],
                barmode="group", color_discrete_sequence=["#8b5cf6","#22c55e","#f59e0b"])
    f2.update_layout(title="Earned Value Management (PV / EV / AC)", **DARK_LAYOUT, height=400)

    return {"title":"5 · Financial Intelligence",
            "subtitle":"CAPEX / OPEX + EVM",
            "kpis":[("CAPEX",f"${fin['CAPEX'].sum()/1e6:.2f}M"),
                    ("OPEX", f"${fin['OPEX'].sum()/1e6:.2f}M"),
                    ("Actual",f"${ac/1e6:.2f}M"),
                    ("Forecast",f"${bac/1e6:.2f}M"),
                    ("SPI",spi),("CPI",cpi),("EAC",f"${eac/1e6:.2f}M")],
            "figs":[("CAPEX vs OPEX",f1),("EVM",f2)],
            "tables":[("Financials",fin)]}


# ───────────────────────── 6 · Governance ─────────────────────────
def build_governance(data):
    gov = data["governance"]
    if gov.empty:
        return {"title":"6 · Governance","subtitle":"No data","kpis":[],"figs":[],"tables":[]}
    figs = [("Stage Flow", governance_funnel(gov, height=400))]
    if "Checklist Complete %" in gov:
        f = px.bar(gov.sort_values("Checklist Complete %"), x="Project ID",
                   y="Checklist Complete %", color="Gate Status",
                   color_discrete_map={"Approved":"#22c55e","Pending":"#f59e0b","Rejected":"#ef4444"})
        f.update_layout(title="Stage Gate Checklist Completion", **DARK_LAYOUT, height=400)
        figs.append(("Checklist Completion", f))
    return {"title":"6 · Governance — Stage Gates",
            "subtitle":"Idea → Benefits Realisation",
            "kpis":[("Total",len(gov)),
                    ("Approved",int((gov["Gate Status"]=="Approved").sum())),
                    ("Pending", int((gov["Gate Status"]=="Pending").sum())),
                    ("Rejected",int((gov["Gate Status"]=="Rejected").sum()))],
            "figs":figs, "tables":[("Governance",gov)]}


# ───────────────────────── 7 · Resources ─────────────────────────
def build_resources(data):
    res = data["resources"].copy()
    if res.empty:
        return {"title":"7 · Resources","subtitle":"No data","kpis":[],"figs":[],"tables":[]}

    # Utilisation = average monthly allocation per resource (so multi-month
    # rows don't inflate totals). Falls back to sum when Month is absent.
    if "Month" in res.columns and res["Month"].notna().any():
        util = (res.groupby(["Resource","Month"])["Allocation %"].sum()
                    .groupby("Resource").mean().round(1).reset_index())
    else:
        util = res.groupby("Resource")["Allocation %"].sum().reset_index()
    util["Status"] = util["Allocation %"].apply(
        lambda v: "Over" if v>100 else ("Optimal" if v>=60 else "Under"))

    figs = []
    util_sorted = util.sort_values("Allocation %", ascending=False)
    color_map = {"Over": "#ef4444", "Optimal": "#22c55e", "Under": "#f59e0b"}
    fu = px.bar(util_sorted, x="Resource", y="Allocation %", color="Status",
                color_discrete_map=color_map,
                hover_data={"Allocation %": True, "Status": True})
    fu.add_hline(y=100, line_dash="dash", line_color="#ef4444",
                 annotation_text="100% capacity", annotation_position="top right")
    fu.add_hline(y=60,  line_dash="dot",  line_color="#f59e0b",
                 annotation_text="60% floor", annotation_position="bottom right")
    fu.update_layout(title="Resource Utilisation (avg monthly allocation)",
                     **DARK_LAYOUT, height=380, xaxis_tickangle=-45)
    figs.append(("Utilisation", fu))

    # NEW: Month-wise allocation heatmap (Resource × Month)
    monthly_pivot = pd.DataFrame()
    if "Month" in res.columns and res["Month"].notna().any():
        rm = res.copy()
        rm["Month"] = pd.to_datetime(rm["Month"], errors="coerce")
        rm = rm.dropna(subset=["Month"])
        rm["Month Label"] = rm["Month"].dt.strftime("%Y-%m")
        monthly_pivot = rm.pivot_table(index="Resource", columns="Month Label",
                                       values="Allocation %", aggfunc="sum",
                                       fill_value=0).sort_index(axis=1)
        fm = px.imshow(monthly_pivot, color_continuous_scale="RdYlGn_r",
                       aspect="auto", labels=dict(color="Allocation %", x="Month", y="Resource"),
                       zmin=0, zmax=120)
        fm.update_layout(title="Month-wise Allocation Heatmap (Resource × Month)",
                         **DARK_LAYOUT, height=520, xaxis_tickangle=-45)
        figs.append(("Monthly Allocation", fm))

        # Portfolio-wide monthly demand (stacked by project)
        proj_month = (rm.groupby(["Month Label","Project"])["Allocation %"].sum()
                        .reset_index())
        fp = px.bar(proj_month, x="Month Label", y="Allocation %", color="Project",
                    title="Total Monthly Demand by Project")
        fp.update_layout(**DARK_LAYOUT, height=400, xaxis_tickangle=-45,
                         showlegend=False)
        figs.append(("Monthly Demand", fp))

    if "Skill" in res:
        sk = res.groupby("Skill")["Allocation %"].sum().reset_index().sort_values("Allocation %", ascending=False)
        f = px.bar(sk, x="Skill", y="Allocation %", color="Allocation %", color_continuous_scale="Viridis")
        f.update_layout(title="Demand by Skill", **DARK_LAYOUT, height=350)
        figs.append(("Skill Demand", f))

    # Resource × Project totals (kept)
    pivot = res.pivot_table(index="Resource", columns="Project",
                            values="Allocation %", aggfunc="sum", fill_value=0)
    fh = px.imshow(pivot, color_continuous_scale="RdYlGn_r", aspect="auto",
                   labels=dict(color="Allocation %"))
    fh.update_layout(title="Resource × Project Heatmap (total across months)",
                     **DARK_LAYOUT, height=500)
    figs.append(("Heatmap", fh))

    tables = [("Utilisation", util)]
    if not monthly_pivot.empty:
        tables.append(("Monthly Allocation Matrix", monthly_pivot.reset_index()))
    return {"title":"7 · Resource Capacity",
            "subtitle":"Skill-based capacity + monthly allocation",
            "kpis":[("Resources",len(util)),
                    ("Over",     int((util['Status']=="Over").sum())),
                    ("Optimal",  int((util['Status']=="Optimal").sum())),
                    ("Under",    int((util['Status']=="Under").sum()))],
            "figs":figs,"tables":tables}



# ───────────────────────── 8 · Roadmap Analytics ─────────────────────────
def build_analytics(data, mc_iterations=2000):
    projects = data["projects"].copy(); risks = score_risks(data["risks"])
    figs = []
    if "Investment Type" in projects.columns:
        inv = projects.groupby("Investment Type")["Budget"].sum().reset_index()
        f = px.pie(inv, names="Investment Type", values="Budget", hole=.5,
                   color_discrete_sequence=["#3b82f6","#22c55e","#f59e0b"])
        f.update_layout(title="Investment Mix", **DARK_LAYOUT, height=350)
        figs.append(("Investment Mix", f))
    if not risks.empty and "Program" in projects.columns:
        # risks may already carry Program (hydrated); drop to avoid _x/_y collision.
        r = risks.drop(columns=[c for c in ["Program"] if c in risks.columns])
        if "Project ID" in r.columns:
            merged = r.merge(projects[["Project ID","Program"]], on="Project ID", how="left")
            expo = merged.groupby("Program")["Risk Score"].sum().reset_index()
            f = px.bar(expo, x="Program", y="Risk Score", color="Risk Score", color_continuous_scale="Reds")
            f.update_layout(title="Risk Exposure by Program", **DARK_LAYOUT, height=350)
            figs.append(("Risk Exposure", f))
    budget_col = projects["Budget"] if "Budget" in projects.columns else pd.Series([0])
    fcast_col  = projects["Forecast"] if "Forecast" in projects.columns else budget_col
    forecasts = pd.to_numeric(fcast_col, errors="coerce").fillna(
                    pd.to_numeric(budget_col, errors="coerce")).fillna(0).values
    total = float(forecasts.sum()) or 1.0
    sims = np.random.normal(total, 0.15*total, size=mc_iterations)
    p50,p80,p95 = np.percentile(sims,[50,80,95])
    budget = float(pd.to_numeric(budget_col, errors="coerce").fillna(0).sum())
    fm = go.Figure(go.Histogram(x=sims/1e6, nbinsx=40, marker_color="#3b82f6"))
    fm.add_vline(x=budget/1e6, line_color="#22c55e", annotation_text="Approved")
    fm.add_vline(x=p80/1e6,    line_color="#f59e0b", annotation_text="P80")
    fm.update_layout(title="Monte-Carlo Portfolio Cost ($M)", **DARK_LAYOUT, height=380)
    figs.append(("Monte-Carlo", fm))
    return {"title":"8 · Strategic Roadmap Analytics",
            "subtitle":"Investment mix + predictive risk",
            "kpis":[("Approved Budget",f"${budget/1e6:.1f}M"),
                    ("P50",f"${p50/1e6:.1f}M"),
                    ("P80",f"${p80/1e6:.1f}M"),
                    ("P95",f"${p95/1e6:.1f}M")],
            "figs":figs,"tables":[]}


# ───────────────────────── 9 · Dependencies ─────────────────────────
def build_dependencies(data):
    dep = data["dependencies"].copy()
    proj = data["projects"].copy()
    if dep.empty:
        return {"title":"9 · Dependencies","subtitle":"No data","kpis":[],"figs":[],"tables":[]}

    # Resolve project name + portfolio + dates by ID OR Name
    pkey = "Project ID" if "Project ID" in proj.columns else "Project Name"
    pmeta = proj.set_index(pkey)[[c for c in ["Project Name","Portfolio Category","Start Date","End Date","RAG"] if c in proj.columns]]
    def meta(pid, col, default=None):
        try: return pmeta.loc[pid, col]
        except Exception: return default

    dep["From Name"]      = dep["From Project"].map(lambda x: meta(x,"Project Name",x))
    dep["To Name"]        = dep["To Project"].map(lambda x: meta(x,"Project Name",x))
    dep["From Portfolio"] = dep["From Project"].map(lambda x: meta(x,"Portfolio Category","Unassigned"))
    dep["To Portfolio"]   = dep["To Project"].map(lambda x: meta(x,"Portfolio Category","Unassigned"))

    status_color = {"Healthy":"#22c55e","At Risk":"#f59e0b","Blocked":"#ef4444"}

    # ── FIG 1 · Horizontal Gantt timeline with dependency arrows ──
    involved = pd.unique(pd.concat([dep["From Project"], dep["To Project"]]))
    rows = []
    for pid in involved:
        s, e = meta(pid,"Start Date"), meta(pid,"End Date")
        if pd.isna(s) or pd.isna(e): continue
        rows.append({"Project": meta(pid,"Project Name",pid),
                     "PID": pid,
                     "Start": pd.to_datetime(s), "End": pd.to_datetime(e),
                     "Portfolio": meta(pid,"Portfolio Category","Unassigned"),
                     "RAG": meta(pid,"RAG","")})
    tdf = pd.DataFrame(rows)
    f1 = go.Figure()
    if not tdf.empty:
        # Order projects so dependency chains stay adjacent:
        # build undirected components, then within each component do a
        # topological-ish ordering (From → To) seeded by earliest Start.
        from collections import defaultdict, deque
        adj = defaultdict(set); succ = defaultdict(set); indeg = defaultdict(int)
        pids = set(tdf["PID"])
        for _, d in dep.iterrows():
            a, b = d["From Project"], d["To Project"]
            if a in pids and b in pids:
                adj[a].add(b); adj[b].add(a)
                succ[a].add(b); indeg[b] += 1
        seen, order = set(), []
        starts = {r["PID"]: r["Start"] for _, r in tdf.iterrows()}
        # Components ordered by earliest start within them
        comps = []
        for pid in tdf.sort_values("Start")["PID"]:
            if pid in seen: continue
            comp = []; q = deque([pid]); seen.add(pid)
            while q:
                n = q.popleft(); comp.append(n)
                for m in adj[n]:
                    if m not in seen: seen.add(m); q.append(m)
            comps.append(comp)
        for comp in comps:
            cset = set(comp)
            local_indeg = {n: sum(1 for x in cset if n in succ[x]) for n in comp}
            ready = sorted([n for n in comp if local_indeg[n] == 0], key=lambda n: starts.get(n, pd.Timestamp.max))
            placed = set()
            while ready:
                n = ready.pop(0)
                if n in placed: continue
                order.append(n); placed.add(n)
                nxt = sorted([m for m in succ[n] if m in cset and m not in placed],
                             key=lambda m: starts.get(m, pd.Timestamp.max))
                ready = nxt + ready
            for n in comp:
                if n not in placed: order.append(n); placed.add(n)
        tdf = tdf.set_index("PID").loc[order].reset_index()
        # Count incoming/outgoing dependencies per project
        out_cnt = dep.groupby("From Project").size().to_dict()
        in_cnt  = dep.groupby("To Project").size().to_dict()
        tdf["Label"] = tdf.apply(lambda r: f"{r['Project']}  (⇢{out_cnt.get(r['PID'],0)} · ⇠{in_cnt.get(r['PID'],0)})", axis=1)
        ymap = {pid: i for i, pid in enumerate(tdf["PID"])}

        f1 = px.timeline(
            tdf, x_start="Start", x_end="End", y="Label",
            color="Portfolio", color_discrete_sequence=px.colors.qualitative.Safe,
            hover_data={"Project":True,"Portfolio":True,"RAG":True,"Start":"|%b %d, %Y","End":"|%b %d, %Y","Label":False},
            text="Project")
        f1.update_traces(textposition="inside", insidetextanchor="start",
                         marker_line_color="rgba(0,0,0,0.3)", marker_line_width=1)
        # y axis order to match ymap
        ordered_labels = [tdf.loc[tdf["PID"]==pid,"Label"].iloc[0] for pid in ymap]
        f1.update_yaxes(categoryorder="array", categoryarray=ordered_labels[::-1])

        # Dependency arrows between project bars
        for _, d in dep.iterrows():
            if d["From Project"] not in ymap or d["To Project"] not in ymap: continue
            from_label = tdf.loc[tdf["PID"]==d["From Project"],"Label"].iloc[0]
            to_label   = tdf.loc[tdf["PID"]==d["To Project"],"Label"].iloc[0]
            x0 = tdf.loc[tdf["PID"]==d["From Project"],"End"].iloc[0]
            x1 = tdf.loc[tdf["PID"]==d["To Project"],"Start"].iloc[0]
            color = status_color.get(d["Status"],"#9ca3af")
            f1.add_annotation(x=x1, y=to_label, ax=x0, ay=from_label,
                              xref="x", yref="y", axref="x", ayref="y",
                              showarrow=True, arrowhead=3, arrowsize=1.4,
                              arrowwidth=2, arrowcolor=color, opacity=0.9,
                              standoff=4, startstandoff=4)
        # Status legend proxies
        for s, c in status_color.items():
            f1.add_trace(go.Scatter(x=[None], y=[None], mode="lines",
                                    line=dict(color=c, width=3),
                                    name=f"Dep: {s}", showlegend=True))
        _lay1 = dict(DARK_LAYOUT)
        _lay1.pop("xaxis", None); _lay1.pop("yaxis", None); _lay1.pop("margin", None)
        f1.update_layout(
            title="Dependency Timeline — horizontal Gantt with interdependency arrows",
            height=max(420, 38*len(tdf)+180),
            xaxis=dict(type="date", title="", showgrid=True, gridcolor="rgba(125,125,125,0.15)"),
            yaxis=dict(title=""),
            legend=dict(orientation="h", yanchor="bottom", y=1.02),
            margin=dict(l=10, r=10, t=60, b=10),
            **_lay1)
        from utils.fy_axis import apply_fy_quarter_axis
        apply_fy_quarter_axis(f1)



    # ── FIG 2 · Portfolio segmentation of dependencies (cross-portfolio flow) ──
    seg = dep.groupby(["From Portfolio","To Portfolio","Status"]).size().reset_index(name="Count")
    f2 = px.bar(seg, x="From Portfolio", y="Count", color="Status",
                facet_col="To Portfolio", text="Count",
                color_discrete_map=status_color)
    f2.update_layout(title="Cross-Portfolio Dependencies (From → To)",
                     height=380, **DARK_LAYOUT)
    f2.for_each_annotation(lambda a: a.update(text=a.text.split("=")[-1]))

    # ── FIG 3 · Status × Type summary (kept, simpler) ──
    sc = dep.groupby(["Status","Dependency Type"]).size().reset_index(name="Count")
    f3 = px.bar(sc, x="Dependency Type", y="Count", color="Status",
                text="Count", color_discrete_map=status_color, barmode="group")
    f3.update_layout(title="Dependencies by Type & Status", **DARK_LAYOUT, height=340)

    table = dep[["From Name","From Portfolio","To Name","To Portfolio",
                 "Dependency Type","Status","Impact"]].rename(
                 columns={"From Name":"From","To Name":"To"})

    return {"title":"9 · Cross-Project Dependencies",
            "subtitle":f"{len(dep)} links across {len(involved)} projects",
            "kpis":[("Total Links",len(dep)),
                    ("Projects Involved",len(involved)),
                    ("Healthy",int((dep['Status']=="Healthy").sum())),
                    ("At Risk",int((dep['Status']=="At Risk").sum())),
                    ("Blocked",int((dep['Status']=="Blocked").sum()))],
            "figs":[("Timeline",f1),("Portfolio Segmentation",f2),("By Type & Status",f3)],
            "tables":[("Dependencies",table)]}


# ───────────────────────── 10 · Demand Pipeline ─────────────────────────
def build_pipeline(data):
    pipe = data["pipeline"]
    if pipe.empty:
        return {"title":"10 · Pipeline","subtitle":"No data","kpis":[],"figs":[],"tables":[]}
    f1 = px.bar(pipe.sort_values("Priority Score", ascending=True),
                x="Priority Score", y="Name", orientation="h",
                color="Decision",
                color_discrete_map={"Approved":"#22c55e","Under Review":"#f59e0b",
                                    "Rejected":"#ef4444","New":"#3b82f6","Parked":"#8b5cf6"})
    f1.update_layout(title="Prioritised Demand Backlog", **DARK_LAYOUT, height=500)
    f2 = px.scatter(pipe, x="Effort (1-5)", y="Value (1-5)", size="Est. Budget ($K)",
                    color="Decision", hover_data=["Name","Priority Score"])
    f2.update_layout(title="Value vs Effort", **DARK_LAYOUT, height=400)
    return {"title":"10 · Demand Pipeline",
            "subtitle":"Scored intake",
            "kpis":[("Ideas",len(pipe)),
                    ("Approved",int((pipe['Decision']=="Approved").sum())),
                    ("Avg Score",round(pipe['Priority Score'].mean(),1))],
            "figs":[("Backlog",f1),("Value vs Effort",f2)],
            "tables":[("Pipeline",pipe)]}


# ───────────────────────── 11 · Cost vs Benefit ─────────────────────────
def build_costbenefit(data):
    cb = data.get("costbenefit", pd.DataFrame())
    if cb.empty:
        return {"title": "11 · Cost vs Benefit", "subtitle": "No CostBenefit sheet found",
                "kpis": [], "figs": [], "tables": []}

    # ── KPIs ──
    tot_cost   = float(cb["Total Cost"].sum())
    tot_ben    = float(cb["Total Benefit"].sum())
    net        = tot_ben - tot_cost
    roi        = (net / tot_cost * 100) if tot_cost else 0
    bcr        = (tot_ben / tot_cost) if tot_cost else 0
    # Simple discounted payback: cumulative net by year
    by_year = (cb.groupby("Year")[["Total Cost","Total Benefit"]].sum()
                 .sort_index())
    by_year["Net"]        = by_year["Total Benefit"] - by_year["Total Cost"]
    by_year["Cumulative"] = by_year["Net"].cumsum()
    payback_year = next((int(y) for y, v in by_year["Cumulative"].items() if v >= 0), None)

    figs = []

    # 1) Year-on-Year stacked cost (CAPEX/OPEX) vs benefit (Recurring/One-Off)
    yr = (cb.groupby("Year")[["CAPEX","OPEX","Benefit Recurring","Benefit One-Off"]]
            .sum().reset_index())
    f1 = go.Figure()
    f1.add_bar(name="CAPEX", x=yr["Year"], y=-yr["CAPEX"], marker_color="#ef4444")
    f1.add_bar(name="OPEX",  x=yr["Year"], y=-yr["OPEX"],  marker_color="#f59e0b")
    f1.add_bar(name="Benefit · Recurring", x=yr["Year"], y=yr["Benefit Recurring"], marker_color="#22c55e")
    f1.add_bar(name="Benefit · One-Off",   x=yr["Year"], y=yr["Benefit One-Off"],   marker_color="#3b82f6")
    f1.update_layout(title="Year-on-Year Cost (CAPEX/OPEX) vs Benefit (Recurring/One-Off)",
                     barmode="relative", **DARK_LAYOUT, height=380,
                     legend=dict(orientation="h", y=-0.2))
    figs.append(("YoY Cost vs Benefit", f1))

    # 2) Cumulative cost vs cumulative benefit (payback curve)
    cum = by_year.reset_index().copy()
    cum["Cum Cost"]    = cum["Total Cost"].cumsum()
    cum["Cum Benefit"] = cum["Total Benefit"].cumsum()
    f2 = go.Figure()
    f2.add_scatter(x=cum["Year"], y=cum["Cum Cost"]/1e6, mode="lines+markers",
                   name="Cumulative Cost ($M)", line=dict(color="#ef4444", width=3))
    f2.add_scatter(x=cum["Year"], y=cum["Cum Benefit"]/1e6, mode="lines+markers",
                   name="Cumulative Benefit ($M)", line=dict(color="#22c55e", width=3))
    f2.add_scatter(x=cum["Year"], y=cum["Cumulative"]/1e6, mode="lines+markers",
                   name="Net Cumulative ($M)",
                   line=dict(color="#3b82f6", width=2, dash="dash"))
    f2.update_layout(title="Cumulative Cost vs Benefit (Payback Curve)",
                     **DARK_LAYOUT, height=380,
                     legend=dict(orientation="h", y=-0.2))
    figs.append(("Cumulative Payback", f2))

    # 3) Per-project bubble — Cost vs Benefit, sized by ROI %
    per = (cb.groupby(["Project ID","Project Name","Program","Benefit Type",
                       "Benefit Category"])[["Total Cost","Total Benefit"]]
             .sum().reset_index())
    per["Net"]   = per["Total Benefit"] - per["Total Cost"]
    _c = pd.to_numeric(per["Total Cost"], errors="coerce").where(lambda s: s > 0)
    per["ROI %"] = (per["Net"] / _c * 100).fillna(0)
    f3 = px.scatter(per, x="Total Cost", y="Total Benefit",
                    size=per["ROI %"].abs().clip(lower=5),
                    color="Benefit Type",
                    hover_data=["Project Name","Program","Benefit Category","ROI %"],
                    color_discrete_map={"Recurring":"#22c55e","One-Off":"#3b82f6"})
    # Add break-even diagonal
    lim = max(per["Total Cost"].max(), per["Total Benefit"].max()) * 1.05
    f3.add_shape(type="line", x0=0, y0=0, x1=lim, y1=lim,
                 line=dict(color="#94a3b8", dash="dash"))
    f3.add_annotation(x=lim*0.7, y=lim*0.72, text="Break-even",
                      showarrow=False, font=dict(color="#94a3b8", size=10))
    f3.update_layout(title="Project Cost vs Benefit (bubble = |ROI %|)",
                     **DARK_LAYOUT, height=480)
    figs.append(("Project Bubble", f3))

    # 4) Top-10 ROI ranking
    top = per.sort_values("ROI %", ascending=True).tail(10)
    f4 = px.bar(top, x="ROI %", y="Project Name", orientation="h",
                color="ROI %", color_continuous_scale="RdYlGn",
                text=top["ROI %"].round(0).astype(int).astype(str)+"%")
    f4.update_layout(title="Top-10 Projects by ROI %", **DARK_LAYOUT, height=400)
    figs.append(("Top ROI", f4))

    # 5) Benefit category mix
    cat = cb.groupby("Benefit Category")["Total Benefit"].sum().reset_index()
    f5 = px.pie(cat, names="Benefit Category", values="Total Benefit", hole=.55,
                color_discrete_sequence=["#3b82f6","#22c55e","#f59e0b","#8b5cf6","#06b6d4"])
    f5.update_layout(title="Benefit Mix by Category", **DARK_LAYOUT, height=360)
    figs.append(("Benefit Mix", f5))

    # 6) Heatmap: Project × Year net benefit
    pivot = cb.pivot_table(index="Project Name", columns="Year",
                           values="Net Benefit", aggfunc="sum", fill_value=0)
    pivot = pivot.loc[pivot.sum(axis=1).sort_values(ascending=False).index].head(20)
    f6 = px.imshow(pivot, color_continuous_scale="RdYlGn", aspect="auto",
                   labels=dict(color="Net Benefit ($)"))
    f6.update_layout(title="Net Benefit Heatmap (Top 20 projects × Year)",
                     **DARK_LAYOUT, height=520)
    figs.append(("Net Benefit Heatmap", f6))

    return {
        "title": "11 · Cost vs Benefit",
        "subtitle": "5-year CAPEX/OPEX vs recurring & one-off benefits",
        "kpis": [
            ("Total Cost",     f"${tot_cost/1e6:.1f}M"),
            ("Total Benefit",  f"${tot_ben/1e6:.1f}M"),
            ("Net Benefit",    f"${net/1e6:.1f}M"),
            ("Portfolio ROI",  f"{roi:.0f}%"),
            ("Benefit-Cost",   f"{bcr:.2f}x"),
            ("Payback Year",   payback_year if payback_year else "—"),
        ],
        "figs": figs,
        "tables": [("Per-Project Summary",
                    per.sort_values("ROI %", ascending=False)
                       .round({"Total Cost":0,"Total Benefit":0,"Net":0,"ROI %":1}))],
    }


# ─────────────────────────── Cached wrappers ───────────────────────────
# Disabled: builder-level caching caused stale/cross-page figure reuse.
# Excel-load caching in utils/excel_loader.py already removes the main I/O cost.


BUILDERS = [
    ("executive",    build_executive),
    ("roadmap",      build_roadmap),
    ("projects",     build_projects),
    ("risks",        build_risks),
    ("financials",   build_financials),
    ("governance",   build_governance),
    ("resources",    build_resources),
    ("analytics",    build_analytics),
    ("dependencies", build_dependencies),
    ("pipeline",     build_pipeline),
    ("costbenefit",  build_costbenefit),
]
