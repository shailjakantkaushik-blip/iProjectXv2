/**
 * Project schedule dates.
 *
 * - planned_* = committed baseline schedule
 * - actual_*  = realised (or current expected) dates
 * - start/end = legacy schedule window used by Gantt/FY/overdue — kept in sync
 *   as coalesce(actual, planned) so older consumers keep working.
 */

export type ProjectDatesLike = {
  start_date?: string | null;
  end_date?: string | null;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
  target_go_live?: string | null;
};

function emptyToNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, 10) : null;
}

/** Effective schedule start for charts / FY / filters. */
export function projectScheduleStart(p: ProjectDatesLike | null | undefined): string | null {
  if (!p) return null;
  return (
    emptyToNull(p.actual_start_date) ||
    emptyToNull(p.planned_start_date) ||
    emptyToNull(p.start_date)
  );
}

/** Effective schedule end for charts / FY / overdue. */
export function projectScheduleEnd(p: ProjectDatesLike | null | undefined): string | null {
  if (!p) return null;
  return (
    emptyToNull(p.actual_end_date) ||
    emptyToNull(p.planned_end_date) ||
    emptyToNull(p.end_date)
  );
}

/**
 * Keep legacy start_date / end_date aligned with planned/actual so Gantt,
 * FY filters, and purge keep working when only planned/actual are edited.
 */
export function syncScheduleDates<T extends ProjectDatesLike>(row: T): T {
  const plannedStart = emptyToNull(row.planned_start_date);
  const plannedEnd = emptyToNull(row.planned_end_date);
  const actualStart = emptyToNull(row.actual_start_date);
  const actualEnd = emptyToNull(row.actual_end_date);
  let start = emptyToNull(row.start_date);
  let end = emptyToNull(row.end_date);

  // If planned is empty but legacy start/end filled, seed planned once.
  const nextPlannedStart = plannedStart || start;
  const nextPlannedEnd = plannedEnd || end;

  start = actualStart || nextPlannedStart || start;
  end = actualEnd || nextPlannedEnd || end;

  return {
    ...row,
    planned_start_date: nextPlannedStart,
    planned_end_date: nextPlannedEnd,
    actual_start_date: actualStart,
    actual_end_date: actualEnd,
    start_date: start,
    end_date: end,
  };
}

export function fyOf(dateStr?: string | null, fyStartMonth: number = 4): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const startYear = d.getMonth() >= fyStartMonth - 1 ? y : y - 1;
  return `FY${String(startYear + 1).slice(-2)}`;
}
