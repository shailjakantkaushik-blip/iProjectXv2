/** The iProjectX organisation is platform / demo data — never a customer tenant. */

export const PLATFORM_ORG_SLUG = "iprojectx";

export function isPlatformOrgSlug(slug: string | null | undefined): boolean {
  return String(slug || "").trim().toLowerCase() === PLATFORM_ORG_SLUG;
}

export function isPlatformOrgName(name: string | null | undefined): boolean {
  return String(name || "").trim().toLowerCase() === "iprojectx";
}

export function isPlatformOrgRow(row: { slug?: string | null; name?: string | null } | null | undefined): boolean {
  if (!row) return false;
  return isPlatformOrgSlug(row.slug) || isPlatformOrgName(row.name);
}

export function assertPlatformOrgId(orgId: string, expectedId: string, context: string) {
  if (orgId !== expectedId) {
    throw new Error(`${context}: refused a row outside the iProjectX platform organisation`);
  }
}
