/**
 * Patch portfolio wipe+seed SQL so Agile projects do not get Waterfall stage gates.
 * Agile: sprints only (uses_stage_gates=false). Waterfall/Hybrid: gates as before.
 *
 * Usage: node scripts/fix-seed-agile-stage-gates.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

const FILES = [
  "supabase/manual/wipe_seed_iprojectx_4_projects_e2e.sql",
  "supabase/seed/wipe_seed_iprojectx_4_projects_e2e.sql",
  "supabase/manual/wipe_seed_iprojectx_10_projects_e2e.sql",
  "supabase/seed/wipe_seed_iprojectx_10_projects_e2e.sql",
  "supabase/manual/wipe_seed_isafex_3_projects_e2e.sql",
];

function patch(sql, file) {
  let out = sql;
  const orgKey = file.includes("isafex")
    ? "isafex.seed_org_id"
    : "iprojectx.seed_org_id";

  // Header: clarify gate behaviour by delivery method
  out = out.replace(
    /9 stage gates per stream,/g,
    "stage gates only for Waterfall/Hybrid (Agile = sprints only),",
  );
  out = out.replace(
    /9 stage gates\/stream,/g,
    "stage gates only for Waterfall/Hybrid (Agile = sprints only),",
  );

  // Ensure delivery_method_id column exists (idempotent)
  if (!out.includes("ADD COLUMN IF NOT EXISTS delivery_method_id")) {
    out = out.replace(
      /ALTER TABLE public\.projects\n\s+ADD COLUMN IF NOT EXISTS forecast_at_completion NUMERIC\(14,2\) DEFAULT 0;/,
      `ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS forecast_at_completion NUMERIC(14,2) DEFAULT 0;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS delivery_method_id uuid REFERENCES public.delivery_methods(id) ON DELETE SET NULL;`,
    );
  }

  // Replace legacy org-global gate defs with ensure_org_delivery_methods
  const defsRe =
    /-- ---------- C\) Ensure stage gate definitions \(canonical 9\) for .+? ----------\nINSERT INTO public\.stage_gate_definitions[\s\S]*?SET sort_order = EXCLUDED\.sort_order, is_active = true;/;

  const defsReplacement = `-- ---------- C) Ensure delivery methods + per-method gate templates ----------
-- Agile has uses_stage_gates=false (sprints only). Waterfall/Hybrid keep gate templates.
DO $ensure_methods$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ensure_org_delivery_methods'
  ) THEN
    PERFORM public.ensure_org_delivery_methods(current_setting('${orgKey}')::uuid);
  ELSE
    RAISE NOTICE 'ensure_org_delivery_methods missing — apply delivery_methods_stage_gates.sql first';
  END IF;
END
$ensure_methods$;`;

  if (!defsRe.test(out)) {
    throw new Error(`Could not find section C definitions block in ${file}`);
  }
  out = out.replace(defsRe, defsReplacement);

  // methods array: enum → text (column is text after delivery_methods migration)
  out = out.replace(
    /methods public\.delivery_method\[\] :=/g,
    "methods text[] :=",
  );

  // Agile phases: stop using Waterfall gate names as current_phase
  // 4-project / isafex: index 2 is Agile → was Testing
  out = out.replace(
    "phases text[] := ARRAY['Build','Testing','Design','Business Case / Full Funding'];",
    "phases text[] := ARRAY['Build','Build / Iterate','Design','Business Case / Full Funding'];",
  );
  // 10-project: Agile at indices 2,5,8 → Testing, Deployment, Discovery → sprint-oriented
  out = out.replace(
    "phases text[] := ARRAY['Build','Testing','Design','Business Case / Full Funding','Deployment','Handover','Build','Discovery','Testing','Build'];",
    "phases text[] := ARRAY['Build','Build / Iterate','Design','Business Case / Full Funding','Release Readiness','Handover','Build','Build / Iterate','Testing','Build'];",
  );

  // Declare method helpers after gate_names
  if (!out.includes("method_id uuid;")) {
    out = out.replace(
      /gate_names text\[\] := ARRAY\[\n\s+'Discovery','Business Case \/ Seed Funding','Design','Business Case \/ Full Funding',\n\s+'Build','Testing','Deployment','Handover','Benefit Realisation'\n\s+\];\n\s+g_status text;\n\s+g_idx int;/,
      `gate_names text[] := ARRAY[
    'Discovery','Business Case / Seed Funding','Design','Business Case / Full Funding',
    'Build','Testing','Deployment','Handover','Benefit Realisation'
  ];
  project_gates text[];
  method_id uuid;
  uses_gates boolean;
  g_status text;
  g_idx int;`,
    );
  }

  // Resolve method + gate set before project insert — inject after brief_json built,
  // right before INSERT INTO public.projects
  if (!out.includes("-- Resolve delivery method flags")) {
    out = out.replace(
      /(\s+)(INSERT INTO public\.projects \(\n\s+org_id, bu_id, project_code, name, portfolio, program, sponsor, priority, status, rag,\n\s+current_phase, delivery_method, streams_enabled,)/,
      `$1-- Resolve delivery method flags (Agile must not receive Waterfall stage gates)
$1SELECT dm.id, dm.uses_stage_gates
$1  INTO method_id, uses_gates
$1FROM public.delivery_methods dm
$1WHERE dm.org_id = r_org.id
$1  AND lower(dm.name) = lower(methods[i])
$1LIMIT 1;
$1IF method_id IS NULL THEN
$1  -- Fallback if delivery_methods table not migrated yet
$1  uses_gates := methods[i] IS DISTINCT FROM 'Agile';
$1END IF;
$1IF uses_gates THEN
$1  project_gates := gate_names;
$1  g_idx := array_position(project_gates, phases[i]);
$1  IF g_idx IS NULL THEN g_idx := 1; END IF;
$1ELSE
$1  project_gates := ARRAY[]::text[];
$1  g_idx := 0;
$1END IF;

$1$2`,
    );
  }

  // Add delivery_method_id to INSERT column list + values
  out = out.replace(
    /current_phase, delivery_method, streams_enabled,/g,
    "current_phase, delivery_method, delivery_method_id, streams_enabled,",
  );
  out = out.replace(
    /statuses\[i\], rags\[i\], phases\[i\], methods\[i\], true,/g,
    "statuses[i], rags[i], phases[i], methods[i], method_id, true,",
  );

  // Remove old g_idx assignment that always used waterfall gate_names
  out = out.replace(
    /\n\s+g_idx := array_position\(gate_names, phases\[i\]\);\n\s+IF g_idx IS NULL THEN g_idx := 1; END IF;\n/,
    "\n",
  );

  // Wrap gate insert loop to only run when uses_gates
  const gateLoopOld = `        FOR j IN 1..array_length(gate_names, 1) LOOP
          IF j < g_idx THEN g_status := 'Approved';
          ELSIF j = g_idx THEN g_status := 'In Review';
          ELSE g_status := 'Pending';
          END IF;
          -- Spread 9 gates evenly across the stream schedule window
          INSERT INTO public.stage_gates (
            org_id, project_id, stream_id, gate_name, planned_date, actual_date, status, approver, notes
          ) VALUES (
            r_org.id, p_id, sid, gate_names[j],
            (s_start + ((s_end - s_start) * (j - 1) / GREATEST(array_length(gate_names, 1) - 1, 1)))::date
              + CASE WHEN sid = alt_id THEN 7 ELSE 0 END,
            CASE WHEN g_status = 'Approved'
              THEN (s_start + ((s_end - s_start) * (j - 1) / GREATEST(array_length(gate_names, 1) - 1, 1)))::date
                + CASE WHEN sid = alt_id THEN 10 ELSE 3 END
              ELSE NULL END,
            g_status,
            CASE WHEN sid = core_id THEN primary_person_name ELSE secondary_person_name END,
            CASE WHEN sid = core_id THEN 'Core stream gate' ELSE alt_names[i] || ' stream gate' END
          );
        END LOOP;

        -- Auto-synced milestones from gates inherit stream_id (trigger may omit it)
        UPDATE public.milestones m
        SET stream_id = g.stream_id
        FROM public.stage_gates g
        WHERE m.stage_gate_id = g.id
          AND g.project_id = p_id
          AND g.stream_id = sid
          AND (m.stream_id IS DISTINCT FROM g.stream_id);`;

  const gateLoopNew = `        -- Stage gates only when the delivery method uses them (not Agile)
        IF uses_gates AND coalesce(array_length(project_gates, 1), 0) > 0 THEN
          FOR j IN 1..array_length(project_gates, 1) LOOP
            IF j < g_idx THEN g_status := 'Approved';
            ELSIF j = g_idx THEN g_status := 'In Review';
            ELSE g_status := 'Pending';
            END IF;
            -- Spread gates evenly across the stream schedule window
            INSERT INTO public.stage_gates (
              org_id, project_id, stream_id, gate_name, planned_date, actual_date, status, approver, notes
            ) VALUES (
              r_org.id, p_id, sid, project_gates[j],
              (s_start + ((s_end - s_start) * (j - 1) / GREATEST(array_length(project_gates, 1) - 1, 1)))::date
                + CASE WHEN sid = alt_id THEN 7 ELSE 0 END,
              CASE WHEN g_status = 'Approved'
                THEN (s_start + ((s_end - s_start) * (j - 1) / GREATEST(array_length(project_gates, 1) - 1, 1)))::date
                  + CASE WHEN sid = alt_id THEN 10 ELSE 3 END
                ELSE NULL END,
              g_status,
              CASE WHEN sid = core_id THEN primary_person_name ELSE secondary_person_name END,
              CASE WHEN sid = core_id THEN 'Core stream gate' ELSE alt_names[i] || ' stream gate' END
            );
          END LOOP;

          -- Auto-synced milestones from gates inherit stream_id (trigger may omit it)
          UPDATE public.milestones m
          SET stream_id = g.stream_id
          FROM public.stage_gates g
          WHERE m.stage_gate_id = g.id
            AND g.project_id = p_id
            AND g.stream_id = sid
            AND (m.stream_id IS DISTINCT FROM g.stream_id);
        END IF;`;

  if (!out.includes(gateLoopOld)) {
    throw new Error(`Gate loop block not found in ${file}`);
  }
  out = out.replace(gateLoopOld, gateLoopNew);

  // Allocation gate lookup: use project_gates when gated
  out = out.replace(
    `            -- Plan against the stream's current-phase gate (fallback: first gate)
            SELECT g.id INTO prev_p
            FROM public.stage_gates g
            WHERE g.stream_id = sid
              AND g.gate_name = gate_names[GREATEST(g_idx, 1)]
            LIMIT 1;`,
    `            -- Plan against the stream's current-phase gate (Agile: null stage_gate_id)
            prev_p := NULL;
            IF uses_gates AND g_idx >= 1 THEN
              SELECT g.id INTO prev_p
              FROM public.stage_gates g
              WHERE g.stream_id = sid
                AND g.gate_name = project_gates[g_idx]
              LIMIT 1;
            END IF;`,
  );

  // Status update copy: method-aware
  out = out.replace(
    `'Gates advanced; monthly actuals posted; allocations confirmed.',
         'Close open issues; prepare next stage gate pack.',`,
    `CASE WHEN uses_gates THEN 'Gates advanced; monthly actuals posted; allocations confirmed.' ELSE 'Sprint cadence on track; monthly actuals posted; allocations confirmed.' END,
         CASE WHEN uses_gates THEN 'Close open issues; prepare next stage gate pack.' ELSE 'Close open issues; plan next sprint goals.' END,`,
  );

  // Decision titles: avoid hard-coded Hybrid wording
  out = out.replace(
    `'Hybrid delivery method',
        'Confirm ' || methods[i]::text || ' approach',
        starts[i] + 30, primary_person_name,
        'Aligns cadence with dependencies',
        'Sprint + stage-gate hybrid where needed',
        'Approved';`,
    `'Confirm ' || methods[i] || ' delivery method',
        'Confirm ' || methods[i] || ' approach for ' || names[i],
        starts[i] + 30, primary_person_name,
        'Aligns cadence with dependencies',
        CASE WHEN methods[i] = 'Agile' THEN 'Sprint cadence without stage gates'
             WHEN methods[i] = 'Hybrid' THEN 'Sprint + stage-gate hybrid where needed'
             ELSE 'Sequential stage-gate delivery' END,
        'Approved';`,
  );

  // Milestone status heuristics that reference g_idx — safe when g_idx=0 (all Planned)
  // Work-item stage_gate UPDATE already no-ops when no gates exist.

  if (out === sql) {
    throw new Error(`No changes applied to ${file}`);
  }
  return out;
}

for (const rel of FILES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.warn("skip missing", rel);
    continue;
  }
  const before = fs.readFileSync(abs, "utf8");
  const after = patch(before, rel);
  fs.writeFileSync(abs, after);
  console.log("patched", rel, `(${before.length} → ${after.length} bytes)`);
}
