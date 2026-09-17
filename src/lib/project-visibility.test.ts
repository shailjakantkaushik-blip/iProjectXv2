import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  callerHasLimitedVisibility,
  filterProjectsByVisibility,
  mergeProjectVisibility,
  visibilityConfigFromOrg,
} from "./project-visibility.ts";

const projects = [
  { id: "p1", portfolio: "Digital", program: "Core", functional_area: "IT", pm_user_id: "u-pm" },
  { id: "p2", portfolio: "Digital", program: "Growth", functional_area: "Sales", pm_user_id: null },
  { id: "p3", portfolio: "Ops", program: "Run", functional_area: "Ops", pm_user_id: "u-other" },
];

describe("project visibility scope", () => {
  it("keeps every project when no rules are configured", () => {
    const cfg = mergeProjectVisibility({});
    assert.equal(callerHasLimitedVisibility(cfg, "u1", ["executive"]), false);
    assert.equal(filterProjectsByVisibility(projects, "u1", ["executive"], cfg).length, 3);
  });

  it("restricts executives to granted programs and strategic alignments", () => {
    const cfg = mergeProjectVisibility({
      rules: [
        {
          role: "executive",
          mode: "scoped",
          programs: ["Core"],
          strategic_alignments: [],
        },
      ],
    });
    assert.equal(callerHasLimitedVisibility(cfg, "u1", ["executive"]), true);
    const visible = filterProjectsByVisibility(projects, "u1", ["executive"], cfg);
    assert.deepEqual(
      visible.map((p) => p.id),
      ["p1"],
    );
  });

  it("lets a user override hide the rest of the org, including admins", () => {
    const cfg = mergeProjectVisibility({
      user_rules: [{ user_id: "admin-1", mode: "scoped", project_ids: ["p2"] }],
    });
    const visible = filterProjectsByVisibility(projects, "admin-1", ["org_admin"], cfg);
    assert.deepEqual(
      visible.map((p) => p.id),
      ["p2"],
    );
  });

  it("keeps the PM's assigned project when their role is otherwise scoped", () => {
    const cfg = mergeProjectVisibility({
      rules: [{ role: "pm", mode: "scoped", programs: ["Growth"] }],
    });
    const visible = filterProjectsByVisibility(projects, "u-pm", ["pm"], cfg);
    assert.deepEqual(visible.map((p) => p.id).sort(), ["p1", "p2"]);
  });

  it("reads grants from organizations.ui_config", () => {
    const cfg = visibilityConfigFromOrg({
      ui_config: {
        project_visibility: {
          rules: [{ role: "bu_lead", mode: "scoped", strategic_alignments: ["Ops"] }],
        },
      },
    });
    const visible = filterProjectsByVisibility(projects, "u2", ["bu_lead"], cfg);
    assert.deepEqual(
      visible.map((p) => p.id),
      ["p3"],
    );
  });
});
