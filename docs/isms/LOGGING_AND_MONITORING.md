# Logging and Monitoring Standard

**Effective:** 2026-07-25  
**Updated:** 2026-07-25 (security_events table)

## 1. Where events are stored

| Store | Purpose | Who can read |
|-------|---------|--------------|
| `security_events` | Platform security stream (org optional) | **`platform_admin` only** (UI: Platform → Security events) |
| `audit_events` | Tenant governance audit | **`org_admin` / `admin`** of that org, or `platform_admin` (UI: Audit Log) — **not** end users |

## 2. Security events recorded

| Event | Source |
|-------|--------|
| Login success | `recordAuthSecurityEvent` after password / MFA |
| Login failure | `recordFailedLogin` → `security_events` (`login_failed`) |
| Logout | `AuthContext.signOut` + auth/MFA sign-out paths |
| User create / activate / deactivate / delete | Admin server functions |
| Role assign / remove | Admin server functions |
| Password change (forced) | `completeForcedPasswordChange` |
| Org create | Platform admin |
| Invoice email | Billing paths |
| EOI submit | Public EOI server function |
| Project purge | Purge functions |

## 3. Fields
`actor_user_id`, `org_id` (nullable), `event_type`, `summary`, `email`, `meta` (includes IP/UA when available), `created_at`.

## 4. Integrity
- Client cannot INSERT into `security_events` (service role only).
- `audit_events` INSERT for members restricted to org admins; privileged paths use service role.

## 5. Retention
Retain security/audit events **≥ 12 months** (Supabase backups / export for longer contracts).

## 6. Monitoring checklist
- Weekly: failed-login spikes in `security_events`
- Alert path (future): forward to SIEM / email on threshold
