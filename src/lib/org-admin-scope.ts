/** Org admin is a role bound to that org. A null org_id must not elevate. */

export function roleGrantsOrgAdmin(
  roles: { role: string; org_id: string | null }[],
  orgId: string,
): boolean {
  return roles.some(
    (r) => (r.role === "admin" || r.role === "org_admin") && r.org_id === orgId,
  );
}
