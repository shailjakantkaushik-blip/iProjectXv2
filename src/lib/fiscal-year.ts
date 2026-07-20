// Helpers for organization-specific Financial Year handling.
// fy_start_month is 1..12 (Jan=1, Apr=4). Default = April (4).
export function fyMonthIndex(fyStartMonth?: number | null) {
  const m = Math.max(1, Math.min(12, Number(fyStartMonth || 4)));
  return m - 1; // JS month index
}

export function fyStartFor(d: Date, fyStartMonth?: number | null) {
  const startIdx = fyMonthIndex(fyStartMonth);
  const y = d.getFullYear();
  const startYear = d.getMonth() >= startIdx ? y : y - 1;
  return new Date(startYear, startIdx, 1);
}

export function fyEndFor(d: Date, fyStartMonth?: number | null) {
  const s = fyStartFor(d, fyStartMonth);
  return new Date(s.getFullYear() + 1, s.getMonth(), 0, 23, 59, 59); // last day of month before start
}

// FY label uses the ENDING calendar year (e.g., April 2026 → FY27).
export function fyLabel(d: Date, fyStartMonth?: number | null) {
  const s = fyStartFor(d, fyStartMonth);
  return `FY${String(s.getFullYear() + 1).slice(-2)}`;
}

export const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
