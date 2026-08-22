/** Pure org role-catalog rules — no React or Supabase. Safe for Node tests. */

export const ROLE_KEY_PATTERN = /^[a-z][a-z0-9_]{1,62}$/;

export const RESERVED_ROLE_KEYS = ["platform_admin"] as const;

export const SYSTEM_ROLE_KEYS = ["admin", "org_admin", "bu_lead", "pm", "executive"] as const;

export function canManageOrgRoles(roles: readonly string[]) {
  return roles.some((r) => r === "platform_admin" || r === "admin" || r === "org_admin");
}

export function normalizeRoleKey(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function isReservedRoleKey(key: string) {
  return (RESERVED_ROLE_KEYS as readonly string[]).includes(key);
}

export function isSystemRoleKey(key: string) {
  return (SYSTEM_ROLE_KEYS as readonly string[]).includes(key);
}

export function validateRoleKey(raw: string): { ok: true; key: string } | { ok: false; error: string } {
  const key = normalizeRoleKey(raw);
  if (!ROLE_KEY_PATTERN.test(key)) {
    return {
      ok: false,
      error: "Role key must start with a letter and use a-z, 0-9, underscore (2–63 chars)",
    };
  }
  if (isReservedRoleKey(key)) {
    return { ok: false, error: "Reserved role key" };
  }
  return { ok: true, key };
}

export function canDeleteOrgRole(role: { is_system: boolean; role_key: string }) {
  return !role.is_system && !isReservedRoleKey(role.role_key) && !isSystemRoleKey(role.role_key);
}

export function clampRoleSortOrder(value: unknown, fallback = 200) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(9999, Math.max(0, Math.round(n)));
}

export function normalizeRoleLabel(raw: string, fallbackKey: string) {
  const label = raw.trim();
  return label || fallbackKey;
}
