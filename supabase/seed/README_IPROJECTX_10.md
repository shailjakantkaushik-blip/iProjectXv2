# iProjectX — 10-project end-to-end seed

**File:** `wipe_seed_iprojectx_10_projects_e2e.sql`  
(also mirrored at `supabase/manual/wipe_seed_iprojectx_10_projects_e2e.sql`)

## What it does

1. Resolves the organisation with `slug = 'iprojectx'` (fails if missing).
2. **Wipes only that org’s** portfolio/operational data.
3. Reseeds **10 projects** with streams, gates, finance, RAID, work items, timesheets, and extras for Health / Pulse / Explain / Executive Intelligence.

## What it does **not** do

- Does **not** modify **Isafex** (or any other organisation).
- Does not delete organizations, profiles, user_roles, or billing/landing config.

## How to run

1. Open Supabase → SQL Editor.
2. Paste the full contents of `wipe_seed_iprojectx_10_projects_e2e.sql`.
3. Run once.
4. Check the verification query at the bottom:
   - **iProjectX** → `projects = 10`
   - **Isafex** → unchanged (still its existing one project)

## Projects seeded (`PRJ-001` … `PRJ-010`)

| Code | Name |
|------|------|
| PRJ-001 | Customer Portal Redesign |
| PRJ-002 | Core Banking API Platform |
| PRJ-003 | Data Lakehouse Foundation |
| PRJ-004 | Cyber Resilience Uplift |
| PRJ-005 | Contact Centre Omnichannel |
| PRJ-006 | Finance Close Automation |
| PRJ-007 | HR Self-Service Suite |
| PRJ-008 | Supplier Portal 2.0 |
| PRJ-009 | Branch Network WiFi Refresh |
| PRJ-010 | Regulatory Reporting Engine |

Each has Core + a second stream, stage gates, milestones, FY/monthly financials, RAID, work items, and sample timesheets.
