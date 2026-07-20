"""11 · About This App — plain-English guide to every tab.

Designed for non-technical users (executives, sponsors, business stakeholders)
to understand what each module does, what data feeds it, and what decisions
it supports.
"""
import streamlit as st
from utils import auth as _auth; _auth.login_gate()
from utils.theme_manager import apply_theme

apply_theme()

st.title("ℹ️ About this App — Tab-by-Tab Guide")
st.caption("A plain-English walkthrough of every screen, what it shows, "
           "and how to use it. No technical jargon.")

TABS = [
    {
        "icon": "📊", "name": "1 · Executive Dashboard",
        "purpose": "One-screen cockpit for senior leaders.",
        "shows": [
            "Headline money numbers — Approved, Incurred, Forecast, Remaining (with mini trend lines).",
            "Portfolio counts — Active, Completed, Overdue projects.",
            "Average RAG (Red/Amber/Green) health score.",
            "Governance Flow — every project shown under its current workflow stage.",
            "Charts: portfolio health donut, CAPEX vs Actual, monthly spend trend, theme & priority mix.",
            "Top 5 live risks.",
        ],
        "use": "Open here first every morning. Filter by Program, Sponsor, Priority "
               "or Status to drill in. Use it before steering-committee meetings.",
        "data": "Projects, Financials, Governance, Risks sheets.",
    },
    {
        "icon": "🗺️", "name": "2 · Portfolio Roadmap",
        "purpose": "See every project as a bar on a timeline (Gantt view).",
        "shows": [
            "Each project's start and end date as a horizontal bar.",
            "All governance gates plotted along the bar.",
            "A diamond marker showing the project's current stage, "
            "colour-coded green / amber / red by gate status.",
        ],
        "use": "Spot overlapping deliveries, identify resource pinch points, "
               "and answer 'where is each project right now?' at a glance.",
        "data": "Projects + Governance sheets.",
    },
    {
        "icon": "📋", "name": "3 · Project Register",
        "purpose": "The master list of every project.",
        "shows": [
            "Every project row with its Program, Sponsor, Status, Budget, RAG.",
            "Each project's Current Governance Phase, Gate Status and Next Gate.",
            "Distribution charts: RAG split, projects by program, projects by current phase.",
        ],
        "use": "Search, sort, filter the full inventory. Useful for PMO leads "
               "preparing portfolio reviews.",
        "data": "Projects + Governance sheets.",
    },
    {
        "icon": "⚠️", "name": "4 · Risk Intelligence",
        "purpose": "What can hurt the portfolio?",
        "shows": [
            "Risk Heatmap — bubbles plotted by Probability × Impact, sized by score.",
            "Full scored register: Risk Score = Probability × Impact × Velocity.",
            "Escalation flag for risks above threshold.",
        ],
        "use": "Identify the few risks worth executive attention. Drives the "
               "'Top Risks' table on the Executive Dashboard.",
        "data": "Risks sheet.",
    },
    {
        "icon": "💰", "name": "5 · Financial Intelligence",
        "purpose": "The money story — beyond the headline numbers.",
        "shows": [
            "CAPEX vs OPEX by project (stacked bars).",
            "Earned Value Management: Planned Value, Earned Value, Actual Cost.",
            "Performance indices: SPI (schedule), CPI (cost), EAC (estimate at completion).",
        ],
        "use": "Answer 'are we on time and on budget?' with industry-standard "
               "EVM metrics. Useful for CFO / Finance Business Partner reviews.",
        "data": "Financials sheet.",
    },
    {
        "icon": "🛡️", "name": "6 · Governance — Stage Gates",
        "purpose": "Track the governance workflow approvals.",
        "shows": [
            "Funnel of how many projects sit at each stage (Idea → Benefits Realisation).",
            "Stage-gate checklist completion per project, coloured by approval status.",
        ],
        "use": "Governance leads use it to chase pending approvals and "
               "spot bottleneck stages.",
        "data": "Governance sheet.",
    },
    {
        "icon": "👥", "name": "7 · Resource Capacity",
        "purpose": "Who is working on what, and are they over-loaded?",
        "shows": [
            "Demand by skill family.",
            "Resource × Project heatmap of allocation %.",
            "Utilisation status flags: Over (>100%), Optimal (60–100%), Under.",
        ],
        "use": "Resource managers use it to rebalance allocations and flag "
               "burnout risk.",
        "data": "Resources sheet.",
    },
    {
        "icon": "📈", "name": "8 · Roadmap Analytics",
        "purpose": "Predictive, what-if portfolio view.",
        "shows": [
            "Investment Mix (Run / Grow / Transform donut).",
            "Risk exposure by Program.",
            "Monte-Carlo simulation of portfolio cost: P50 / P80 / P95 confidence bands.",
        ],
        "use": "Helps the CIO answer 'what is the realistic landing cost' rather "
               "than just the approved budget.",
        "data": "Projects + Risks sheets.",
    },
    {
        "icon": "🔗", "name": "9 · Cross-Project Dependencies",
        "purpose": "Map the hidden wiring between projects.",
        "shows": [
            "Dependency matrix (From-Project × To-Project).",
            "Dependencies grouped by Type and Status (Healthy / At-Risk / Blocked).",
        ],
        "use": "Identify which project slipping would cascade into others. "
               "Critical for delivery-risk conversations.",
        "data": "Dependencies sheet.",
    },
    {
        "icon": "🚀", "name": "10 · Demand Pipeline",
        "purpose": "The intake funnel — ideas not yet approved.",
        "shows": [
            "Prioritised backlog (highest Priority Score on top).",
            "Value vs Effort bubble chart, sized by estimated budget.",
            "Decision status: New / Under Review / Approved / Parked / Rejected.",
        ],
        "use": "Investment committees use it to decide what to fund next quarter.",
        "data": "Pipeline sheet.",
    },
    {
        "icon": "💹", "name": "11 · Cost vs Benefit",
        "purpose": "Does each project actually pay for itself?",
        "shows": [
            "Year-on-year stacked bars: CAPEX & OPEX going down, "
            "Recurring & One-Off benefits going up — over a 5-year horizon.",
            "Cumulative cost vs cumulative benefit curve with the crossover "
            "(payback) year highlighted.",
            "Project bubble chart: Cost on X, Benefit on Y, bubble size = |ROI %|, "
            "with a break-even diagonal so winners sit above the line.",
            "Top-10 ROI ranking and benefit-category mix (Cost Savings / "
            "Revenue Uplift / Productivity / Risk Avoidance / Compliance).",
            "Net-benefit heatmap (Top 20 projects × Year).",
        ],
        "use": "Use it for investment committees and value-realisation reviews. "
               "Answers 'which projects are worth continuing, and when does the "
               "portfolio go cash-positive?'.",
        "data": "CostBenefit sheet (Project ID, Year, CAPEX, OPEX, Benefit Recurring, "
                "Benefit One-Off, Benefit Type, Benefit Category, Confidence %).",
    },
    {
        "icon": "ℹ️", "name": "12 · About this App",
        "purpose": "You are here — a plain-English guide to every tab.",
        "shows": ["This page."],
        "use": "Share with new stakeholders before their first walkthrough.",
        "data": "—",
    },
]

st.markdown("---")
st.subheader("How the app fits together")
st.markdown(
    "All ten dashboards read from **one Excel file** (`PMO_Master.xlsx` by default). "
    "You can point the app at any local or SharePoint/OneDrive-synced "
    "`.xlsx` from the **📂 Data Source** panel in the sidebar — add a sheet, "
    "add a column, and it shows up automatically. Light/Dark/Custom theme "
    "and per-tab **PNG / PDF / PPT** export are available everywhere."
)
st.markdown("---")

for t in TABS:
    with st.expander(f"{t['icon']}  **{t['name']}** — {t['purpose']}", expanded=False):
        c1, c2 = st.columns([2, 1])
        with c1:
            st.markdown("**What it shows**")
            for s in t["shows"]:
                st.markdown(f"- {s}")
            st.markdown("**How to use it**")
            st.markdown(t["use"])
        with c2:
            st.markdown("**Data source**")
            st.info(t["data"])

st.markdown("---")
st.subheader("Quick glossary")
glossary = {
    "RAG":   "Red / Amber / Green health rating. Red = at risk, Amber = watch, Green = on track.",
    "CAPEX": "Capital expenditure — money spent to create future benefit (assets).",
    "OPEX":  "Operating expenditure — money spent running the business.",
    "EVM":   "Earned Value Management — comparing what was planned, earned and spent.",
    "SPI":   "Schedule Performance Index. 1.0 = on schedule, <1.0 = behind.",
    "CPI":   "Cost Performance Index. 1.0 = on budget, <1.0 = over-spending.",
    "EAC":   "Estimate at Completion — projected final cost based on today's burn rate.",
    "Gate":  "A formal approval checkpoint between two governance stages.",
    "P50/P80/P95": "Probability-weighted cost forecasts from the Monte-Carlo simulation.",
}
for term, defn in glossary.items():
    st.markdown(f"- **{term}** — {defn}")
