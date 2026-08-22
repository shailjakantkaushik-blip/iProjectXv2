import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePhaseStageGateId } from "./apply-forecast-planned.ts";
import { PLATFORM_SEED_PROJECTS, PLATFORM_WATERFALL_GATES } from "./platform-seed.ts";
import {
  defaultGatesForMethodCode,
  findDeliveryMethod,
  methodUsesSprints,
  methodUsesStageGates,
} from "./delivery-methods.ts";
import {
  forecastCostType,
  formatForecastStreamPhase,
  isForecastableProjectStatus,
  resolveForecastStreamLabel,
} from "./project-forecast.ts";

describe("estimation planning / forecast", () => {
  it("blocks completed platform projects from a new estimate apply", () => {
    const live = PLATFORM_SEED_PROJECTS.filter((p) => isForecastableProjectStatus(p.status));
    const done = PLATFORM_SEED_PROJECTS.filter((p) => !isForecastableProjectStatus(p.status));
    assert.ok(live.some((p) => p.code === "PRJ-001"));
    assert.deepEqual(
      done.map((p) => p.code),
      ["PRJ-012"],
    );
  });

  it("treats missing cost type as OpEx and only tags explicit CapEx", () => {
    assert.equal(forecastCostType(null), "opex");
    assert.equal(forecastCostType("capex"), "capex");
    assert.equal(forecastCostType("Vendor / contractor"), "opex");
  });

  it("labels stream phases from the live stream row", () => {
    assert.equal(
      resolveForecastStreamLabel("s1", "stale", [{ id: "s1", name: "Portal UX" }]),
      "Portal UX",
    );
    assert.equal(formatForecastStreamPhase("Portal UX", "Build"), "Portal UX · Build");
  });

  it("matches an estimate phase to the live stage gate, preferring the stream copy", () => {
    const id = resolvePhaseStageGateId(
      { stream_id: "st", gate_name: "Build" },
      [
        { id: "proj", stream_id: null, gate_name: "Build" },
        { id: "stream", stream_id: "st", gate_name: "Build" },
      ],
    );
    assert.equal(id, "stream");
  });
});

describe("delivery methods on the platform seed", () => {
  it("keeps Waterfall gates aligned to the 16-project seed", () => {
    assert.deepEqual([...defaultGatesForMethodCode("waterfall")], [...PLATFORM_WATERFALL_GATES]);
    assert.ok(defaultGatesForMethodCode("agile").includes("Build / Iterate"));
  });

  it("Hybrid uses both gates and sprints; Agile is sprint-led", () => {
    const methods = [
      {
        id: "wf",
        org_id: "org",
        code: "waterfall",
        name: "Waterfall",
        uses_stage_gates: true,
        uses_sprints: false,
        is_system: true,
        is_active: true,
        sort_order: 1,
      },
      {
        id: "ag",
        org_id: "org",
        code: "agile",
        name: "Agile",
        uses_stage_gates: true,
        uses_sprints: true,
        is_system: true,
        is_active: true,
        sort_order: 2,
      },
      {
        id: "hy",
        org_id: "org",
        code: "hybrid",
        name: "Hybrid",
        uses_stage_gates: true,
        uses_sprints: true,
        is_system: true,
        is_active: true,
        sort_order: 3,
      },
    ];
    assert.equal(findDeliveryMethod(methods, "Hybrid")?.code, "hybrid");
    assert.equal(methodUsesStageGates(findDeliveryMethod(methods, "Hybrid")), true);
    assert.equal(methodUsesSprints(findDeliveryMethod(methods, "Hybrid")), true);
    assert.equal(methodUsesSprints(undefined, "Agile"), true);
    assert.equal(methodUsesSprints(undefined, "Waterfall"), false);
  });
});
