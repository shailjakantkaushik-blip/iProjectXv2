# Information Security Policy

**Product:** iProjectX  
**Effective:** 2026-07-25  
**Classification:** Internal  

## 1. Purpose
Protect confidentiality, integrity, and availability of customer PMO data and the iProjectX platform.

## 2. Scope
All production systems, source code, employee/contractor access, and subprocessors used to deliver iProjectX SaaS.

## 3. Principles
1. Least privilege and role-based access  
2. Defence in depth (app controls + Postgres RLS + hosting controls)  
3. Secure by default configuration  
4. Auditability of privileged actions  
5. Privacy by design (GDPR / Australian Privacy Principles)

## 4. Roles
| Role | Responsibility |
|------|----------------|
| Platform admin | Production config, org provisioning, billing |
| Org admin | Tenant users, roles, org settings |
| All users | Protect credentials; report incidents |

## 5. Acceptable use
Users must not attempt to bypass access controls, share credentials, or exfiltrate data outside authorised channels.

## 6. Exceptions
Documented risk acceptance by the Security owner, time-bound, with compensating controls.

## 7. Review
This policy is reviewed at least annually.
