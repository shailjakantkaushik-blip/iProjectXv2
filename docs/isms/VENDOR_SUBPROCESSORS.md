# Vendor / Subprocessor List

**Effective:** 2026-07-25  
**Updated:** 2026-07-30  
Update this list when adding processors that handle personal data.

| Vendor | Purpose | Data | Region notes |
|--------|---------|------|--------------|
| Supabase | Database, Auth, API (shared data plane) | Account, org, PMO data (default) | Per project region |
| Vercel | App hosting | Request logs, static assets | Per deployment |
| Cloudflare Turnstile | Bot protection on auth | Token / IP (limited) | Cloudflare edge |
| Resend and/or SendGrid | Invoice email | Billing email, invoice content | Provider region |
| Customer-hosted DB (BYOD, optional) | Tenant business data plane when activated | Portfolio / delivery registers | Chosen by Customer — **not** an iProjectX subprocessor |

## Obligations
- DPAs / SCCs where required  
- Review vendor SOC 2 / ISO reports annually  
- Remove unused processors promptly  
- For BYOD: Customer owns the hosting DPA with their database provider
