# Logging and Monitoring Standard

**Effective:** 2026-07-25  

## 1. Security events recorded
Stored in `audit_events` (org-scoped) and/or structured server logs:

| Event | Source |
|-------|--------|
| Login success | `recordAuthSecurityEvent` after password / MFA |
| Login failure | `recordFailedLogin` (rate-limited server log) |
| Logout | `signOut` path |
| User create / activate / deactivate / delete | Admin server functions |
| Role assign / remove | Admin server functions |
| Password change (forced) | `completeForcedPasswordChange` |
| Org create | Platform admin |
| Invoice email / billing run | Billing paths |
| EOI submit | Public EOI server function |
| Project purge | Purge functions |

## 2. Fields
Where applicable: actor user id, org id, timestamp, event type, summary, IP/UA (when available), metadata JSON.

## 3. Integrity
End-user forgeable inserts to `audit_events` are restricted to org admins; privileged paths write via service role.

## 4. Retention
Retain security/audit events for a minimum of **12 months** (configure Supabase backups / export for longer customer contractual needs).

## 5. Monitoring
- Review failed-login spikes weekly (Vercel/Supabase logs)  
- Alert on repeated auth failures and unexpected billing-run 401/500 rates  
- Future: forward logs to a SIEM for SOC 2 continuous monitoring evidence
