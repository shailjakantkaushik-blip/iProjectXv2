import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { PAGES } from "./permissions-acl.ts";

describe("route inventory", () => {
  it("every Permissions page is registered in the router", () => {
    const tree = readFileSync(new URL("../routeTree.gen.ts", import.meta.url), "utf8");
    const missing = PAGES.map((p) => p.path).filter((path) => !tree.includes(`fullPath: '${path}'`));
    assert.deepEqual(missing, [], `router missing: ${missing.join(", ")}`);
  });

  it("keeps public commercial surfaces in the router", () => {
    const tree = readFileSync(new URL("../routeTree.gen.ts", import.meta.url), "utf8");
    for (const path of ["/", "/auth", "/contact", "/api/public/landing-logo"]) {
      assert.ok(tree.includes(`fullPath: '${path}'`), `missing ${path}`);
    }
  });
});
