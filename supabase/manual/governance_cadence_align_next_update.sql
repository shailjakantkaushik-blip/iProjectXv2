-- =============================================================================
-- iProjectX — Finish cadence previous/next rewrite (paste → Run)
-- Your previous script already created the functions; only this UPDATE failed.
-- Then: Settings → API → Reload schema
-- Safe to re-run.
-- =============================================================================

UPDATE public.governance_channels c
SET
  (last_meeting, next_meeting) = (
    SELECT s.last_meeting, s.next_meeting
    FROM public.governance_sync_meeting_dates(
      coalesce(c.cadence_start, c.last_meeting, c.next_meeting, CURRENT_DATE),
      coalesce(
        c.cadence_end,
        public.governance_default_cadence_end(
          public.governance_snap_weekday(
            coalesce(c.cadence_start, c.last_meeting, c.next_meeting, CURRENT_DATE),
            'forward'
          )
        )
      ),
      c.cadence,
      CURRENT_DATE
    ) s
  )
WHERE c.status IS DISTINCT FROM 'Retired';
