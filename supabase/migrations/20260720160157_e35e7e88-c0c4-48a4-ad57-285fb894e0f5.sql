
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS planned_start_date date,
  ADD COLUMN IF NOT EXISTS planned_end_date date,
  ADD COLUMN IF NOT EXISTS actual_start_date date,
  ADD COLUMN IF NOT EXISTS actual_end_date date;

-- Backfill planned dates from existing start/end where empty
UPDATE public.projects
   SET planned_start_date = COALESCE(planned_start_date, start_date),
       planned_end_date   = COALESCE(planned_end_date, end_date),
       actual_start_date  = COALESCE(actual_start_date, start_date),
       actual_end_date    = COALESCE(actual_end_date, end_date);
