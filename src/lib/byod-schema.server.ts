/**
 * Serve the BYOD tenant schema pack for platform-admin download.
 * Prefers the build-time artifact under public/byod; falls back to
 * concatenating supabase/migrations at runtime when that file is present.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

/** Migrations that belong only on the iProjectX control plane — not customer BYOD DBs. */
export const BYOD_SCHEMA_EXCLUDE = [
  "20260721003000_invoice_template_config.sql",
  "20260721004500_fix_landing_invoice_grants.sql",
  "20260724180000_eoi_and_licenses_policies.sql",
  "20260724193000_grant_eoi_licenses_policies.sql",
  "20260724194500_publish_legal_policies.sql",
  "20260724200000_iprojectx_legal_policy_bodies.sql",
  "20260724210000_support_tickets.sql",
  "20260725190000_org_inhouse_ai_model_enabled.sql",
  "20260725193000_org_sso_config.sql",
  "20260729120000_org_byod_connections.sql",
  "20260731120000_org_integrations.sql",
  "20260801140000_org_ip_restriction.sql",
] as const;

export type ByodSchemaPack = {
  filename: string;
  sql: string;
  included: string[];
  excluded: string[];
  generatedAt: string;
};

async function tryReadBuiltArtifact(root: string): Promise<ByodSchemaPack | null> {
  const sqlPath = path.join(root, "public", "byod", "iprojectx-byod-schema.sql");
  const metaPath = path.join(root, "public", "byod", "iprojectx-byod-schema.json");
  try {
    const sql = await readFile(sqlPath, "utf8");
    let included: string[] = [];
    let excluded: string[] = [...BYOD_SCHEMA_EXCLUDE];
    let generatedAt = new Date().toISOString();
    try {
      const meta = JSON.parse(await readFile(metaPath, "utf8")) as {
        generatedAt?: string;
        included?: string[];
        excluded?: string[];
      };
      if (meta.generatedAt) generatedAt = meta.generatedAt;
      if (Array.isArray(meta.included)) included = meta.included;
      if (Array.isArray(meta.excluded)) excluded = meta.excluded;
    } catch {
      /* meta optional */
    }
    return {
      filename: "iprojectx-byod-schema.sql",
      sql,
      included,
      excluded,
      generatedAt,
    };
  } catch {
    return null;
  }
}

async function buildFromMigrations(root: string): Promise<ByodSchemaPack> {
  const migrationsDir = path.join(root, "supabase", "migrations");
  const exclude = new Set<string>(BYOD_SCHEMA_EXCLUDE);
  const names = (await readdir(migrationsDir))
    .filter((n) => n.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  const included: string[] = [];
  const excluded: string[] = [];
  const chunks: string[] = [];
  const generatedAt = new Date().toISOString();

  chunks.push(`-- iProjectX BYOD tenant schema pack
-- Generated: ${generatedAt}
-- Apply this file to the customer Postgres database (psql / migration runner)
-- BEFORE activating BYOD for the organisation.
--
-- Excludes control-plane-only migrations (billing, landing, EOI, legal,
-- support tickets, BYOD secrets table, SSO/IP/AI org flags, integrations).
-- Auth, billing, white-label, and BYOD connection secrets stay on iProjectX.
`);

  for (const name of names) {
    if (exclude.has(name)) {
      excluded.push(name);
      continue;
    }
    included.push(name);
    const sql = await readFile(path.join(migrationsDir, name), "utf8");
    chunks.push(`
-- =============================================================================
-- ${name}
-- =============================================================================
`);
    chunks.push(sql.trimEnd());
    chunks.push("\n");
  }

  chunks.push(`
-- =============================================================================
-- End of iProjectX BYOD schema pack (${included.length} migrations)
-- Skipped control-plane: ${excluded.join(", ") || "(none)"}
-- =============================================================================
`);

  return {
    filename: `iprojectx-byod-schema-${generatedAt.slice(0, 10)}.sql`,
    sql: chunks.join("\n"),
    included,
    excluded,
    generatedAt,
  };
}

export async function buildByodSchemaPack(): Promise<ByodSchemaPack> {
  const root = process.cwd();
  const built = await tryReadBuiltArtifact(root);
  if (built) return built;
  return buildFromMigrations(root);
}
