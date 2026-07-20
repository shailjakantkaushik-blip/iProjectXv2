"""32 · Admin — Users & Roles (admin-only).

Manage the app's users: create, remove, deactivate, reset passwords, assign
roles, and scope BU Leads to specific Business Units / Programs.
"""
from __future__ import annotations
import pandas as pd
import streamlit as st
from utils import auth as _auth; _auth.login_gate()
_auth.require_role(['admin'])

from utils.theme_manager import apply_theme
from utils.excel_loader import load_all
from utils import auth

apply_theme()
auth.require_role(["admin"])

st.title("🛡️ Admin — Users & Roles")
st.caption("Create, remove, and manage user accounts. "
           "Users are stored in `data/users.json`.")

# Reference lists to power the assignment multi-selects
data = load_all()
projects = data.get("projects", pd.DataFrame())
BU_OPTIONS = sorted([b for b in projects.get("Business Unit", pd.Series(dtype=str)).dropna().unique().tolist() if b])
PG_OPTIONS = sorted([p for p in projects.get("Program",       pd.Series(dtype=str)).dropna().unique().tolist() if p])

# ─────────────────────────── EXISTING USERS ───────────────────────────
st.subheader("Existing users")
users = auth.list_users()
if not users:
    st.info("No users configured yet.")
else:
    df = pd.DataFrame([{
        "Username":     u["username"],
        "Display Name": u.get("display_name", ""),
        "Role":         auth.ROLE_LABELS.get(u["role"], u["role"]),
        "Email":        u.get("email", ""),
        "Business Units": ", ".join(u.get("business_units", []) or []),
        "Programs":     ", ".join(u.get("programs", []) or []),
        "Active":       "✅" if u.get("active", True) else "⛔",
        "Must Change PW": "⚠️" if u.get("must_change_password") else "",
        "Created":      u.get("created_at", "")[:10],
    } for u in users])
    st.dataframe(df, use_container_width=True, hide_index=True)

st.markdown("---")

# ─────────────────────────── ADD USER ───────────────────────────
st.subheader("➕ Add user")
with st.form("add_user_form", clear_on_submit=True):
    c1, c2, c3 = st.columns(3)
    with c1:
        new_username = st.text_input("Username *")
        new_display  = st.text_input("Display name")
        new_email    = st.text_input("Email")
    with c2:
        new_role     = st.selectbox("Role *", options=auth.ROLES,
                                    format_func=lambda r: auth.ROLE_LABELS[r])
        new_pw       = st.text_input("Initial password *", type="password")
        force_change = st.checkbox("Force password change on first login", value=True)
    with c3:
        new_bus = st.multiselect("Business Units (BU Lead)", options=BU_OPTIONS,
                                 help="Projects in these BUs are editable by this user.")
        new_pgs = st.multiselect("Programs (BU Lead)", options=PG_OPTIONS,
                                 help="Projects in these Programs are editable by this user.")
    submitted = st.form_submit_button("Create user", type="primary")
    if submitted:
        ok, msg = auth.add_user(
            new_username, new_pw, new_role,
            display_name=new_display, email=new_email,
            business_units=new_bus, programs=new_pgs,
            must_change_password=force_change,
        )
        (st.success if ok else st.error)(msg)
        if ok:
            st.rerun()

st.markdown("---")

# ─────────────────────────── EDIT USER ───────────────────────────
st.subheader("✏️ Edit / Reset / Deactivate")
if not users:
    st.stop()

pick = st.selectbox("Select user", options=[u["username"] for u in users])
u = auth.get_user(pick)
if not u:
    st.stop()

c1, c2 = st.columns(2)

# --- Edit profile & role
with c1:
    st.markdown("**Profile & role**")
    with st.form(f"edit_{pick}"):
        e_display = st.text_input("Display name", value=u.get("display_name", ""))
        e_email   = st.text_input("Email", value=u.get("email", ""))
        e_role    = st.selectbox("Role", options=auth.ROLES,
                                 index=auth.ROLES.index(u["role"]) if u["role"] in auth.ROLES else 0,
                                 format_func=lambda r: auth.ROLE_LABELS[r])
        e_bus     = st.multiselect("Business Units", options=BU_OPTIONS,
                                   default=[b for b in u.get("business_units", []) if b in BU_OPTIONS])
        e_pgs     = st.multiselect("Programs", options=PG_OPTIONS,
                                   default=[p for p in u.get("programs", []) if p in PG_OPTIONS])
        e_active  = st.checkbox("Active", value=u.get("active", True))
        save = st.form_submit_button("Save changes", type="primary")
        if save:
            ok, msg = auth.update_user(
                pick, display_name=e_display, email=e_email, role=e_role,
                business_units=e_bus, programs=e_pgs, active=e_active,
            )
            (st.success if ok else st.error)(msg)
            if ok:
                st.rerun()

# --- Reset password / delete
with c2:
    st.markdown("**Reset password**")
    with st.form(f"pw_{pick}"):
        new_pw = st.text_input("New password", type="password")
        force  = st.checkbox("Force change on next login", value=True)
        go = st.form_submit_button("Reset password")
        if go:
            ok, msg = auth.set_password(pick, new_pw, must_change=force)
            (st.success if ok else st.error)(msg)

    st.markdown("---")
    st.markdown("**Danger zone**")
    if pick == auth.current_user()["username"]:
        st.caption("You cannot delete yourself.")
    else:
        confirm = st.checkbox(f"Yes, permanently delete `{pick}`", key=f"del_confirm_{pick}")
        if st.button("🗑️ Delete user", disabled=not confirm, type="secondary"):
            ok, msg = auth.delete_user(pick)
            (st.success if ok else st.error)(msg)
            if ok:
                st.rerun()

st.markdown("---")
with st.expander("ℹ️ How role permissions work"):
    st.markdown("""
- **Administrator** — full access. Manages users, edits any project, sees all config screens.
- **Executive** — read-only across the entire portfolio. Cannot edit anything.
- **BU / Program Lead** — can edit projects whose `Business Unit` or `Program` is in their assigned list.
- **Project Manager** — can edit only projects where the `PM` column on the Projects sheet matches their username (case-insensitive).

Edit-guarding is enforced via `utils.auth.can_edit_project(row)`. To lock down
a specific editing widget on any page, wrap it in:

```python
from utils import auth
if auth.can_edit_project(row):
    ...editable widget...
else:
    st.caption("🔒 Read-only for your role.")
```
""")
