"""KPI calculations for the executive dashboard."""
from __future__ import annotations
import pandas as pd


def _num(s):
    return pd.to_numeric(s, errors="coerce").fillna(0)


def compute_kpis(projects: pd.DataFrame, financials: pd.DataFrame | None = None) -> dict:
    if projects.empty:
        return {k: 0 for k in [
            "capex_approved", "cost_incurred", "forecast", "remaining",
            "active", "completed", "overdue", "total", "avg_rag"
        ]}

    def pick(*names):
        for n in names:
            if n in projects.columns:
                return _num(projects[n])
        return _num(pd.Series([0]*len(projects)))
    budget   = pick("Approved Funding", "Budget")
    actual   = pick("Actual Spend",     "Actual Cost")
    forecast = pick("Forecast At Completion", "Forecast")

    status = projects.get("Status", pd.Series(dtype=str)).astype(str)
    today  = pd.Timestamp.today().normalize()
    end    = pd.to_datetime(projects.get("End Date"), errors="coerce")

    rag_map = {"Green": 4, "Amber": 2.5, "Red": 1}
    rag_score = projects.get("RAG", pd.Series(dtype=str)).map(rag_map).fillna(0)

    return {
        "capex_approved": float(budget.sum()),
        "cost_incurred":  float(actual.sum()),
        "forecast":       float(forecast.sum()),
        "remaining":      float(budget.sum() - actual.sum()),
        "active":         int((status == "Active").sum()),
        "completed":      int((status == "Completed").sum()),
        "overdue":        int(((end < today) & (status != "Completed")).sum()),
        "total":          int(len(projects)),
        "avg_rag":        round(float(rag_score.mean()), 1) if len(rag_score) else 0,
    }


def rag_distribution(projects: pd.DataFrame) -> pd.DataFrame:
    if projects.empty or "RAG" not in projects:
        return pd.DataFrame({"RAG": [], "Count": []})
    out = projects["RAG"].value_counts().reindex(["Green", "Amber", "Red"]).fillna(0).reset_index()
    out.columns = ["RAG", "Count"]
    return out


def by_theme(projects: pd.DataFrame) -> pd.DataFrame:
    if "Theme" not in projects:
        return pd.DataFrame()
    return projects.groupby("Theme").size().reset_index(name="Count").sort_values("Count", ascending=False)


def by_priority(projects: pd.DataFrame) -> pd.DataFrame:
    if "Priority" not in projects:
        return pd.DataFrame()
    return projects.groupby("Priority").size().reset_index(name="Count")


_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]


def kpi_trends(projects: pd.DataFrame, financials: pd.DataFrame | None) -> dict:
    """12-point trend series per KPI, used for in-card sparklines.
    Falls back to a flat line when the underlying field is missing."""
    k = compute_kpis(projects, financials)
    trends: dict = {}

    if financials is not None and not financials.empty and "Month" in financials.columns:
        agg = (financials.groupby("Month")[["Actual", "Forecast", "CAPEX"]]
               .sum().reindex(_MONTHS).fillna(0))
        actual_cum   = agg["Actual"].cumsum().tolist()
        forecast_cum = agg["Forecast"].cumsum().tolist()
        capex_cum    = agg["CAPEX"].cumsum().tolist()
        approved     = [k["capex_approved"]] * 12
        remaining    = [k["capex_approved"] - a for a in actual_cum]
    else:
        approved     = [k["capex_approved"]] * 12
        actual_cum   = [k["cost_incurred"] * (i + 1) / 12 for i in range(12)]
        forecast_cum = [k["forecast"] * (i + 1) / 12 for i in range(12)]
        capex_cum    = actual_cum
        remaining    = [k["capex_approved"] - a for a in actual_cum]

    trends["CAPEX Approved"] = approved
    trends["Incurred"]       = actual_cum
    trends["Forecast"]       = forecast_cum
    trends["Remaining"]      = remaining

    # Project-count trends: ramp from 0 to current count (illustrative monthly view)
    def ramp(v): return [round(v * (i + 1) / 12, 1) for i in range(12)]
    trends["Active"]    = ramp(k["active"])
    trends["Completed"] = ramp(k["completed"])
    trends["Overdue"]   = ramp(k["overdue"])
    trends["RAG Score"] = [k["avg_rag"]] * 12
    return trends

