"""Shared schedule + financial health logic used across pages.

Everything computes off the `PhaseFinancials` sheet where present and
falls back to project-level Budget/Actual columns when it isn't.
"""
from __future__ import annotations
import pandas as pd


# ---- primitive helpers ---------------------------------------------------

def _num(v) -> float:
    try:
        f = float(v)
        return 0.0 if pd.isna(f) else f
    except Exception:
        return 0.0


def _date(v):
    try:
        d = pd.to_datetime(v, errors="coerce")
        return None if pd.isna(d) else d
    except Exception:
        return None


# ---- health classifiers --------------------------------------------------

def schedule_health(planned_end, actual_end, status: str = "") -> str:
    """Return Green/Amber/Red for a single phase or project."""
    today = pd.Timestamp.today().normalize()
    pe = _date(planned_end)
    ae = _date(actual_end)
    st = str(status or "").strip().lower()
    if st in ("complete", "closed", "done"):
        if pe and ae:
            delta = (ae - pe).days
            if delta <= 0: return "Green"
            if delta <= 14: return "Amber"
            return "Red"
        return "Green"
    if not pe:
        return "Amber"
    # In-progress or not started
    if today > pe:
        return "Red"
    if (pe - today).days <= 14:
        return "Amber"
    return "Green"


def financial_health(budget, actual, forecast=None) -> str:
    b, a = _num(budget), _num(actual)
    f = _num(forecast) if forecast is not None else 0.0
    ref = max(b, f)
    if ref <= 0:
        return "Green" if a == 0 else "Amber"
    ratio = a / ref
    if a > b > 0 or (f and f > b > 0):
        return "Red"
    if ratio > 0.9:
        return "Amber"
    return "Green"


def combined_health(schedule: str, financial: str) -> str:
    order = {"Green": 0, "Amber": 1, "Red": 2}
    return max([schedule, financial], key=lambda x: order.get(x, 0))


# ---- rollups -------------------------------------------------------------

def project_phase_summary(project_id: str, phase_df: pd.DataFrame) -> pd.DataFrame:
    """Enrich the phase rows for one project with derived columns."""
    if phase_df is None or phase_df.empty:
        return pd.DataFrame()
    df = phase_df[phase_df["Project ID"].astype(str) == str(project_id)].copy()
    if df.empty:
        return df
    for c in ("Phase Budget", "Phase Forecast", "Phase Actual Spend"):
        df[c] = pd.to_numeric(df.get(c, 0), errors="coerce").fillna(0)
    for c in ("Planned Start", "Planned End", "Actual Start", "Actual End"):
        df[c] = pd.to_datetime(df.get(c), errors="coerce")
    df["Remaining"] = df["Phase Forecast"].where(df["Phase Forecast"] > 0,
                                                  df["Phase Budget"]) - df["Phase Actual Spend"]
    df["Cost Var"] = df["Phase Budget"] - df["Phase Actual Spend"]
    df["Schedule Var (days)"] = (df["Actual End"] - df["Planned End"]).dt.days
    df["Schedule Health"] = df.apply(
        lambda r: schedule_health(r["Planned End"], r["Actual End"], r.get("Status", "")), axis=1)
    df["Financial Health"] = df.apply(
        lambda r: financial_health(r["Phase Budget"], r["Phase Actual Spend"], r["Phase Forecast"]),
        axis=1)
    df["Health"] = df.apply(
        lambda r: combined_health(r["Schedule Health"], r["Financial Health"]), axis=1)
    return df


def project_rollup(project_row: pd.Series, phase_df: pd.DataFrame) -> dict:
    """Aggregate one project's totals, preferring phase data where available."""
    pid = str(project_row.get("Project ID", ""))
    budget = _num(project_row.get("Budget") or project_row.get("Approved Funding"))
    proj_actual = _num(project_row.get("Actual Spend") or
                       (_num(project_row.get("CAPEX Incurred")) + _num(project_row.get("OPEX Incurred"))))
    proj_forecast = _num(project_row.get("Forecast At Completion"))

    phases = project_phase_summary(pid, phase_df) if phase_df is not None else pd.DataFrame()
    if not phases.empty:
        phase_actual = phases["Phase Actual Spend"].sum()
        phase_forecast = phases["Phase Forecast"].sum() or phases["Phase Budget"].sum()
        phase_budget = phases["Phase Budget"].sum()
    else:
        phase_actual = proj_actual
        phase_forecast = proj_forecast or budget
        phase_budget = 0.0

    actual = phase_actual
    forecast = phase_forecast or proj_forecast or budget
    remaining = budget - actual
    consumed_pct = (actual / budget * 100) if budget else 0
    sched = "Green"
    if not phases.empty:
        # worst of in-progress/complete phases
        worst = phases["Schedule Health"].tolist()
        for level in ("Red", "Amber", "Green"):
            if level in worst:
                sched = level; break
    else:
        sched = schedule_health(project_row.get("End Date"),
                                project_row.get("Actual End Date") or project_row.get("Go Live Date"),
                                project_row.get("Status", ""))
    fin = financial_health(budget, actual, forecast)
    return {
        "Project ID": pid,
        "Budget": budget,
        "Allocated to Phases": phase_budget,
        "Unallocated": budget - phase_budget,
        "Actual": actual,
        "Forecast": forecast,
        "Remaining": remaining,
        "Consumed %": round(consumed_pct, 1),
        "Schedule Health": sched,
        "Financial Health": fin,
        "Health": combined_health(sched, fin),
    }


def program_rollup(program: str, projects: pd.DataFrame, phase_df: pd.DataFrame) -> dict:
    if projects is None or projects.empty:
        return {}
    sub = projects[projects.get("Program", "").astype(str) == str(program)]
    rows = [project_rollup(r, phase_df) for _, r in sub.iterrows()]
    if not rows:
        return {}
    tot_budget = sum(r["Budget"] for r in rows)
    tot_actual = sum(r["Actual"] for r in rows)
    tot_forecast = sum(r["Forecast"] for r in rows)
    worst_sched = "Green"
    for level in ("Red", "Amber", "Green"):
        if any(r["Schedule Health"] == level for r in rows):
            worst_sched = level; break
    fin = financial_health(tot_budget, tot_actual, tot_forecast)
    return {
        "Program": program,
        "Projects": len(rows),
        "Budget": tot_budget,
        "Actual": tot_actual,
        "Forecast": tot_forecast,
        "Remaining": tot_budget - tot_actual,
        "Committed": tot_forecast,
        "Consumed %": round(tot_actual / tot_budget * 100, 1) if tot_budget else 0,
        "Schedule Health": worst_sched,
        "Financial Health": fin,
        "Health": combined_health(worst_sched, fin),
    }


RAG_HEX = {"Green": "#22c55e", "Amber": "#f59e0b", "Red": "#ef4444"}


def rag_chip(level: str, label: str | None = None) -> str:
    color = RAG_HEX.get(level, "#94a3b8")
    return (f"<span style='background:{color};color:white;padding:2px 10px;"
            f"border-radius:12px;font-size:12px;font-weight:600'>"
            f"{label or level}</span>")
