# Security policy

This repository is iProjectX, a multi-tenant project-controls product. This
file is how to report a vulnerability. It is **not** a SOC 2 report, an
ISO 27001 certificate, or a claim that a given production database has
already applied every migration in `supabase/migrations`.

## Reporting a vulnerability

Use GitHub’s private vulnerability reporting on this repository
(**Security → Report a vulnerability**). Do not open a public issue for
unpatched tenant-isolation, authentication, or encryption bugs.

Include:

- The affected surface (RPC name, table, route, or server function)
- Whether you could read or write another organisation’s rows
- A minimal reproduction without real customer data or live secrets

There is no public bug bounty.

## What this product does not claim

iProjectX is **not** SOC 2 Type II or ISO 27001 certified. Notes in
`docs/SECURITY_AUDIT.md` and `docs/COMPLIANCE_CHECKLIST.md` are engineering
checklists and operator tasks, not auditor opinions.

## Engineering baseline

- Public tenant tables enable **and force** Row Level Security. `service_role`
  still bypasses RLS for admin jobs.
- `SECURITY DEFINER` RPCs either check `get_user_org(auth.uid())` (or a tighter
  admin/home-org rule) or have `EXECUTE` revoked from `authenticated`.
- Platform RAID CRUD uses the caller JWT so RLS applies. BYOD still uses the
  customer service role after a membership check, with allowlisted columns.
- Server functions validate sessions with `supabase.auth.getUser`, which asks
  Auth whether the user still exists.

Treat a control as **deployed** only after the matching migration has been
applied on that Supabase project and the app that calls it is on the same
commit.
