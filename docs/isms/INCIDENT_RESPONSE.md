# Incident Response Procedure

**Effective:** 2026-07-25  

## 1. Definition
A security incident is any confirmed or reasonably suspected unauthorised access, data exposure, malware, credential theft, or availability attack affecting iProjectX or customer data.

## 2. Severity
| Level | Example | Response target |
|-------|---------|-----------------|
| Sev-1 | Confirmed tenant data breach | Immediate |
| Sev-2 | Privilege escalation / auth bypass | Same day |
| Sev-3 | Limited abuse / spam | Next business day |

## 3. Steps
1. **Detect** — monitoring, user report, vendor advisory  
2. **Contain** — revoke sessions, rotate secrets, disable accounts, WAF rules  
3. **Eradicate** — patch, remove malicious access, apply migrations  
4. **Recover** — restore service, verify integrity  
5. **Notify** — affected customers per contract / APP / GDPR timelines  
6. **Post-incident** — root cause, corrective actions, update risk register  

## 4. Contacts
Maintain an on-call list for Platform admin + Security owner (store outside this repo in your ops wiki).

## 5. Evidence
Preserve relevant `audit_events`, Vercel logs, and Supabase Auth logs for investigation.
