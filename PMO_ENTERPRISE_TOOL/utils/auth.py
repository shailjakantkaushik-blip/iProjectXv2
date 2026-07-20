"""Lightweight multi-user auth for the Streamlit PMO app.

Storage: `data/users.json` (created on first run with a default admin).
Passwords: PBKDF2-HMAC-SHA256, 200k iterations, per-user random salt.
Session: `st.session_state["auth_user"]` holds the signed-in user record.

Roles
-----
    admin      — full access, manages users & config
    executive  — read-only across everything
    bu_lead    — can edit projects in their assigned Business Units / Programs
    pm         — can edit ONLY projects where Projects.PM == their username

Public helpers used by pages:

    login_gate()              — call at top of app.py before rendering nav
    current_user()            — dict | None
    current_role()            — 'admin'|'executive'|'bu_lead'|'pm'| ...
    require_role([...])       — st.stop() unless allowed
    can_edit_project(row)     — bool, given a Projects row (Series or dict)
    filter_editable(projects) — DataFrame of rows the current user can edit
    is_admin() / is_readonly()

The Users JSON never contains plaintext passwords; only salt + hash.
"""
from __future__ import annotations
import json
import hashlib
import hmac
import os
import secrets
from urllib.parse import quote, unquote
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterable
import streamlit as st

# ─────────────────────────── storage ───────────────────────────
_USERS_FILE = Path(__file__).resolve().parent.parent / "data" / "users.json"
_USERS_FILE.parent.mkdir(parents=True, exist_ok=True)
_SECRET_FILE = _USERS_FILE.parent / ".session_secret"
_COOKIE_NAME = "pmo_auth"
_COOKIE_DAYS = 14


def _get_secret() -> bytes:
    if _SECRET_FILE.exists():
        return _SECRET_FILE.read_bytes()
    s = secrets.token_bytes(32)
    _SECRET_FILE.write_bytes(s)
    return s


def _sign(username: str, exp_ts: int) -> str:
    msg = f"{username}|{exp_ts}".encode()
    sig = hmac.new(_get_secret(), msg, hashlib.sha256).hexdigest()
    return f"{username}|{exp_ts}|{sig}"


def _verify(token: str) -> str | None:
    token = unquote(str(token or ""))
    try:
        username, exp_str, sig = token.split("|", 2)
        exp_ts = int(exp_str)
    except Exception:
        return None
    expected = hmac.new(_get_secret(),
                        f"{username}|{exp_ts}".encode(),
                        hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    if datetime.utcnow().timestamp() > exp_ts:
        return None
    return username


def _cookie_manager():
    """Return a cached CookieManager (or None if the lib is missing)."""
    try:
        import extra_streamlit_components as stx
    except Exception:
        return None
    if "_cookie_mgr" not in st.session_state:
        st.session_state["_cookie_mgr"] = stx.CookieManager(key="pmo_cookie_mgr")
    return st.session_state["_cookie_mgr"]


def _context_cookie() -> str | None:
    """Read the browser cookie directly when supported by Streamlit.

    This is faster and more reliable on deep links than waiting for the
    third-party cookie component to hydrate after a full-page navigation.
    """
    try:
        return st.context.cookies.get(_COOKIE_NAME)  # Streamlit >= 1.37-ish
    except Exception:
        return None


def _browser_cookie_script(token: str | None, *, reload_after: bool = False):
    """Set/delete the auth cookie in the parent browser document.

    CookieManager is still used as the primary component API, but this small
    fallback avoids losing the cookie when Streamlit reruns immediately after
    login/logout and ensures the cookie is scoped to the app root path.
    """
    try:
        import streamlit.components.v1 as components
    except Exception:
        return
    if token:
        value = quote(token, safe="")
        max_age = _COOKIE_DAYS * 24 * 60 * 60
        cookie_js = (
            f"{_COOKIE_NAME}={value}; path=/; max-age={max_age}; SameSite=Lax"
        )
    else:
        cookie_js = (
            f"{_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; "
            "SameSite=Lax"
        )
    reload_js = "setTimeout(() => window.parent.location.reload(), 250);" if reload_after else ""
    components.html(
        f"""
        <script>
        try {{ window.parent.document.cookie = {json.dumps(cookie_js)}; }} catch (e) {{}}
        {reload_js}
        </script>
        """,
        height=0,
        width=0,
    )


ROLES = ["admin", "executive", "bu_lead", "pm"]
ROLE_LABELS = {
    "admin":     "Administrator",
    "executive": "Executive (Read-only)",
    "bu_lead":   "BU / Program Lead",
    "pm":        "Project Manager",
}


def _hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), 200_000
    ).hex()


def _new_user_record(username: str, password: str, role: str,
                     display_name: str = "", email: str = "",
                     business_units: list[str] | None = None,
                     programs: list[str] | None = None,
                     must_change_password: bool = False) -> dict:
    salt = secrets.token_hex(16)
    return {
        "username":       username.strip().lower(),
        "display_name":   display_name or username,
        "email":          email,
        "role":           role if role in ROLES else "executive",
        "business_units": business_units or [],
        "programs":       programs or [],
        "salt":           salt,
        "password_hash":  _hash_password(password, salt),
        "must_change_password": bool(must_change_password),
        "created_at":     datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "active":         True,
    }


def _load_users() -> dict:
    if not _USERS_FILE.exists():
        # Seed with a default admin. Force password change on first login.
        seed = {"users": [_new_user_record(
            "admin", "admin", "admin",
            display_name="Administrator",
            must_change_password=True,
        )]}
        _USERS_FILE.write_text(json.dumps(seed, indent=2))
        return seed
    try:
        return json.loads(_USERS_FILE.read_text())
    except Exception:
        return {"users": []}


def _save_users(store: dict) -> None:
    _USERS_FILE.write_text(json.dumps(store, indent=2))


# ─────────────────────────── user CRUD ───────────────────────────
def list_users() -> list[dict]:
    return _load_users().get("users", [])


def get_user(username: str) -> dict | None:
    u = (username or "").strip().lower()
    for r in list_users():
        if r["username"] == u:
            return r
    return None


def add_user(username: str, password: str, role: str, **kwargs) -> tuple[bool, str]:
    if not username or not password:
        return False, "Username and password are required."
    if get_user(username):
        return False, f"User '{username}' already exists."
    if role not in ROLES:
        return False, f"Invalid role '{role}'."
    store = _load_users()
    store.setdefault("users", []).append(
        _new_user_record(username, password, role, **kwargs)
    )
    _save_users(store)
    return True, f"User '{username}' created."


def update_user(username: str, **updates) -> tuple[bool, str]:
    store = _load_users()
    for i, r in enumerate(store.get("users", [])):
        if r["username"] == username.strip().lower():
            for k, v in updates.items():
                if k in ("username", "salt", "password_hash", "created_at"):
                    continue  # immutable via this path
                r[k] = v
            store["users"][i] = r
            _save_users(store)
            return True, "Saved."
    return False, f"User '{username}' not found."


def set_password(username: str, new_password: str,
                 must_change: bool = False) -> tuple[bool, str]:
    if not new_password or len(new_password) < 6:
        return False, "Password must be at least 6 characters."
    store = _load_users()
    for i, r in enumerate(store.get("users", [])):
        if r["username"] == username.strip().lower():
            salt = secrets.token_hex(16)
            r["salt"] = salt
            r["password_hash"] = _hash_password(new_password, salt)
            r["must_change_password"] = must_change
            store["users"][i] = r
            _save_users(store)
            return True, "Password updated."
    return False, f"User '{username}' not found."


def delete_user(username: str) -> tuple[bool, str]:
    store = _load_users()
    remaining = [r for r in store.get("users", []) if r["username"] != username.strip().lower()]
    # Never allow deletion of the last admin
    admins = [r for r in remaining if r.get("role") == "admin" and r.get("active", True)]
    if not admins:
        return False, "Cannot delete the last active admin."
    store["users"] = remaining
    _save_users(store)
    return True, f"User '{username}' deleted."


def verify_credentials(username: str, password: str) -> dict | None:
    u = get_user(username)
    if not u or not u.get("active", True):
        return None
    if _hash_password(password, u["salt"]) == u["password_hash"]:
        return u
    return None


# ─────────────────────────── session helpers ───────────────────────────
def current_user() -> dict | None:
    return st.session_state.get("auth_user")


def current_role() -> str | None:
    u = current_user()
    return u["role"] if u else None


def is_admin() -> bool:
    return current_role() == "admin"


def is_readonly() -> bool:
    return current_role() == "executive"


def _set_auth_cookie(username: str) -> str | None:
    cm = _cookie_manager()
    exp_ts = int((datetime.utcnow() + timedelta(days=_COOKIE_DAYS)).timestamp())
    token = _sign(username, exp_ts)
    if cm is not None:
        try:
            cm.set(_COOKIE_NAME, token,
                   expires_at=datetime.utcnow() + timedelta(days=_COOKIE_DAYS),
                   key="_cookie_set")
        except Exception:
            pass
    _browser_cookie_script(token)
    return token


def _clear_auth_cookie():
    cm = _cookie_manager()
    if cm is not None:
        try:
            cm.delete(_COOKIE_NAME, key="_cookie_del")
        except Exception:
            pass
    _browser_cookie_script(None)


def _try_restore_from_cookie() -> bool:
    """If no session_state user, try to restore from the signed cookie."""
    if current_user():
        return True
    token = _context_cookie()
    if not token:
        cm = _cookie_manager()
        if cm is None:
            return False
        try:
            token = cm.get(_COOKIE_NAME)
        except Exception:
            token = None
    if not token:
        return False
    username = _verify(token)
    if not username:
        return False
    user = get_user(username)
    if not user or not user.get("active", True):
        return False
    st.session_state["auth_user"] = user
    return True


def logout():
    for k in ("auth_user",):
        st.session_state.pop(k, None)
    _clear_auth_cookie()


# ─────────────────────────── login UI ───────────────────────────
def _login_form():
    st.markdown("## 🔐 PMO Portfolio — Sign in")
    with st.form("login_form", clear_on_submit=False):
        username = st.text_input("Username", key="_login_username")
        password = st.text_input("Password", type="password", key="_login_password")
        remember = st.checkbox("Keep me signed in on this browser", value=True)
        submitted = st.form_submit_button("Sign in", type="primary",
                                          use_container_width=True)
    if submitted:
        user = verify_credentials(username, password)
        if user:
            st.session_state["auth_user"] = user
            if remember:
                token = _set_auth_cookie(user["username"])
                st.success("Signed in. Loading your workspace…")
                _browser_cookie_script(token, reload_after=True)
                st.stop()
            else:
                st.rerun()
        else:
            st.error("Invalid username or password.")


    with st.expander("First-time setup?"):
        st.caption(
            "Default administrator: **admin / admin**. "
            "You will be prompted to change the password on first sign-in. "
            "Users are stored in `data/users.json` and can be managed from "
            "**Governance & Insights → Admin: Users** once you're signed in."
        )


def _force_password_change():
    u = current_user()
    st.markdown(f"## 🔑 Change password — {u['username']}")
    st.info("Your administrator requires you to set a new password before continuing.")
    with st.form("force_pw_form", clear_on_submit=True):
        p1 = st.text_input("New password", type="password")
        p2 = st.text_input("Confirm new password", type="password")
        ok = st.form_submit_button("Update password", type="primary")
    if ok:
        if p1 != p2:
            st.error("Passwords do not match.")
        else:
            success, msg = set_password(u["username"], p1, must_change=False)
            if success:
                # refresh session record
                st.session_state["auth_user"] = get_user(u["username"])
                st.success("Password updated.")
                st.rerun()
            else:
                st.error(msg)


def login_gate():
    """Blocks the app until the user is signed in AND has cleared any
    forced-password-change. Call once at the top of app.py before nav."""
    cm = _cookie_manager()
    if not current_user():
        _try_restore_from_cookie()
    if not current_user():
        # Cookie manager returns {} on its very first render, then re-runs once
        # the browser posts the real cookies. Avoid flashing the login form
        # during that first pass.
        if cm is not None and not st.session_state.get("_cookie_hydrated"):
            try:
                all_cookies = cm.get_all(key="_cookie_hydrate") or {}
            except Exception:
                all_cookies = {}
            st.session_state["_cookie_hydrated"] = True
            token = _context_cookie() or (all_cookies.get(_COOKIE_NAME) if all_cookies else None)
            if token:
                username = _verify(token)
                if username:
                    user = get_user(username)
                    if user and user.get("active", True):
                        st.session_state["auth_user"] = user
                        st.rerun()
            if not all_cookies:
                st.info("Loading session…")
                st.stop()
        _login_form()
        st.stop()
    if current_user().get("must_change_password"):
        _force_password_change()
        st.stop()




# ─────────────────────────── access-control helpers ───────────────────────────
def require_role(allowed: Iterable[str]):
    """st.stop() and show a message if the current user's role isn't allowed."""
    role = current_role()
    if role not in set(allowed):
        st.error("⛔ You don't have permission to view this page.")
        st.caption(f"Required role: {', '.join(allowed)} · Your role: {role}")
        st.stop()


def can_edit_project(row) -> bool:
    """Return True if the current user can edit this project row (dict/Series)."""
    role = current_role()
    if role == "admin":
        return True
    if role in (None, "executive"):
        return False
    u = current_user() or {}
    if role == "pm":
        pm = str(row.get("PM", "") or "").strip().lower()
        return pm and pm == u["username"].lower()
    if role == "bu_lead":
        bu = str(row.get("Business Unit", "") or "")
        pg = str(row.get("Program", "") or "")
        return (bu in u.get("business_units", [])) or (pg in u.get("programs", []))
    return False


def filter_editable(projects_df):
    """Return only the projects the current user can edit."""
    if projects_df is None or len(projects_df) == 0:
        return projects_df
    role = current_role()
    if role == "admin":
        return projects_df
    if role in (None, "executive"):
        return projects_df.iloc[0:0]
    mask = projects_df.apply(can_edit_project, axis=1)
    return projects_df[mask]


# ─────────────────────────── sidebar badge ───────────────────────────
def sidebar_user_badge():
    u = current_user()
    if not u:
        return
    st.sidebar.markdown("---")
    st.sidebar.markdown(
        f"**👤 {u.get('display_name') or u['username']}**  \n"
        f"<span style='opacity:.7'>Role: {ROLE_LABELS.get(u['role'], u['role'])}</span>",
        unsafe_allow_html=True,
    )
    c1, c2 = st.sidebar.columns(2)
    if c1.button("🔑 Password", use_container_width=True, key="_sb_pw"):
        st.session_state["_show_change_pw"] = True
    if c2.button("🚪 Sign out", use_container_width=True, key="_sb_out"):
        logout()
        _browser_cookie_script(None, reload_after=True)
        st.stop()

    if st.session_state.get("_show_change_pw"):
        with st.sidebar.expander("Change password", expanded=True):
            p1 = st.text_input("New password", type="password", key="_cp1")
            p2 = st.text_input("Confirm", type="password", key="_cp2")
            if st.button("Update", key="_cp_go", use_container_width=True):
                if p1 != p2:
                    st.error("Passwords do not match.")
                elif len(p1) < 6:
                    st.error("Min 6 characters.")
                else:
                    ok, msg = set_password(u["username"], p1)
                    if ok:
                        st.session_state["auth_user"] = get_user(u["username"])
                        st.session_state["_show_change_pw"] = False
                        st.success("Updated.")
                        st.rerun()
                    else:
                        st.error(msg)
