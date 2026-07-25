# Access Control Policy

**Effective:** 2026-07-25  

## 1. Authentication
- Primary IdP: **Supabase Auth** (email/password; OAuth optional)  
- Sessions use **PKCE** and are stored in **sessionStorage** (not localStorage JWTs)  
- **MFA (TOTP authenticator app) is mandatory for every user** and cannot be disabled in-app  
- Minimum password length: **8** characters (forced change for provisioned accounts)  
- Auth security events are written to `security_events` (and `audit_events` when org is known)

### Supabase dashboard requirement
Enable MFA under **Authentication → Multi-factor authentication → TOTP**. Without this, the app cannot enroll factors.

## 2. Authorisation
- Tenant isolation via `org_id` and Postgres **RLS**  
- Privileged server functions assert platform/org admin  
- UI page permissions are secondary to RLS  

## 3. Joiner / Mover / Leaver
| Event | Control |
|-------|---------|
| Joiner | Org/platform admin provisions user; temporary password + forced change |
| Mover | Role assign/remove audited; org_id changes restricted |
| Leaver | Deactivate (`is_active=false` + Auth ban) or platform delete |

## 4. Access reviews
Org admins should review user roles quarterly. Platform admins review `platform_admin` membership quarterly.

## 5. Service accounts
`SUPABASE_SERVICE_ROLE_KEY` and `BILLING_CRON_SECRET` are server-only secrets; never exposed to the browser.
