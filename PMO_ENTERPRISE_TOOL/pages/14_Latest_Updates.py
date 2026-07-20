"""Latest Updates — track important project updates.

Stores updates in `data/updates.json` so the master Excel is not modified.
Supports add / edit / delete with project pick-list pulled from the
Projects sheet of the active workbook.
"""
from __future__ import annotations
import json
import uuid
from datetime import datetime, date
from pathlib import Path

import pandas as pd
import streamlit as st
from utils import auth as _auth; _auth.login_gate()

from config import DATA_DIR
from utils.excel_loader import load_all
from utils.theme_manager import apply_theme, render_sheet

apply_theme()


st.title("📣 Latest Updates")
st.caption("Capture important project updates. Add, edit or delete entries — "
           "shown newest first.")

UPDATES_FILE: Path = DATA_DIR / "updates.json"
CATEGORIES = ["Milestone", "Risk", "Decision", "Status Change",
              "Dependency", "Resource", "Financial", "General"]
IMPACTS = ["High", "Medium", "Low"]


# ─────────────────────────── storage ───────────────────────────
def _load() -> list[dict]:
    if not UPDATES_FILE.exists():
        return []
    try:
        return json.loads(UPDATES_FILE.read_text() or "[]")
    except Exception:
        return []


def _save(items: list[dict]) -> None:
    UPDATES_FILE.write_text(json.dumps(items, indent=2, default=str))


def _project_list() -> list[str]:
    try:
        projects = load_all().get("projects", pd.DataFrame())
        for col in ("Project", "Project Name", "Name"):
            if col in projects.columns:
                vals = sorted({str(v).strip() for v in projects[col].dropna()
                               if str(v).strip()})
                if vals:
                    return vals
    except Exception:
        pass
    return []


updates = _load()
projects = _project_list()

# ─────────────────────────── add / edit form ───────────────────────────
edit_id = st.session_state.get("update_edit_id")
editing = next((u for u in updates if u.get("id") == edit_id), None)

with st.expander("➕ Add new update" if not editing else "✏️ Edit update",
                 expanded=bool(editing)):
    with st.form("update_form", clear_on_submit=not editing):
        c1, c2, c3 = st.columns([2, 1, 1])
        if projects:
            default_proj = editing["project"] if editing and editing.get("project") in projects else projects[0]
            project = c1.selectbox("Project", projects,
                                   index=projects.index(default_proj))
        else:
            project = c1.text_input("Project",
                                    value=editing.get("project", "") if editing else "")
        category = c2.selectbox("Category", CATEGORIES,
                                index=CATEGORIES.index(editing["category"])
                                if editing and editing.get("category") in CATEGORIES else 0)
        impact = c3.selectbox("Impact", IMPACTS,
                              index=IMPACTS.index(editing["impact"])
                              if editing and editing.get("impact") in IMPACTS else 1)

        c4, c5 = st.columns([2, 1])
        title = c4.text_input("Title",
                              value=editing.get("title", "") if editing else "",
                              placeholder="Short headline")
        try:
            default_date = datetime.fromisoformat(editing["date"]).date() if editing else date.today()
        except Exception:
            default_date = date.today()
        upd_date = c5.date_input("Update date", value=default_date)

        details = st.text_area("Details",
                               value=editing.get("details", "") if editing else "",
                               height=140,
                               placeholder="Describe the update, impact, next steps…")
        author = st.text_input("Author",
                               value=editing.get("author", "") if editing else "")

        b1, b2 = st.columns([1, 1])
        submitted = b1.form_submit_button(
            "💾 Save changes" if editing else "➕ Add update",
            use_container_width=True, type="primary")
        cancel = b2.form_submit_button("Cancel", use_container_width=True) if editing else False

        if submitted:
            if not title.strip():
                st.error("Title is required.")
            elif not project or not str(project).strip():
                st.error("Project is required.")
            else:
                now = datetime.utcnow().isoformat(timespec="seconds")
                if editing:
                    editing.update({
                        "project": project, "category": category, "impact": impact,
                        "title": title.strip(), "details": details.strip(),
                        "author": author.strip(), "date": upd_date.isoformat(),
                        "updated_at": now,
                    })
                else:
                    updates.append({
                        "id": uuid.uuid4().hex,
                        "project": project, "category": category, "impact": impact,
                        "title": title.strip(), "details": details.strip(),
                        "author": author.strip(), "date": upd_date.isoformat(),
                        "created_at": now, "updated_at": now,
                    })
                _save(updates)
                st.session_state.pop("update_edit_id", None)
                st.success("Saved."); st.rerun()
        if cancel:
            st.session_state.pop("update_edit_id", None)
            st.rerun()

# ─────────────────────────── filters ───────────────────────────
st.markdown("### Filter")
f1, f2, f3 = st.columns(3)
proj_opts = sorted({u["project"] for u in updates if u.get("project")})
cat_opts = sorted({u["category"] for u in updates if u.get("category")})
imp_opts = [i for i in IMPACTS if any(u.get("impact") == i for u in updates)]
f_proj = f1.multiselect("Project", proj_opts)
f_cat = f2.multiselect("Category", cat_opts)
f_imp = f3.multiselect("Impact", imp_opts)

filtered = updates
if f_proj: filtered = [u for u in filtered if u.get("project") in f_proj]
if f_cat:  filtered = [u for u in filtered if u.get("category") in f_cat]
if f_imp:  filtered = [u for u in filtered if u.get("impact") in f_imp]

filtered = sorted(filtered, key=lambda u: u.get("date", ""), reverse=True)

st.markdown(f"### {len(filtered)} update(s)")

if not filtered:
    st.info("No updates yet. Add your first one above.")
else:
    impact_color = {"High": "#ef4444", "Medium": "#f59e0b", "Low": "#22c55e"}
    for u in filtered:
        with st.container(border=True):
            top = st.columns([5, 1, 1])
            color = impact_color.get(u.get("impact", ""), "#64748b")
            top[0].markdown(
                f"**{u.get('title','(no title)')}**  \n"
                f"<span style='color:{color};font-weight:600'>● {u.get('impact','')}</span> "
                f"· `{u.get('category','')}` · **{u.get('project','')}** · "
                f"{u.get('date','')}"
                + (f" · _by {u['author']}_" if u.get("author") else ""),
                unsafe_allow_html=True,
            )
            if top[1].button("✏️ Edit", key=f"edit_{u['id']}", use_container_width=True):
                st.session_state["update_edit_id"] = u["id"]
                st.rerun()
            if top[2].button("🗑️ Delete", key=f"del_{u['id']}", use_container_width=True):
                st.session_state[f"confirm_{u['id']}"] = True
            if u.get("details"):
                st.markdown(u["details"])
            if st.session_state.get(f"confirm_{u['id']}"):
                st.warning("Delete this update?")
                d1, d2, _ = st.columns([1, 1, 4])
                if d1.button("Yes, delete", key=f"yes_{u['id']}", type="primary"):
                    updates = [x for x in updates if x.get("id") != u["id"]]
                    _save(updates)
                    st.session_state.pop(f"confirm_{u['id']}", None)
                    st.rerun()
                if d2.button("Cancel", key=f"no_{u['id']}"):
                    st.session_state.pop(f"confirm_{u['id']}", None)
                    st.rerun()

    # Table + CSV export
    with st.expander("📋 Table view / export"):
        df = pd.DataFrame(filtered)[
            [c for c in ["date", "project", "category", "impact",
                         "title", "details", "author"]
             if c in pd.DataFrame(filtered).columns]
        ]
        render_sheet(df)
        st.download_button("⬇️ Download CSV",
                           df.to_csv(index=False).encode("utf-8"),
                           file_name="latest_updates.csv",
                           mime="text/csv")
