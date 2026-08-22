import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertSafeLogoFile } from "./safe-logo-upload.ts";

function file(name: string, type: string, size = 1000) {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

describe("safe logo upload", () => {
  it("allows raster brand files under the cap", () => {
    assert.doesNotThrow(() => assertSafeLogoFile(file("mark.png", "image/png", 12_000)));
    assert.doesNotThrow(() => assertSafeLogoFile(file("mark.webp", "image/webp", 12_000)));
  });

  it("blocks SVG and oversized files", () => {
    assert.throws(() => assertSafeLogoFile(file("mark.svg", "image/svg+xml")), /SVG/);
    assert.throws(() => assertSafeLogoFile(file("mark.png", "image/png", 500_000)), /too large/);
    assert.throws(() => assertSafeLogoFile(file("mark.bmp", "image/bmp", 1000)), /Unsupported/);
  });
});
