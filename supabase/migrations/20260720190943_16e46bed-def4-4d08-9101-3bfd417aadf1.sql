
CREATE OR REPLACE FUNCTION public.tg_milestone_to_status_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  proj_name text;
  msg text;
  is_new_complete boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    msg := 'Milestone added: ' || NEW.name;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.actual_date IS NOT NULL AND (OLD.actual_date IS NULL OR OLD.actual_date <> NEW.actual_date) THEN
      msg := 'Milestone completed: ' || NEW.name || ' on ' || NEW.actual_date::text;
      is_new_complete := true;
    ELSIF COALESCE(NEW.status,'') <> COALESCE(OLD.status,'') THEN
      msg := 'Milestone status changed to ' || COALESCE(NEW.status,'—') || ': ' || NEW.name;
    ELSIF COALESCE(NEW.planned_date::text,'') <> COALESCE(OLD.planned_date::text,'') THEN
      msg := 'Milestone rescheduled: ' || NEW.name || ' → ' || COALESCE(NEW.planned_date::text,'TBD');
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  SELECT name INTO proj_name FROM public.projects WHERE id = NEW.project_id;

  INSERT INTO public.status_updates (org_id, project_id, update_date, reporter, overall_rag, progress_summary, achievements)
  VALUES (
    NEW.org_id,
    NEW.project_id,
    COALESCE(NEW.actual_date, CURRENT_DATE),
    COALESCE(NEW.owner, 'System'),
    'Green',
    msg,
    CASE WHEN is_new_complete THEN '✅ ' || NEW.name ELSE NULL END
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_milestone_to_status_update ON public.milestones;
CREATE TRIGGER trg_milestone_to_status_update
  AFTER INSERT OR UPDATE ON public.milestones
  FOR EACH ROW EXECUTE FUNCTION public.tg_milestone_to_status_update();
