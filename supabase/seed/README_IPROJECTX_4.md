# iProjectX — 4-project end-to-end seed

**File:** `wipe_seed_iprojectx_4_projects_e2e.sql`  
(also mirrored at `supabase/manual/wipe_seed_iprojectx_4_projects_e2e.sql`)

## Prerequisites
1. Full schema applied  
2. Fresh bootstrap run (`fresh_seed_platform_admin.sql`) so org `iprojectx` and `admin@iprojectx.com` exist

## What it does
1. Resolves org `slug = 'iprojectx'` (fail-closed)  
2. Wipes that org’s portfolio/operational data only  
3. Seeds **4 projects** end-to-end: streams, **planned stage gates per stream**, FY/monthly finance, RAID, work items, timesheets, meeting summaries, **forecast phases from those planned gate dates**, scenarios, etc.

## Projects
| Code | Name | Method |
|------|------|--------|
| PRJ-001 | Customer Portal Redesign | Hybrid |
| PRJ-002 | Core Banking API Platform | Agile |
| PRJ-003 | Data Lakehouse Foundation | Waterfall |
| PRJ-004 | Cyber Resilience Uplift | Hybrid |

Each project has **Core + one extra stream**. When the delivery method uses stage gates, the same template is written onto **every stream** with stream-specific planned dates. Forecast Estimation then shows those phases per stream.

## How to run
1. Supabase SQL Editor → paste full file → Run  
2. Verify: `projects = 4`, `streams = 8`, `forecasts = 4`, `forecast_phases` ≈ `stage_gates` for iProjectX  

Raw:  
https://raw.githubusercontent.com/shailjakantkaushik-blip/iProjectXv2/main/supabase/manual/wipe_seed_iprojectx_4_projects_e2e.sql
