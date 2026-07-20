## Goal
Ensure every page renders cleanly and keeps the same visual alignment on mobile, tablet, laptop, and large desktop — no clipped headers, no horizontal page scroll, no overlapping controls.

## Approach
Fix the shared building blocks first (the shell + reusable components). That covers ~80% of pages automatically. Then sweep the heavy custom pages (timelines, dashboards, tables) individually.

### 1. App shell (`src/components/app-shell.tsx`)
- Collapsible sidebar: drawer on mobile (< 768px) via a hamburger toggle in a sticky top bar; fixed sidebar from `md:` up.
- Sticky mobile top bar showing logo, page title, and menu button.
- Main content: `min-w-0`, safe padding scale (`p-3 sm:p-5 lg:p-6`), no fixed widths.
- Sign-out / org switcher move into the mobile drawer.

### 2. Reusable primitives (`src/components/streamlit.tsx`)
- `PageHeading`: grid layout so title truncates instead of pushing action buttons off-screen.
- `SectionFrame`: horizontal padding scales down on mobile.
- `KpiCard` grids everywhere: standardize to `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` pattern with `min-w-0` on the value.
- Filter bars: wrap into `flex flex-wrap gap-2` with `w-full sm:w-auto` selects.

### 3. Tables (all register/data pages)
Wrap every `<table class="st-table">` in `<div class="overflow-x-auto -mx-3 sm:mx-0">` so wide tables scroll horizontally within the page instead of blowing out the viewport. Add this to a shared `.st-table-wrap` utility in `styles.css` for consistency.

### 4. Charts (Recharts)
Every `ResponsiveContainer` is already width-fluid, but fixed-height wrappers get responsive heights: `h-56 sm:h-64 lg:h-72`. Legends use `wrapperStyle={{ fontSize: 11 }}` and wrap on narrow widths.

### 5. Portfolio timeline / Gantt (`src/components/portfolio-timeline.tsx`, `app.timeline.tsx`, `app.dependencies.tsx`)
Gantt charts need a minimum pixel width to stay readable. Wrap the timeline body in a horizontal scroller: `overflow-x-auto` with an inner `min-w-[900px]`. The header financial strip stacks vertically on mobile.

### 6. Two-column layouts (Program detail, Project Infographic tabs, Roadmap Analytics)
Force `grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3` patterns; drop `flex` rows that assumed desktop widths.

### 7. Global CSS additions (`src/styles.css`)
- `.st-table-wrap { @apply -mx-3 overflow-x-auto sm:mx-0; }`
- `.st-input { @apply w-full sm:w-auto; }` (fix inline filters)
- Reduce default heading sizes at `sm:` breakpoint.
- Add `html { -webkit-text-size-adjust: 100%; }` and viewport-safe scrollbar behavior.

### 8. Sweep list (pages I'll verify page-by-page after primitives are done)
Executive, Projects, Programs, Program Infographic, Project Infographic, Segmentation, Timeline, Dependencies, Resources, Roadmap Analytics, Stage Gates, Decisions, Risks, Actions, Change Requests, Agile, FY Allocation, Monthly Cashflow, Phase Financials, Cost vs Benefit, Billing, Platform pages, Data Editor, Permissions, Settings.

## Out of scope
- No changes to business logic, data model, or chart calculations.
- No visual redesign — same colors, same layout hierarchy, just responsive.
- Print / PDF export layouts stay as-is (they already use fixed widths intentionally).

## Verification
After each batch, resize the preview across mobile / tablet / desktop and screenshot 4–5 representative pages (Executive, Projects register, Portfolio Timeline, Project Infographic, Settings) to confirm no clipping or overflow.

## Note on scope
This is a substantial sweep across ~30 pages. I'll do it in 3 batches:
1. Shell + primitives + global CSS (biggest visual win)
2. Timelines + Gantt + dashboards
3. Registers + remaining pages

Approve and I'll start with batch 1.
