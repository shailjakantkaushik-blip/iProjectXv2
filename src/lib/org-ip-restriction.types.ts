export type OrgIpRestrictionResult =
  | { allowed: true; enforced: boolean; clientIp: string | null }
  | { allowed: false; enforced: true; clientIp: string | null; message: string };
