# Vendor / Subprocessor List

**Effective:** 2026-07-25  
Update this list when adding processors that handle personal data.

| Vendor | Purpose | Data | Region notes |
|--------|---------|------|--------------|
| Supabase | Database, Auth, API | Account, org, PMO data | Per project region |
| Vercel | App hosting | Request logs, static assets | Per deployment |
| Cloudflare Turnstile | Bot protection on auth | Token / IP (limited) | Cloudflare edge |
| Resend and/or SendGrid | Invoice email | Billing email, invoice content | Provider region |

## Obligations
- DPAs / SCCs where required  
- Review vendor SOC 2 / ISO reports annually  
- Remove unused processors promptly  
