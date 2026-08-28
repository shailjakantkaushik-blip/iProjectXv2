import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../components/turnstile.tsx"),
  "utf8",
);

describe("early August Turnstile widget", () => {
  it("does not force a size (Cloudflare default checkbox) and always shows the check", () => {
    assert.match(src, /appearance:\s*"always"/);
    assert.doesNotMatch(src, /size:\s*"/);
    assert.doesNotMatch(src, /TURNSTILE_SLOT_INNER_HTML|dangerouslySetInnerHTML|singletonHost/);
  });
});
