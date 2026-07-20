# PMO Portfolio — Enterprise Edition

A Streamlit + Excel PMO Portfolio Tool with 10 modules, governance-aware roadmap,
predictive risk, EVM financials, and **one-click PowerPoint export of the entire app**.

## Quick start

```bash
pip install -r requirements.txt
python generate_master.py        # creates data/PMO_Master.xlsx
streamlit run app.py
```

## Modules

| # | Page | Capability |
|---|------|------------|
| 1 | Executive Dashboard | Single-screen cockpit (no scroll) with governance flow |
| 2 | Portfolio Roadmap | Gantt with current governance gate marker per project |
| 3 | Projects | Register & drill-down |
| 4 | Risks | P × I × Velocity scoring + heatmap |
| 5 | Financials | CAPEX/OPEX + EVM (SPI, CPI, EAC) |
| 6 | Governance | Stage gates, checklist completion, audit |
| 7 | Resources | Skill-based capacity + utilization heatmap |
| 8 | Roadmap Analytics | Investment mix + Monte-Carlo cost simulation |
| 9 | Dependencies | Cross-project dependency matrix |
| 10 | Demand Pipeline | Scored intake (Strategic × Value − Risk − Effort) |

## Export to PowerPoint

In the sidebar, click **Generate PowerPoint**. A 12-slide deck is produced under
`exports/` covering every module (one tab per slide), with dark-themed charts
and tables, ready to share with executives.

## SharePoint move

1. Upload `data/PMO_Master.xlsx` to SharePoint and sync via OneDrive.
2. In `config.py`, set `MASTER_FILE` to the OneDrive-synced local path.
3. Done — the app reloads from the synced workbook.
