# Risk Register (living)

**Last updated:** 2026-07-25  

| ID | Risk | Inherent | Residual | Treatment | Owner |
|----|------|----------|----------|-----------|-------|
| R1 | XSS steals browser session | High | Medium | sessionStorage + CSP + DOMPurify + MFA for admins | Engineering |
| R2 | Admin account takeover | High | Medium | Mandatory TOTP MFA for privileged roles | Engineering |
| R3 | Vulnerable spreadsheet parser | High | Low | Removed `xlsx`; use `read-excel-file` / `write-excel-file` | Engineering |
| R4 | Incomplete auth monitoring | Medium | Low | Login/logout/fail logging + ISMS logging standard | Engineering |
| R5 | Tenant breakout via RLS gap | High | Low | Hardening migration + ongoing policy reviews | Engineering |
| R6 | Open billing automation | Critical | Low | Fail-closed cron secret | Engineering |
| R7 | Formal ISMS / SOC evidence gap | High | Medium | Policy pack in `docs/isms` + operational reviews | Security owner |
| R8 | No malware scanning on uploads | Medium | Medium | Size limits; SVG caution; future scanning | Engineering |

## Scoring
High = material customer or certification impact if untreated.  
Residual assumes listed treatments are deployed in production.
