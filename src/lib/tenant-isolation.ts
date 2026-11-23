/**
 * Intended two-org isolation for SECURITY DEFINER RPCs.
 * Mirrors the SQL in supabase/migrations/20261123*.
 * uid === null is service_role / trigger (no JWT).
 */
export type IsolationCaller = {
  uid: string | null;
  homeOrgId: string | null;
  isOrgAdmin: boolean;
  isPlatformAdmin: boolean;
};

export function canRefreshOrgKpi(caller: IsolationCaller, targetOrgId: string): boolean {
  if (caller.uid == null) return true;
  return caller.homeOrgId === targetOrgId;
}

export function canSyncOrgResources(
  caller: IsolationCaller,
  targetOrgId: string | null,
): boolean {
  if (caller.uid == null) return true;
  if (!caller.isOrgAdmin || !caller.homeOrgId) return false;
  if (targetOrgId == null) return true;
  return caller.homeOrgId === targetOrgId;
}

export function canSeedPagePermissions(caller: IsolationCaller, targetOrgId: string): boolean {
  if (caller.uid == null) return true;
  return caller.isOrgAdmin && caller.homeOrgId === targetOrgId;
}

export function canEnsureDeliveryMethods(caller: IsolationCaller, targetOrgId: string): boolean {
  if (caller.uid == null) return true;
  return caller.homeOrgId === targetOrgId || caller.isPlatformAdmin;
}
