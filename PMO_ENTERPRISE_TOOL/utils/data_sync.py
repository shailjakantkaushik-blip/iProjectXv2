"""Cross-sheet field synchronisation.

The workbook has many places where the same attribute (Project Name, Sponsor,
Program, Governance Channel, Portfolio Category, Funding Type, …) is repeated
across child sheets. Rather than force the user to keep every copy in sync by
hand, we treat the ``Projects`` sheet as the single source of truth and
back-fill those attributes onto every child sheet at load time.

Rules
-----
* Only **empty / NA** cells are filled — an explicit value in a child sheet is
  never overwritten.
* If a child sheet only carries the human ``Project`` name (not ``Project
  ID``) we look the ID up from Projects so the join still works.
* Rollups from ``PhaseFinancials`` (Σ Phase Budget / Σ Actual / min-max dates)
  are exposed as extra columns on a *copy* of Projects returned under the
  ``projects_enriched`` key, so pages that persist Projects back to disk
  (e.g. Timeline) are not affected.
"""
from __future__ import annotations
import pandas as pd

# Attributes that flow Projects → child sheets.
PROJECT_ATTRS = [
    "Project Name", "Sponsor", "Program", "Governance Channel",
    "Portfolio Category", "Funding Type", "Priority", "Status", "RAG",
]

# Sheets that carry Project ID (or a Project name we can resolve to an ID)
# and therefore benefit from enrichment.
CHILD_KEYS = [
    "risks", "raid", "governance", "stagegates", "financials", "benefits",
    "decisions", "actions", "milestones", "projectbrief", "projectlinks",
    "phasefinancials", "fyallocation", "portfoliomovements", "prioritisation",
    "costbenefit", "dependencies", "resources", "roadmap",
]


def _empty(series: pd.Series) -> pd.Series:
    """Boolean mask of 'effectively empty' cells (NaN, '', 'NA')."""
    s = series.astype("object")
    return s.isna() | s.astype(str).str.strip().isin(["", "NA", "nan", "None"])


def _ensure_project_id(df: pd.DataFrame, proj: pd.DataFrame) -> pd.DataFrame:
    """If a child sheet only has 'Project' (name), resolve missing 'Project ID'
    from Projects by name match. Non-destructive."""
    if df.empty or "Project ID" in df.columns and not _empty(df["Project ID"]).any():
        return df
    if "Project" not in df.columns or proj.empty or "Project Name" not in proj.columns:
        return df
    name_to_id = dict(zip(proj["Project Name"].astype(str), proj["Project ID"].astype(str)))
    if "Project ID" not in df.columns:
        df["Project ID"] = pd.NA
    mask = _empty(df["Project ID"])
    df.loc[mask, "Project ID"] = df.loc[mask, "Project"].astype(str).map(name_to_id)
    return df


def _fill_from_projects(df: pd.DataFrame, proj: pd.DataFrame) -> pd.DataFrame:
    if df.empty or proj.empty or "Project ID" not in df.columns:
        return df
    attrs = [c for c in PROJECT_ATTRS if c in proj.columns]
    if not attrs:
        return df
    lookup = proj.set_index(proj["Project ID"].astype(str))[attrs]
    ids = df["Project ID"].astype(str)
    for col in attrs:
        source = ids.map(lookup[col])
        if col not in df.columns:
            df[col] = source
        else:
            mask = _empty(df[col])
            df.loc[mask, col] = source[mask].values
    return df


def _phase_rollups(projects: pd.DataFrame, phase: pd.DataFrame) -> pd.DataFrame:
    """Return a copy of Projects with Σ phase financials + derived dates."""
    p = projects.copy()
    if phase.empty or "Project ID" not in phase.columns:
        return p
    g = phase.groupby(phase["Project ID"].astype(str))
    roll = pd.DataFrame({
        "Σ Phase Budget":   g["Phase Budget"].sum(min_count=1),
        "Σ Phase Forecast": g["Phase Forecast"].sum(min_count=1),
        "Σ Phase Actual":   g["Phase Actual Spend"].sum(min_count=1),
        "Earliest Planned Start": g["Planned Start"].min(),
        "Latest Planned End":     g["Planned End"].max(),
        "Earliest Actual Start":  g["Actual Start"].min(),
        "Latest Actual End":      g["Actual End"].max(),
    })
    roll["Σ Phase Remaining"] = (
        roll["Σ Phase Forecast"].fillna(0) - roll["Σ Phase Actual"].fillna(0)
    )
    # Current phase = first row with Status "In Progress" per project.
    if "Status" in phase.columns and "Stage" in phase.columns:
        cur = (phase[phase["Status"].astype(str).str.contains("Progress", case=False, na=False)]
               .groupby(phase["Project ID"].astype(str))["Stage"].first())
        roll["Derived Current Phase"] = cur
    p = p.merge(roll, left_on=p["Project ID"].astype(str), right_index=True, how="left")
    p.drop(columns=[c for c in p.columns if c == "key_0"], inplace=True, errors="ignore")
    # Back-fill Projects.Actual Spend / Current Phase if user left them empty.
    if "Actual Spend" in p.columns and "Σ Phase Actual" in p.columns:
        mask = _empty(p["Actual Spend"]) | (pd.to_numeric(p["Actual Spend"], errors="coerce").fillna(0) == 0)
        p.loc[mask, "Actual Spend"] = p.loc[mask, "Σ Phase Actual"]
    if "Current Phase" in p.columns and "Derived Current Phase" in p.columns:
        mask = _empty(p["Current Phase"])
        p.loc[mask, "Current Phase"] = p.loc[mask, "Derived Current Phase"]
    return p


def _stagegate_current_gate(stagegates: pd.DataFrame) -> pd.DataFrame:
    """One row per Project ID capturing the current gate details.
    Used to back-fill Projects.Current Phase / Gate Status / Next Gate when
    those cells are blank."""
    if stagegates.empty or "Project ID" not in stagegates.columns:
        return pd.DataFrame()
    df = stagegates.copy()
    df["Project ID"] = df["Project ID"].astype(str)
    # Prefer explicit "In Progress" status; fall back to first non-complete.
    in_prog = df[df.get("Status", "").astype(str).str.contains("Progress", case=False, na=False)]
    if not in_prog.empty:
        cur = in_prog.groupby("Project ID").first()
    else:
        not_done = df[~df.get("Status", "").astype(str).str.lower().isin(["complete","closed","done"])]
        cur = not_done.groupby("Project ID").first()
    keep = [c for c in ["Stage","Next Gate","Gate Status","Gate Owner",
                        "Planned Gate Date","Actual Gate Date",
                        "Checklist Complete %","Governance Channel"] if c in cur.columns]
    return cur[keep]


def hydrate(data: dict) -> dict:
    """Enrich a data bundle in place and return it."""
    projects = data.get("projects", pd.DataFrame())
    if projects.empty:
        return data

    # --- Enrich every child sheet with project-level attributes ---
    for key in CHILD_KEYS:
        df = data.get(key)
        if df is None or df.empty:
            continue
        df = _ensure_project_id(df, projects)
        df = _fill_from_projects(df, projects)
        data[key] = df

    # --- Back-fill Projects.Current Phase / Gate Status from StageGates ---
    sg = data.get("stagegates", pd.DataFrame())
    cur = _stagegate_current_gate(sg)
    if not cur.empty:
        p = projects.copy()
        ids = p["Project ID"].astype(str)
        for col in cur.columns:
            proj_col = {"Stage": "Current Phase"}.get(col, col)
            source = ids.map(cur[col])
            if proj_col not in p.columns:
                p[proj_col] = source
            else:
                mask = _empty(p[proj_col])
                p.loc[mask, proj_col] = source[mask].values
        data["projects"] = p
        projects = p

    # --- Phase financial rollups on an enriched projects copy ---
    phase = data.get("phasefinancials", pd.DataFrame())
    data["projects_enriched"] = _phase_rollups(projects, phase)

    return data
