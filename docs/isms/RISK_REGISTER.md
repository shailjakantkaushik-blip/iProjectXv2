# Risk Register (living)

**Last updated:** 2026-07-30  

| ID | Risk | Inherent | Residual | Treatment | Owner |
|----|------|----------|----------|-----------|-------|
| R1 | XSS steals browser session | High | Medium | sessionStorage + CSP + DOMPurify + MFA for all users | Engineering |
| R2 | Admin account takeover | High | Low | Mandatory TOTP MFA (AAL2) for all users incl. BYOD proxy | Engineering |
| R3 | Vulnerable spreadsheet parser | High | Low | Removed `xlsx`; use `read-excel-file` / `write-excel-file` | Engineering |
| R4 | Incomplete auth monitoring | Medium | Low | Login/logout/fail logging + BYOD mutation events + ISMS logging | Engineering |
| R5 | Tenant breakout via RLS gap | High | Low | Hardening migration + ongoing policy reviews | Engineering |
| R6 | Open billing automation | Critical | Low | Fail-closed cron secret | Engineering |
| R7 | Formal ISMS / SOC evidence gap | High | Medium | Policy pack in `docs/isms` + operational reviews (Type II period) | Security owner |
| R8 | No malware scanning on uploads | Medium | Medium | Size limits; SVG caution; future scanning | Engineering |
| R9 | BYOD service-role privilege escalation | High | Low | AAL2 + role/project/timesheet authz on `/api/byod/rest/$` (2026-07-30) | Engineering |
| R10 | Customer BYOD host failure / weak DR | Medium | Medium | Shared-responsibility docs; customer backups required when BYOD on | Customer + Security |

## Scoring
High = material customer or certification impact if untreated.  
Residual assumes listed treatments are deployed in production.
