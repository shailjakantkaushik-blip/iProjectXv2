/** Align lane bar dates with project infographic / portfolio timeline. */
export function normalizeTimelineLaneDates<T extends Record<string, any>>(lane: T): T {
  return {
    ...lane,
    start_date: lane.planned_start_date || lane.actual_start_date || lane.start_date || null,
    end_date: lane.actual_end_date || lane.planned_end_date || lane.end_date || null,
  };
}
