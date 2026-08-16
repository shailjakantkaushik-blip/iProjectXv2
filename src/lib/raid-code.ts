/** Human RAID reference codes — not database UUIDs. */

export const RAID_CODE_PREFIX = {
  risks: "RSK",
  issues: "ISS",
  actions: "ACT",
  decisions: "DEC",
} as const;

export type RaidTable = keyof typeof RAID_CODE_PREFIX;

export function raidCodeOf(row: { raid_code?: string | null } | null | undefined) {
  const code = String(row?.raid_code || "").trim();
  return code || null;
}

/** `RSK-001 · Title` for logs, packs, and explain text. */
export function raidLabel(
  row: { raid_code?: string | null; title?: string | null } | null | undefined,
  fallback = "Untitled",
) {
  const code = raidCodeOf(row);
  const title = String(row?.title || "").trim() || fallback;
  return code ? `${code} · ${title}` : title;
}
