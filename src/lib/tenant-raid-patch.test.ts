import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { pickRaidPatch } from "./tenant-raid-patch.ts";

const ORG = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

describe("RAID patch allowlist", () => {
  it("keeps known columns and always stamps the server org_id", () => {
    const out = pickRaidPatch(
      "risks",
      { title: "Slip", org_id: OTHER, id: "not-allowed", extra: "drop", severity: 5 },
      ORG,
    );
    assert.equal(out.org_id, ORG);
    assert.equal(out.title, "Slip");
    assert.equal(out.severity, 5);
    assert.equal("id" in out, false);
    assert.equal("extra" in out, false);
  });

  it("does not copy issue columns onto an action row", () => {
    const out = pickRaidPatch(
      "actions",
      { title: "Chase vendor", resolution: "should-drop", priority: "High" },
      ORG,
    );
    assert.equal(out.title, "Chase vendor");
    assert.equal(out.priority, "High");
    assert.equal("resolution" in out, false);
  });
});

describe("platform RAID CRUD uses the caller JWT", () => {
  it("routes platform writes through tenantRaidClient(context.supabase)", () => {
    const src = readFileSync(fileURLToPath(new URL("./tenant-raid.functions.ts", import.meta.url)), "utf8");
    assert.match(src, /tenantRaidClient\(context\.supabase/);
    assert.match(src, /if \(resolved\.mode === "byod"\)/);
    assert.match(src, /return \{ client: userClient, mode: "platform" \}/);
    assert.equal((src.match(/resolveOrgDataClient\(/g) ?? []).length, 1);
  });
});
