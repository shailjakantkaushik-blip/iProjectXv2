import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isChunkLoadError } from "./chunk-load-recovery.ts";

describe("isChunkLoadError", () => {
  it("treats Safari ESM binding failures as a recoverable stale-chunk error", () => {
    assert.equal(
      isChunkLoadError(new Error("importing binding name 't' not found")),
      true,
    );
    assert.equal(
      isChunkLoadError(new Error("Importing binding name \"t\" is not found.")),
      true,
    );
    assert.equal(
      isChunkLoadError(
        new Error("The requested module '/assets/tanstack-abc.js' does not provide an export named 't'"),
      ),
      true,
    );
  });

  it("does not treat ordinary sign-in errors as chunk failures", () => {
    assert.equal(isChunkLoadError(new Error("Invalid login credentials")), false);
    assert.equal(isChunkLoadError(new Error("Unauthorized: No token provided")), false);
  });
});
