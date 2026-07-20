"""Executive portfolio engine: aggregated KPIs, health rules, segmentation.

All numeric thresholds are read from the workbook's ConfigRules sheet so the
Excel file is the single source of truth — editing a threshold in Config (or
via the Configuration page) immediately changes the health logic.
"""
from __future__ import annotations
import pandas as pd
import numpy as np
import streamlit as st
from datetime import datetime, timedelta

from config import GOV_CHANNEL_A_THRESHOLD, PORTFOLIO_CATEGORIES

try:
    from utils.config_loader import get_rule
except Exception:  # pragma: no cover
    def get_rule(_k, default=None): return default

try:
    from utils.perf import data_version as _dv
except Exception:
    def _dv(): return 0.0



def _num(s) -> pd.Series:
    return pd.to_numeric(s, errors="coerce").fillna(0)


def _col(df, *names, default=None):
    for n in names:
        if n in df.columns:
            return df[n]
    return pd.Series([default] * len(df))


# ─────────────────────────── HEALTH ENGINE ───────────────────────────
def compute_project_health(projects: pd.DataFrame,
                           stagegates: pd.DataFrame | None = None) -> pd.DataFrame:
    return _compute_project_health_impl(projects, stagegates)


def _compute_project_health_impl(projects: pd.DataFrame,
                                 stagegates: pd.DataFrame | None = None) -> pd.DataFrame:
    """Return projects with computed Schedule/Financial/Delivery/Benefit/Overall RAGs."""
    if projects.empty:
        return projects
    out = projects.copy()
    today = pd.Timestamp.today().normalize()
    end = pd.to_datetime(_col(out, "End Date"), errors="coerce")
    progress = _num(_col(out, "Progress %"))
    approved = _num(_col(out, "Approved Funding", "Budget"))
    actual   = _num(_col(out, "Actual Spend", "Actual Cost"))
    forecast = _num(_col(out, "Forecast At Completion", "Forecast"))
    benefits_f = _num(_col(out, "Benefits Forecast"))
    benefits_r = _num(_col(out, "Benefits Realised"))

    # Schedule: compare progress vs time elapsed
    start = pd.to_datetime(_col(out, "Start Date"), errors="coerce")
    duration = (end - start).dt.days.replace({0: 1})
    elapsed  = (today - start).dt.days.clip(lower=0)
    # Thresholds from Config (with safe defaults)
    sched_amber = float(get_rule("SCHEDULE_AMBER_VARIANCE", -0.05))
    sched_red   = float(get_rule("SCHEDULE_RED_VARIANCE",   -0.10))
    fin_amber   = float(get_rule("FINANCIAL_AMBER_VARIANCE", 0.05))
    fin_red     = float(get_rule("FINANCIAL_RED_VARIANCE",   0.10))
    ben_green   = float(get_rule("BENEFIT_GREEN_THRESHOLD",  0.70))
    ben_amber   = float(get_rule("BENEFIT_AMBER_THRESHOLD",  0.30))
    del_amber_d = float(get_rule("DELIVERY_AMBER_DAYS_LATE",  1))
    del_red_d   = float(get_rule("DELIVERY_RED_DAYS_LATE",   15))

    sched_var = (progress / 100.0) - (elapsed / duration)
    sched_rag = np.where(sched_var >= sched_amber, "Green",
                  np.where(sched_var >= sched_red, "Amber", "Red"))
    out["Schedule Health"] = sched_rag

    # Financial: cost vs forecast vs budget
    fin_var = (forecast - approved) / approved.replace({0: np.nan})
    fin_rag = np.where(fin_var.fillna(0) <= fin_amber, "Green",
                np.where(fin_var.fillna(0) <= fin_red, "Amber", "Red"))
    out["Financial Health"] = fin_rag

    # Benefit: realisation rate
    real_rate = (benefits_r / benefits_f.replace({0: np.nan})).fillna(0)
    ben_rag = np.where(real_rate >= ben_green, "Green",
                np.where(real_rate >= ben_amber, "Amber", "Red"))
    out["Benefit Health"] = ben_rag

    # Delivery: existing RAG or based on overdue stage gates
    if stagegates is not None and not stagegates.empty and "Days Late" in stagegates.columns:
        late = stagegates.groupby("Project ID")["Days Late"].max().to_dict()
        days_late = out["Project ID"].map(late).fillna(0)
        del_rag = np.where(days_late < del_amber_d, "Green",
                    np.where(days_late < del_red_d, "Amber", "Red"))
    else:
        del_rag = _col(out, "RAG", default="Green").astype(str).values
    out["Delivery Health"] = del_rag

    # Overall RAG = worst of the four
    order = {"Green": 0, "Amber": 1, "Red": 2}
    rev   = {v: k for k, v in order.items()}
    worst = np.maximum.reduce([
        np.array([order.get(x, 0) for x in out["Schedule Health"]]),
        np.array([order.get(x, 0) for x in out["Financial Health"]]),
        np.array([order.get(x, 0) for x in out["Delivery Health"]]),
        np.array([order.get(x, 0) for x in out["Benefit Health"]]),
    ])
    out["Overall RAG"] = [rev[w] for w in worst]
    return out


# ─────────────────────────── EXEC KPIs ───────────────────────────
def executive_kpis(projects: pd.DataFrame,
                   benefits: pd.DataFrame | None = None,
                   decisions: pd.DataFrame | None = None,
                   actions: pd.DataFrame | None = None,
                   stagegates: pd.DataFrame | None = None) -> dict:
    if projects.empty:
        return {}
    p = projects
    approved = _num(_col(p, "Approved Funding", "Budget"))
    capex    = _num(_col(p, "CAPEX"))
    opex     = _num(_col(p, "OPEX"))
    actual   = _num(_col(p, "Actual Spend", "Actual Cost"))
    forecast = _num(_col(p, "Forecast At Completion", "Forecast"))
    funding  = _col(p, "Funding Type", default="").astype(str)
    category = _col(p, "Portfolio Category", default="").astype(str)
    rag      = _col(p, "RAG", default="Green").astype(str)
    status   = _col(p, "Status", default="").astype(str)
    today    = pd.Timestamp.today().normalize()
    end      = pd.to_datetime(_col(p, "End Date"), errors="coerce")

    ben_f = _num(_col(p, "Benefits Forecast"))
    ben_r = _num(_col(p, "Benefits Realised"))
    if benefits is not None and not benefits.empty:
        ben_f = pd.Series([_num(benefits.get("Target Value")).sum()])
        ben_r = pd.Series([_num(benefits.get("Realised Value")).sum()])

    total = len(p)
    on_track = int((rag == "Green").sum())
    at_risk  = int((rag == "Amber").sum())
    delayed  = int((rag == "Red").sum())

    dec_open = 0
    if decisions is not None and not decisions.empty and "Status" in decisions.columns:
        dec_open = int(decisions["Status"].astype(str).isin(["Open","In Review"]).sum())

    act_overdue = 0
    if actions is not None and not actions.empty:
        if "Status" in actions.columns:
            act_overdue = int((actions["Status"].astype(str) == "Overdue").sum())

    upcoming_gates = 0
    if stagegates is not None and not stagegates.empty and "Planned Gate Date" in stagegates.columns:
        d = pd.to_datetime(stagegates["Planned Gate Date"], errors="coerce")
        window = int(get_rule("UPCOMING_GATE_WINDOW_DAYS", 30))
        upcoming_gates = int(((d >= today) & (d <= today + pd.Timedelta(days=window))).sum())

    return {
        "Total Portfolio Value":      float(approved.sum()),
        "Total CAPEX Budget":         float(capex.sum()),
        "Total OPEX Budget":          float(opex.sum()),
        "Approved Funding":           float(approved.sum()),
        "Actual Spend to Date":       float(actual.sum()),
        "Remaining Portfolio Budget": float(approved.sum() - actual.sum()),
        "Forecast At Completion":     float(forecast.sum()),
        "Projects On Track (%)":      round(100 * on_track / total, 1) if total else 0,
        "Projects At Risk (%)":       round(100 * at_risk  / total, 1) if total else 0,
        "Projects Delayed (%)":       round(100 * delayed  / total, 1) if total else 0,
        "Total Strategic Programs":   int(category.isin(["Business Strategic","IT Strategic"]).sum()),
        "Total CAPEX Programs":       int((category == "CAPEX").sum()),
        "Total Unfunded Initiatives": int((category == "Unfunded").sum()),
        "Benefits Forecast":          float(ben_f.sum()),
        "Benefits Realised":          float(ben_r.sum()),
        "Decisions Awaiting Approval": dec_open,
        "Overdue Actions":            act_overdue,
        "Upcoming Stage Gates":       upcoming_gates,
    }


# ─────────────────────────── SEGMENTATION ───────────────────────────
SEGMENTS = {
    "Business Strategic":   lambda c: c == "Business Strategic",
    "IT Strategic":         lambda c: c == "IT Strategic",
    "CAPEX":                lambda c: c == "CAPEX",
    "Unfunded":             lambda c: c == "Unfunded",
}


def segment_summary(projects: pd.DataFrame) -> pd.DataFrame:
    if projects.empty:
        return pd.DataFrame()
    cat = _col(projects, "Portfolio Category", default="").astype(str)
    approved = _num(_col(projects, "Approved Funding", "Budget"))
    actual   = _num(_col(projects, "Actual Spend", "Actual Cost"))
    bf       = _num(_col(projects, "Benefits Forecast"))
    rag      = _col(projects, "RAG", default="Green").astype(str)
    rows = []
    for label, fn in SEGMENTS.items():
        m = cat.apply(fn)
        rows.append({
            "Portfolio":  label,
            "Initiatives": int(m.sum()),
            "Approved Funding": float(approved[m].sum()),
            "Actual Spend":     float(actual[m].sum()),
            "Remaining":        float((approved - actual)[m].sum()),
            "Benefits Forecast": float(bf[m].sum()),
            "Green": int((rag[m] == "Green").sum()),
            "Amber": int((rag[m] == "Amber").sum()),
            "Red":   int((rag[m] == "Red").sum()),
        })
    rows.append({
        "Portfolio": "All Portfolio",
        "Initiatives": int(len(projects)),
        "Approved Funding": float(approved.sum()),
        "Actual Spend": float(actual.sum()),
        "Remaining": float((approved - actual).sum()),
        "Benefits Forecast": float(bf.sum()),
        "Green": int((rag == "Green").sum()),
        "Amber": int((rag == "Amber").sum()),
        "Red":   int((rag == "Red").sum()),
    })
    return pd.DataFrame(rows)


# ─────────────────────────── CHANNEL ASSIGNMENT ───────────────────────────
def derive_channel(approved_funding: float) -> str:
    return ("Channel A (<$200K)"
            if approved_funding and approved_funding < GOV_CHANNEL_A_THRESHOLD
            else "Channel B (>$200K)")
