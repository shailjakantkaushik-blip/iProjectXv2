-- Optional stream on RAID (risks, actions, issues, decisions).
-- Blank stream_id = project-level item. Decisions already have stage_gate_id;
-- choosing a stream filters which gate rows appear when recording an approval.
-- Idempotent. Does not re-point existing RAID rows onto Core.

ALTER TABLE public.risks
  ADD COLUMN IF NOT EXISTS stream_id uuid REFERENCES public.project_streams(id) ON DELETE SET NULL;
ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS stream_id uuid REFERENCES public.project_streams(id) ON DELETE SET NULL;
ALTER TABLE public.issues
  ADD COLUMN IF NOT EXISTS stream_id uuid REFERENCES public.project_streams(id) ON DELETE SET NULL;
ALTER TABLE public.decisions
  ADD COLUMN IF NOT EXISTS stream_id uuid REFERENCES public.project_streams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS risks_stream_idx ON public.risks (stream_id);
CREATE INDEX IF NOT EXISTS actions_stream_idx ON public.actions (stream_id);
CREATE INDEX IF NOT EXISTS issues_stream_idx ON public.issues (stream_id);
CREATE INDEX IF NOT EXISTS decisions_stream_idx ON public.decisions (stream_id);

CREATE INDEX IF NOT EXISTS risks_project_stream_idx ON public.risks (project_id, stream_id);
CREATE INDEX IF NOT EXISTS actions_project_stream_idx ON public.actions (project_id, stream_id);
CREATE INDEX IF NOT EXISTS issues_project_stream_idx ON public.issues (project_id, stream_id);
CREATE INDEX IF NOT EXISTS decisions_project_stream_idx ON public.decisions (project_id, stream_id);

COMMENT ON COLUMN public.risks.stream_id IS
  'Optional delivery stream. Null means the risk is recorded at project level.';
COMMENT ON COLUMN public.actions.stream_id IS
  'Optional delivery stream. Null means the action is recorded at project level.';
COMMENT ON COLUMN public.issues.stream_id IS
  'Optional delivery stream. Null means the issue is recorded at project level.';
COMMENT ON COLUMN public.decisions.stream_id IS
  'Optional delivery stream. Null means the decision is recorded at project level. Stage-gate approval still uses stage_gate_id.';
