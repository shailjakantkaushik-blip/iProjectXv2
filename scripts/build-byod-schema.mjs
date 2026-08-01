/**
 * Concatenate tenant-relevant supabase migrations into
 * public/byod/iprojectx-byod-schema.sql for BYOD customer prep.
 */
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "supabase", "migrations");
const outDir = path.join(root, "public", "byod");
const outFile = path.join(outDir, "iprojectx-byod-schema.sql");
const metaFile = path.join(outDir, "iprojectx-byod-schema.json");

/** Control-plane-only — do not ship to customer BYOD databases. */
const EXCLUDE = new Set([
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
]);

const generatedAt = new Date().toISOString();
const names = (await readdir(migrationsDir))
  .filter((n) => n.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

const included = [];
const excluded = [];
const chunks = [];

chunks.push(`-- iProjectX BYOD tenant schema pack
-- Generated: ${generatedAt}
-- Apply this file to the customer Postgres database (psql / migration runner)
-- BEFORE activating BYOD for the organisation.
--
-- Excludes control-plane-only migrations (billing, landing, EOI, legal,
-- support tickets, BYOD secrets table, SSO/IP/AI org flags, integrations).
-- Auth, billing, white-label, and BYOD connection secrets stay on iProjectX.
--
-- Connection test only verifies URL + admin credentials; portfolio features
-- need this schema applied first.
`);

for (const name of names) {
  if (EXCLUDE.has(name)) {
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

await mkdir(outDir, { recursive: true });
const sql = chunks.join("\n");
await writeFile(outFile, sql, "utf8");
await writeFile(
  metaFile,
  JSON.stringify(
    {
      generatedAt,
      filename: "iprojectx-byod-schema.sql",
      includedCount: included.length,
      excludedCount: excluded.length,
      included,
      excluded,
      bytes: Buffer.byteLength(sql, "utf8"),
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

console.log(
  `[byod-schema] wrote ${outFile} (${included.length} migrations, ${excluded.length} skipped, ${Buffer.byteLength(sql, "utf8")} bytes)`,
);
