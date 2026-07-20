"""Global config for PMO Enterprise Tool."""
from pathlib import Path
import json

BASE_DIR   = Path(__file__).parent
DATA_DIR   = BASE_DIR / "data"
ASSETS_DIR = BASE_DIR / "assets"
EXPORT_DIR = BASE_DIR / "exports"
UPLOAD_DIR = DATA_DIR / "uploads"
for d in (DATA_DIR, EXPORT_DIR, UPLOAD_DIR):
    d.mkdir(parents=True, exist_ok=True)

DEFAULT_MASTER_FILE = DATA_DIR / "PMO_Master.xlsx"
SETTINGS_FILE       = DATA_DIR / "source.json"


def get_master_file() -> Path:
    # 1) Environment override — takes precedence. Ideal for multi-user
    #    deployments where IT pins the master to a SharePoint / OneDrive-synced
    #    path (e.g. C:\Users\svc-pmo\OneDrive - Contoso\PMO\PMO_Master.xlsx).
    import os
    env_p = os.environ.get("PMO_MASTER_PATH", "").strip()
    if env_p:
        p = Path(env_p).expanduser()
        if p.exists():
            return p
    # 2) User-selected path saved via the sidebar UI.
    if SETTINGS_FILE.exists():
        try:
            p = Path(json.loads(SETTINGS_FILE.read_text()).get("path", ""))
            if p.exists():
                return p
        except Exception:
            pass
    # 3) Bundled sample as a last resort.
    return DEFAULT_MASTER_FILE


def set_master_file(path: str | Path) -> Path:
    p = Path(path).expanduser().resolve()
    SETTINGS_FILE.write_text(json.dumps({"path": str(p)}))
    return p


MASTER_FILE = get_master_file()

SHEETS = {
    "projects":            "Projects",
    "roadmap":             "Roadmap",
    "risks":               "Risks",
    "raid":                "RAID",
    # Governance and StageGates were merged into a single "StageGates" sheet.
    # Both keys resolve to the same underlying DataFrame in the loader so any
    # legacy code that reads either key keeps working.
    "governance":          "StageGates",
    "stagegates":          "StageGates",
    "financials":          "Financials",
    "resources":           "Resources",
    "dependencies":        "Dependencies",
    "pipeline":            "Pipeline",
    "costbenefit":         "CostBenefit",
    "benefits":            "Benefits",
    "decisions":           "Decisions",
    "actions":             "Actions",
    "milestones":          "Milestones",
    "portfoliomovements":  "PortfolioMovements",
    "prioritisation":      "Prioritisation",
    "config":              "Config",
    "configrules":         "ConfigRules",
    "fyallocation":        "FYAllocation",
    "programs":            "Programs",
    "projectbrief":        "ProjectBrief",
    "projectlinks":        "ProjectLinks",
    "phasefinancials":     "PhaseFinancials",
    "releases":            "Releases",
    "sprints":             "Sprints",
}


RAG_COLORS    = {"Green": "#22c55e", "Amber": "#f59e0b", "Red": "#ef4444"}
THEME_COLORS  = ["#3b82f6", "#8b5cf6", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4"]

# Channel A vs Channel B stage definitions
GOV_CHANNEL_A_THRESHOLD = 200_000
STAGES_A = ["Discovery","Business Case / Full Funding","Design","Build",
            "Testing","Deployment","Handover"]
STAGES_B = ["Discovery","Business Case / Seed Funding","Design",
            "Business Case / Full Funding","Build","Testing","Deployment","Handover"]
STAGES   = STAGES_B

PORTFOLIO_CATEGORIES = ["Business Strategic","IT Strategic","CAPEX","Unfunded"]
FUNDING_TYPES        = ["CAPEX","OPEX","Mixed","Unfunded"]
