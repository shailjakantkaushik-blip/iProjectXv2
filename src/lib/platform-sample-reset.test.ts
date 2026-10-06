import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PLATFORM_SAMPLE_CONFIRM,
  PLATFORM_SAMPLE_PACKS,
  SAMPLE_KEEP_SURFACES,
  SAMPLE_WIPE_TABLES,
  assertSampleResetConfirm,
  fyLabelForDate,
  parseSamplePack,
  previewPlatformSample,
  projectsForPack,
  resetPlatformSample,
  sampleMonths,
  type SampleResetDb,
} from "./platform-sample-reset.ts";

function memoryDb(org = { id: "plat", name: "iProjectX", slug: "iprojectx" }): SampleResetDb & {
  deleted: string[];
  inserted: Array<{ table: string; orgIds: string[] }>;
  counts: Record<string, number>;
} {
  const deleted: string[] = [];
  const inserted: Array<{ table: string; orgIds: string[] }> = [];
  const counts: Record<string, number> = { projects: 12, risks: 4 };
  let seq = 1;
  return {
    deleted,
    inserted,
    counts,
    resolvePlatformOrg: async () => org,
    countEqOrgId: async (table, orgId) => {
      assert.equal(orgId, org.id);
      return counts[table] ?? 0;
    },
    deleteEqOrgId: async (table, orgId) => {
      assert.equal(orgId, org.id);
      deleted.push(table);
    },
    deleteScenarioProjectsForOrg: async (orgId) => {
      assert.equal(orgId, org.id);
      deleted.push("scenario_projects");
    },
    clearGovernanceParents: async (orgId) => {
      assert.equal(orgId, org.id);
    },
    ensureDeliveryMethods: async (orgId) => {
      assert.equal(orgId, org.id);
    },
    findDeliveryMethods: async (orgId) => {
      assert.equal(orgId, org.id);
      return [
        { id: "m-wf", name: "Waterfall" },
        { id: "m-ag", name: "Agile" },
        { id: "m-hy", name: "Hybrid" },
      ];
    },
    findPlatformUser: async (orgId) => {
      assert.equal(orgId, org.id);
      return { id: "user-1" };
    },
    selectEqOrgId: async (table, _columns, orgId) => {
      assert.equal(orgId, org.id);
      return [];
    },
    updateByIdOrg: async (table, id, orgId) => {
      assert.equal(orgId, org.id);
      assert.ok(id);
      void table;
    },
    insert: async (table, rows) => {
      inserted.push({ table, orgIds: rows.map((r) => String(r.org_id)) });
      return rows.map(() => ({ id: `id-${seq++}` }));
    },
  };
}

describe("platform sample reset rules", () => {
  it("only allows the 4 / 10 / 16 packs", () => {
    assert.deepEqual([...PLATFORM_SAMPLE_PACKS], [4, 10, 16]);
    assert.equal(parseSamplePack(4), 4);
    assert.equal(parseSamplePack(16), 16);
    assert.throws(() => parseSamplePack(7), /4, 10, or 16/);
    assert.throws(() => parseSamplePack("all"), /4, 10, or 16/);
    assert.equal(projectsForPack(4).length, 4);
    assert.equal(projectsForPack(10)[9]?.code, "PRJ-010");
    assert.equal(projectsForPack(16).some((p) => p.status === "Completed"), true);
    assert.equal(projectsForPack(16).some((p) => p.status === "Not Started"), true);
  });

  it("requires the iprojectx confirm phrase", () => {
    assert.equal(PLATFORM_SAMPLE_CONFIRM, "iprojectx");
    assert.doesNotThrow(() => assertSampleResetConfirm("iprojectx"));
    assert.doesNotThrow(() => assertSampleResetConfirm(" iProjectX "));
    assert.throws(() => assertSampleResetConfirm("isafex"), /iprojectx/);
    assert.throws(() => assertSampleResetConfirm(""), /iprojectx/);
  });

  it("never lists control-plane tables in the wipe set", () => {
    const wipe = SAMPLE_WIPE_TABLES as readonly string[];
    assert.ok(wipe.includes("projects"));
    assert.ok(wipe.includes("timesheets"));
    assert.ok(!wipe.includes("organizations"));
    assert.ok(!wipe.includes("profiles"));
    assert.ok(!wipe.includes("user_roles"));
    assert.ok(!wipe.includes("landing_config"));
    assert.ok(!wipe.includes("invoices"));
    assert.ok(SAMPLE_KEEP_SURFACES.some((s) => /landing/i.test(s)));
  });

  it("labels July FYs and samples a few months only", () => {
    assert.equal(fyLabelForDate("2025-07-01"), "FY26");
    assert.equal(fyLabelForDate("2026-01-15"), "FY26");
    assert.equal(fyLabelForDate("2026-07-01"), "FY27");
    assert.ok(sampleMonths("2025-04-01", "2026-09-30").length <= 4);
    assert.ok(sampleMonths("2025-04-01", "2026-09-30").every((m) => /-\d{2}-01$/.test(m)));
  });

  it("preview reads only the resolved platform org", async () => {
    const db = memoryDb();
    const preview = await previewPlatformSample(db);
    assert.equal(preview.org.slug, "iprojectx");
    assert.equal(preview.counts.projects, 12);
  });

  it("refuses preview when the resolved row is not iProjectX", async () => {
    const db = memoryDb({ id: "cust", name: "Acme", slug: "acme" });
    await assert.rejects(() => previewPlatformSample(db), /iprojectx/);
  });

  it("reset wipes and seeds only the platform org id", async () => {
    const db = memoryDb();
    const report = await resetPlatformSample(db, { pack: 4, confirm: "iprojectx" });
    assert.equal(report.pack, 4);
    assert.equal(report.org.id, "plat");
    assert.ok(report.wiped.includes("projects"));
    assert.ok(report.created.projects >= 4);
    assert.ok(report.created.risks >= 4);
    assert.ok(report.created.demand_pipeline >= 4);
    assert.ok(db.deleted.every((t) => typeof t === "string"));
    assert.ok(db.inserted.length > 0);
    assert.ok(db.inserted.every((batch) => batch.orgIds.every((id) => id === "plat")));
  });

  it("reset refuses a wrong confirm before any wipe", async () => {
    const db = memoryDb();
    await assert.rejects(() => resetPlatformSample(db, { pack: 4, confirm: "isafex" }), /iprojectx/);
    assert.equal(db.deleted.length, 0);
    assert.equal(db.inserted.length, 0);
  });

  it("16-pack seeds completed and not-started projects", async () => {
    const db = memoryDb();
    const report = await resetPlatformSample(db, { pack: 16, confirm: "IPROJECTX" });
    assert.equal(report.created.projects, 16);
    const projectInsert = db.inserted.find((b) => b.table === "projects");
    assert.ok(projectInsert);
  });
});
