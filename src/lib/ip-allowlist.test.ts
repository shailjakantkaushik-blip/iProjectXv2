import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ipMatchesAllowlist, parseIpAllowlist } from "./ip-allowlist.ts";

describe("org IP allowlist", () => {
  it("accepts IPv4, CIDR, and IPv6", () => {
    const parsed = parseIpAllowlist("203.0.113.10\n10.0.0.0/8\n2001:db8::1");
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.entries.length, 3);
  });

  it("rejects junk and over-long lists", () => {
    assert.equal(parseIpAllowlist("not-an-ip").ok, false);
    assert.equal(parseIpAllowlist(Array.from({ length: 51 }, (_, i) => `10.0.0.${i}`)).ok, false);
  });

  it("matches exact and CIDR clients", () => {
    assert.equal(ipMatchesAllowlist("203.0.113.10", ["203.0.113.10"]), true);
    assert.equal(ipMatchesAllowlist("10.2.3.4", ["10.0.0.0/8"]), true);
    assert.equal(ipMatchesAllowlist("11.0.0.1", ["10.0.0.0/8"]), false);
    assert.equal(ipMatchesAllowlist("bad", ["10.0.0.0/8"]), false);
  });
});
