/** Time-elapsed schedule completion (0–100) for a start→end window. */
export function scheduleCompletionPct(
  startMs: number,
  endMs: number,
  nowMs: number = Date.now(),
): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  return Math.min(100, Math.max(0, Math.round(((nowMs - startMs) / (endMs - startMs)) * 100)));
}

/** Darken a hex colour for “completed so far” fill on timeline bars. */
export function darkenHex(hex: string, amount = 0.35): string {
  const raw = String(hex || "").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return "rgba(0,0,0,0.45)";
  const n = parseInt(raw, 16);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.round((n & 255) * (1 - amount)));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
