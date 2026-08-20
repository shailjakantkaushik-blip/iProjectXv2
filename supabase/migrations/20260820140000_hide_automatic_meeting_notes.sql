-- Project Summary: hide system-generated notes on the card and Executive Cockpit.

ALTER TABLE public.project_meeting_summaries
  ADD COLUMN IF NOT EXISTS hide_automatic_notes boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.project_meeting_summaries.hide_automatic_notes IS
  'When true, automatic action/milestone notes are hidden on Project Summary and Executive Cockpit.';
