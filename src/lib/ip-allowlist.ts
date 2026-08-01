/**
 * Parse / validate / match IPv4 + IPv6 addresses and CIDR ranges for org allowlists.
 * No external deps — used by branding UI validation and server-side enforcement.
 */

const MAX_ALLOWLIST_ENTRIES = 50;

const IPV4_OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IPV4_RE = new RegExp(`^(?:${IPV4_OCTET}\\.){3}${IPV4_OCTET}$`);

export type ParsedAllowlist = { ok: true; entries: string[] } | { ok: false; error: string };

export function normalizeAllowlistInput(raw: string | string[] | null | undefined): string[] {
  const parts = Array.isArray(raw)
    ? raw
    : String(raw ?? "")
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const n = p.trim();
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

export function isValidIpOrCidr(entry: string): boolean {
  const trimmed = entry.trim();
  if (!trimmed) return false;
  const slash = trimmed.indexOf("/");
  if (slash === -1) {
    return isValidIp(trimmed);
  }
  const addr = trimmed.slice(0, slash);
  const prefixStr = trimmed.slice(slash + 1);
  if (!/^\d{1,3}$/.test(prefixStr)) return false;
  const prefix = Number(prefixStr);
  if (!isValidIp(addr)) return false;
  if (isIPv4(addr)) return prefix >= 0 && prefix <= 32;
  return prefix >= 0 && prefix <= 128;
}

export function parseIpAllowlist(raw: string | string[] | null | undefined): ParsedAllowlist {
  const entries = normalizeAllowlistInput(raw);
  if (entries.length > MAX_ALLOWLIST_ENTRIES) {
    return {
      ok: false,
      error: `At most ${MAX_ALLOWLIST_ENTRIES} IP / CIDR entries are allowed.`,
    };
  }
  for (const e of entries) {
    if (!isValidIpOrCidr(e)) {
      return {
        ok: false,
        error: `Invalid IP or CIDR: "${e}". Use e.g. 203.0.113.10 or 10.0.0.0/8.`,
      };
    }
  }
  return { ok: true, entries };
}

export function isValidIp(ip: string): boolean {
  return isIPv4(ip) || isIPv6(ip);
}

export function isIPv4(ip: string): boolean {
  return IPV4_RE.test(ip.trim());
}

/** Loose but practical IPv6 validation (handles :: compression). */
export function isIPv6(ip: string): boolean {
  const s = ip.trim().toLowerCase();
  if (!s || s.includes(".")) return false;
  if (s === "::") return true;
  if ((s.match(/::/g) || []).length > 1) return false;
  const hasCompression = s.includes("::");
  const sides = s.split("::");
  const left = sides[0] ? sides[0].split(":") : [];
  const right = sides[1] ? sides[1].split(":") : [];
  const groups = hasCompression ? [...left, ...right] : s.split(":");
  if (!hasCompression && groups.length !== 8) return false;
  if (hasCompression && left.length + right.length > 7) return false;
  return groups.every((g) => g === "" || /^[0-9a-f]{1,4}$/.test(g));
}

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map((p) => Number(p));
  return (
    (((parts[0]! << 24) >>> 0) +
      ((parts[1]! << 16) >>> 0) +
      ((parts[2]! << 8) >>> 0) +
      (parts[3]! >>> 0)) >>>
    0
  );
}

function expandIPv6(ip: string): number[] {
  const s = ip.trim().toLowerCase();
  if (s === "::") return Array(8).fill(0);
  const [leftRaw, rightRaw] = s.split("::");
  const left = leftRaw ? leftRaw.split(":").filter(Boolean) : [];
  const right =
    rightRaw !== undefined ? (rightRaw ? rightRaw.split(":").filter(Boolean) : []) : null;
  const missing = 8 - left.length - (right ? right.length : 0);
  const groups = [
    ...left.map((g) => parseInt(g || "0", 16)),
    ...(right ? Array(Math.max(0, missing)).fill(0) : []),
    ...(right ? right.map((g) => parseInt(g || "0", 16)) : []),
  ];
  while (groups.length < 8) groups.push(0);
  return groups.slice(0, 8);
}

function ipv6InCidr(ip: string, network: string, prefix: number): boolean {
  const ipGroups = expandIPv6(ip);
  const netGroups = expandIPv6(network);
  let bits = prefix;
  for (let i = 0; i < 8; i++) {
    const take = Math.min(16, bits);
    if (take <= 0) return true;
    const mask = take === 16 ? 0xffff : (0xffff << (16 - take)) & 0xffff;
    if ((ipGroups[i]! & mask) !== (netGroups[i]! & mask)) return false;
    bits -= take;
  }
  return true;
}

/** True when `clientIp` matches any exact IP or CIDR in `allowlist`. */
export function ipMatchesAllowlist(clientIp: string, allowlist: string[]): boolean {
  const ip = clientIp.trim();
  if (!ip || !isValidIp(ip)) return false;
  for (const entry of allowlist) {
    const e = entry.trim();
    if (!e) continue;
    const slash = e.indexOf("/");
    if (slash === -1) {
      if (isIPv4(ip) && isIPv4(e) && ipv4ToInt(ip) === ipv4ToInt(e)) return true;
      if (isIPv6(ip) && isIPv6(e) && expandIPv6(ip).join(":") === expandIPv6(e).join(":")) {
        return true;
      }
      continue;
    }
    const network = e.slice(0, slash);
    const prefix = Number(e.slice(slash + 1));
    if (!Number.isFinite(prefix)) continue;
    if (isIPv4(ip) && isIPv4(network) && prefix >= 0 && prefix <= 32) {
      if (prefix === 0) return true;
      const mask = prefix === 32 ? 0xffffffff : (0xffffffff << (32 - prefix)) >>> 0;
      if ((ipv4ToInt(ip) & mask) === (ipv4ToInt(network) & mask)) return true;
      continue;
    }
    if (isIPv6(ip) && isIPv6(network) && prefix >= 0 && prefix <= 128) {
      if (ipv6InCidr(ip, network, prefix)) return true;
    }
  }
  return false;
}

export { MAX_ALLOWLIST_ENTRIES };
