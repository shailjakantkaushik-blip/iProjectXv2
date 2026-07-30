# Information Security Policy

**Product:** iProjectX  
**Effective:** 2026-07-25  
**Updated:** 2026-07-30  
**Classification:** Internal  

## 1. Purpose
Protect confidentiality, integrity, and availability of customer PMO data and the iProjectX platform.

## 2. Scope
All production systems, source code, employee/contractor access, and subprocessors used to deliver iProjectX SaaS. Optional customer-hosted BYOD databases are Customer-operated for tenant business data; control plane remains in scope for iProjectX.

## 3. Principles
1. Least privilege and role-based access  
2. Defence in depth (app controls + Postgres RLS + BYOD proxy org scope + hosting controls)  
3. Secure by default configuration (MFA required; BYOD and SSO off until configured)  
4. Auditability of privileged actions  
5. Privacy by design (GDPR / Australian Privacy Principles)

## 4. Roles
| Role | Responsibility |
|------|----------------|
| Platform admin | Production config, org provisioning, billing, BYOD activation |
| Org admin | Tenant users, roles, org settings, optional SSO domains |
| All users | Protect credentials; complete MFA; report incidents |

## 5. Acceptable use
Users must not attempt to bypass access controls, share credentials, or exfiltrate data outside authorised channels.

## 6. Current control highlights
- Mandatory TOTP MFA for all users  
- Optional per-org SAML SSO  
- Optional BYOD for tenant registers (auth/control plane stays on iProjectX)  
- CSP, HSTS, PKCE + sessionStorage sessions  
- Admin audit / security event logging  

## 7. Exceptions
Documented risk acceptance by the Security owner, time-bound, with compensating controls.

## 8. Review
This policy is reviewed at least annually.
