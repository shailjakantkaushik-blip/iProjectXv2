import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Lock, Unlock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isAdmin } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { fetchProjectOptions, projectOptionsQueryKey } from "@/lib/project-options";
import { RESOURCES_SELECT, STAGE_GATE_DEFINITIONS_SELECT, STAGE_GATES_SELECT } from "@/lib/query-selects";
import { dailyRateFromHourly, isProjectKickedOff } from "@/lib/ops-enhancements";
import { deliveryMethodsQueryKey, fetchDeliveryMethods, findDeliveryMethod } from "@/lib/delivery-methods";
import { fetchOrgStreams, formatStreamLabel } from "@/lib/project-streams";
import {
  applyForecastToProjectPlan,
  daysToMonths,
  ensureStageGatesForStreams,
  FORECAST_COST_CATEGORIES,
  forecastPhaseKey,
  isForecastableProjectStatus,
  layoutForecastPhases,
  loadForecastPhases,
  mergeForecastPhases,
  monthsToDays,
  parseForecastPhaseNotes,
  persistForecastPhases,
  phasesForDeliveryMethod,
  type ForecastPhaseRow,
  type PlannedGateLike,
} from "@/lib/project-forecast";
import { ForecastPhaseGantt } from "@/components/forecast-phase-gantt";
import { ForecastResourceBoard } from "@/components/forecast-resource-board";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app/project-forecast")({
  component: ProjectForecastPage,
});

const money = (n: number) =>
  "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0);

function ProjectForecastPage() {
  const { organization, session, profile, roles } = useAuth();
  const orgId = organization?.id;
  const fyStartMonth = organization?.fy_start_month || 4;
  const qc = useQueryClient();
  const admin = isAdmin(roles);
  const [projectId, setProjectId] = useState("");
  const [planStart, setPlanStart] = useState("");
  const [phaseDraft, setPhaseDraft] = useState<ForecastPhaseRow[]>([]);

  const { data: allProjects = [] } = useQuery({
    queryKey: projectOptionsQueryKey(orgId),
    queryFn: fetchProjectOptions,
    enabled: !!orgId,
  });
  const projects = useMemo(
    () => (allProjects as any[]).filter((p) => isForecastableProjectStatus(p.status)),
    [allProjects],
  );

  const { data: project } = useQuery({
    queryKey: ["project", projectId, "forecast-head"],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
      return data as any;
    },
    enabled: !!projectId,
  });

  const { data: deliveryMethods = [] } = useQuery({
    queryKey: deliveryMethodsQueryKey(orgId),
    queryFn: () => fetchDeliveryMethods(orgId!, { activeOnly: true }),
    enabled: !!orgId,
  });

  const { data: gateDefs = [] } = useQuery({
    queryKey: ["stage_gate_definitions", orgId],
    queryFn: async () =>
      (
        await supabase
          .from("stage_gate_definitions")
          .select(STAGE_GATE_DEFINITIONS_SELECT as "*")
          .eq("org_id", orgId!)
          .eq("is_active", true)
          .order("sort_order")
      ).data ?? [],
    enabled: !!orgId,
  });

  const { data: streams = [] } = useQuery({
    queryKey: ["project_streams", orgId, projectId],
    queryFn: async () => {
      const all = await fetchOrgStreams(orgId!);
      return all.filter((s) => s.project_id === projectId);
    },
    enabled: !!orgId && !!projectId,
  });

  const { data: gates = [] } = useQuery({
    queryKey: ["stage_gates", orgId, projectId, "forecast"],
    queryFn: async () =>
      (
        await supabase
          .from("stage_gates")
          .select(STAGE_GATES_SELECT as "*")
          .eq("project_id", projectId)
      ).data ?? [],
    enabled: !!orgId && !!projectId,
  });

  const { data: resources = [] } = useQuery({
    queryKey: ["resources", orgId],
    queryFn: async () =>
      (await supabase.from("resources").select(RESOURCES_SELECT as "*").eq("status", "Active")).data ??
      [],
    enabled: !!orgId,
  });

  const { data: allocations = [] } = useQuery({
    queryKey: ["resource_allocations", orgId, "capacity"],
    queryFn: async () =>
      (await supabase.from("resource_allocations").select("resource_id,allocated_hours,allocation_percent"))
        .data ?? [],
    enabled: !!orgId,
  });

  const { data: forecast } = useQuery({
    queryKey: ["project_forecasts", orgId, projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_forecasts" as any)
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) return null;
      return data as any;
    },
    enabled: !!orgId && !!projectId,
  });

  const { data: storedPhases = [] } = useQuery({
    queryKey: ["project_forecast_phases", forecast?.id],
    queryFn: () => loadForecastPhases(forecast.id),
    enabled: !!forecast?.id,
  });

  const { data: phaseRes = [] } = useQuery({
    queryKey: ["project_forecast_phase_resources", forecast?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("project_forecast_phase_resources" as any)
        .select("*")
        .eq("forecast_id", forecast.id);
      return (data ?? []) as any[];
    },
    enabled: !!forecast?.id,
  });

  const { data: otherCosts = [] } = useQuery({
    queryKey: ["project_forecast_other_costs", forecast?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("project_forecast_other_costs" as any)
        .select("*")
        .eq("forecast_id", forecast.id)
        .order("sort_order");
      return (data ?? []) as any[];
    },
    enabled: !!forecast?.id,
  });

  const method = useMemo(
    () =>
      project
        ? (project.delivery_method_id &&
            deliveryMethods.find((m) => m.id === project.delivery_method_id)) ||
          findDeliveryMethod(deliveryMethods, project.delivery_method)
        : undefined,
    [project, deliveryMethods],
  );

  const templateNames = useMemo(
    () =>
      project
        ? phasesForDeliveryMethod(deliveryMethods, gateDefs as any[], project)
        : [],
    [deliveryMethods, gateDefs, project],
  );

  const projectStreams = useMemo(
    () =>
      (streams as any[]).map((s) => ({
        id: s.id,
        name: formatStreamLabel(s),
        is_default: s.is_default,
        sort_order: s.sort_order,
        planned_start_date: s.planned_start_date,
        planned_end_date: s.planned_end_date,
        actual_start_date: s.actual_start_date,
        actual_end_date: s.actual_end_date,
      })),
    [streams],
  );

  const locked = forecast?.status === "locked";
  const kickedOff = project ? isProjectKickedOff(project) : false;
  const sponsorMatch = Boolean(
    project?.sponsor &&
      (String(profile?.full_name || "").toLowerCase() === String(project.sponsor).toLowerCase() ||
        String(session?.user?.email || "").toLowerCase() === String(project.sponsor).toLowerCase()),
  );
  const canUnlock = admin || sponsorMatch;
  const canEdit = !locked;
  const unlockRequested = Boolean(forecast?.unlock_requested_at);

  const plannedGates = useMemo(
    () =>
      (gates as PlannedGateLike[]).map((g) => ({
        stream_id: g.stream_id || null,
        gate_name: g.gate_name || null,
        planned_date: g.planned_date || null,
      })),
    [gates],
  );

  useEffect(() => {
    const fromProject = (project?.planned_start_date || project?.start_date || "").slice(0, 10);
    const fromForecast = (forecast?.plan_start_date || "").slice(0, 10);
    const fromGates = plannedGates
      .map((g) => (g.planned_date || "").slice(0, 10))
      .filter(Boolean)
      .sort()[0] || "";
    setPlanStart(fromProject || fromForecast || fromGates || "");
  }, [projectId, project?.planned_start_date, project?.start_date, forecast?.plan_start_date, plannedGates]);

  useEffect(() => {
    const stored =
      storedPhases.length > 0 ? storedPhases : parseForecastPhaseNotes(forecast?.notes);
    setPhaseDraft(
      mergeForecastPhases(templateNames, projectStreams, stored, {
        gates: plannedGates,
        projectStart: project?.planned_start_date || project?.start_date || null,
      }),
    );
  }, [
    templateNames,
    storedPhases,
    forecast?.notes,
    forecast?.id,
    projectStreams,
    plannedGates,
    project?.planned_start_date,
    project?.start_date,
  ]);

  const phases = useMemo(
    () => layoutForecastPhases(phaseDraft, planStart || null, projectStreams),
    [phaseDraft, planStart, projectStreams],
  );

  const ensure = useMutation({
    mutationFn: async () => {
      if (forecast?.id) return forecast;
      const { data, error } = await supabase
        .from("project_forecasts" as any)
        .insert({
          org_id: orgId,
          project_id: projectId,
          status: kickedOff ? "locked" : "draft",
          locked_at: kickedOff ? new Date().toISOString() : null,
          plan_start_date: planStart || null,
        })
        .select("*")
        .single();
      if (error) throw error;
      if (orgId && templateNames.length) {
        await ensureStageGatesForStreams({
          orgId,
          projectId,
          streams: projectStreams,
          templateNames,
          existingGates: plannedGates,
        });
      }
      const laid = layoutForecastPhases(
        mergeForecastPhases(templateNames, projectStreams, [], {
          gates: plannedGates,
          projectStart: planStart || null,
        }),
        planStart || null,
        projectStreams,
      );
      await persistForecastPhases({
        orgId: orgId!,
        projectId,
        forecastId: data.id,
        phases: laid,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_forecasts", orgId, projectId] });
      qc.invalidateQueries({ queryKey: ["project_forecast_phases"] });
      qc.invalidateQueries({ queryKey: ["stage_gates", orgId, projectId, "forecast"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const persistTotals = async (fid: string, labor: number, other: number, override: boolean) => {
    const total = labor + other;
    await supabase
      .from("project_forecasts" as any)
      .update({
        total_labor_cost: labor,
        total_other_cost: other,
        total_cost: total,
        override_budget: override,
      })
      .eq("id", fid);
    if (override) {
      await supabase
        .from("projects")
        .update({ forecast_at_completion: total } as never)
        .eq("id", projectId);
    }
  };

  const laborByPhase = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of phaseRes) {
      const key = r.phase_name || r.forecast_phase_id || r.stream_id || "";
      m.set(key, (m.get(key) || 0) + Number(r.labor_cost || 0));
    }
    return m;
  }, [phaseRes]);

  const otherByPhase = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of otherCosts) {
      const key = c.forecast_phase_id || "";
      if (!key) continue;
      m.set(key, (m.get(key) || 0) + Number(c.amount || 0));
    }
    return m;
  }, [otherCosts]);

  const laborForPhase = (ph: ForecastPhaseRow) =>
    rowsForPhase(ph).reduce((s, r) => s + Number(r.labor_cost || 0), 0);
  const otherForPhase = (ph: ForecastPhaseRow) => (ph.id ? otherByPhase.get(ph.id) || 0 : 0);

  const laborTotal = phaseRes.reduce((s, r) => s + Number(r.labor_cost || 0), 0);
  const otherTotal = otherCosts.reduce((s, r) => s + Number(r.amount || 0), 0);
  const grand = laborTotal + otherTotal;
  const lastPersisted = useRef({ id: "", labor: 0, other: 0 });

  useEffect(() => {
    if (!forecast?.id || locked) return;
    const sameAsSaved =
      lastPersisted.current.id === forecast.id &&
      Math.abs(lastPersisted.current.labor - laborTotal) < 0.01 &&
      Math.abs(lastPersisted.current.other - otherTotal) < 0.01;
    const sameAsRow =
      Math.abs(Number(forecast.total_labor_cost || 0) - laborTotal) < 0.01 &&
      Math.abs(Number(forecast.total_other_cost || 0) - otherTotal) < 0.01;
    if (sameAsSaved || sameAsRow) {
      lastPersisted.current = { id: forecast.id, labor: laborTotal, other: otherTotal };
      return;
    }
    const t = window.setTimeout(() => {
      lastPersisted.current = { id: forecast.id, labor: laborTotal, other: otherTotal };
      void persistTotals(forecast.id, laborTotal, otherTotal, !!forecast.override_budget);
    }, 500);
    return () => window.clearTimeout(t);
  }, [
    forecast?.id,
    forecast?.total_labor_cost,
    forecast?.total_other_cost,
    forecast?.override_budget,
    locked,
    laborTotal,
    otherTotal,
  ]);

  const rowsForPhase = (ph: ForecastPhaseRow) =>
    phaseRes.filter((r) => {
      if (ph.id && r.forecast_phase_id === ph.id) return true;
      const samePhase = r.phase_name === ph.gate_name;
      const sameStream = (r.stream_id || null) === (ph.stream_id || null);
      return samePhase && sameStream;
    });

  const addResourceToPhase = useMutation({
    mutationFn: async ({
      phase,
      resourceId,
      days,
    }: {
      phase: ForecastPhaseRow;
      resourceId: string;
      days: number;
    }) => {
      let fid = forecast?.id;
      if (!fid) {
        const created = await ensure.mutateAsync();
        fid = created.id;
      }
      const res = (resources as any[]).find((r) => r.id === resourceId);
      const daily = dailyRateFromHourly(res?.cost_rate);
      const labor = Math.round(daily * days * 100) / 100;
      const payload: Record<string, unknown> = {
        org_id: orgId,
        forecast_id: fid,
        project_id: projectId,
        stream_id: phase.stream_id || null,
        phase_name: phase.gate_name,
        forecast_phase_id: phase.id || null,
        resource_id: resourceId,
        effort_days: days,
        daily_rate: daily,
        labor_cost: labor,
      };
      const first = await supabase.from("project_forecast_phase_resources" as any).insert(payload);
      if (first.error) {
        delete payload.phase_name;
        delete payload.forecast_phase_id;
        const { error } = await supabase
          .from("project_forecast_phase_resources" as any)
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_forecast_phase_resources"] });
      qc.invalidateQueries({ queryKey: ["project_forecasts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patchEffort = useMutation({
    mutationFn: async ({ id, days, rate }: { id: string; days: number; rate: number }) => {
      const { error } = await supabase
        .from("project_forecast_phase_resources" as any)
        .update({ effort_days: days, labor_cost: Math.round(days * rate * 100) / 100 })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project_forecast_phase_resources"] }),
  });

  const removePhaseRes = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("project_forecast_phase_resources" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project_forecast_phase_resources"] }),
  });

  const addOther = useMutation({
    mutationFn: async () => {
      let fid = forecast?.id;
      if (!fid) fid = (await ensure.mutateAsync()).id;
      const payload: Record<string, unknown> = {
        org_id: orgId,
        forecast_id: fid,
        project_id: projectId,
        heading: "Other cost",
        category: "Other",
        amount: 0,
        sort_order: otherCosts.length,
      };
      const first = await supabase.from("project_forecast_other_costs" as any).insert(payload);
      if (first.error) {
        delete payload.category;
        delete payload.forecast_phase_id;
        const { error } = await supabase.from("project_forecast_other_costs" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project_forecast_other_costs"] }),
  });

  const patchOther = useMutation({
    mutationFn: async (patch: {
      id: string;
      heading?: string;
      amount?: number;
      category?: string;
      forecast_phase_id?: string | null;
    }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase
        .from("project_forecast_other_costs" as any)
        .update(rest)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project_forecast_other_costs"] }),
  });

  const removeOther = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("project_forecast_other_costs" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project_forecast_other_costs"] }),
  });

  const applyOverride = useMutation({
    mutationFn: async (on: boolean) => {
      if (!forecast?.id) return;
      await persistTotals(forecast.id, laborTotal, otherTotal, on);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_forecasts"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Forecast totals saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setLock = useMutation({
    mutationFn: async (next: "draft" | "locked" | "request") => {
      if (!forecast?.id) return;
      if (next === "draft" && !canUnlock)
        throw new Error("Only the project sponsor or an admin can unlock a kicked-off plan.");
      if (next === "request") {
        const { error } = await supabase
          .from("project_forecasts" as any)
          .update({
            unlock_requested_at: new Date().toISOString(),
            unlock_requested_by: session?.user?.id || null,
          })
          .eq("id", forecast.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("project_forecasts" as any)
        .update({
          status: next,
          locked_at: next === "locked" ? new Date().toISOString() : null,
          locked_by: next === "locked" ? session?.user?.id : null,
          unlock_approved_at: next === "draft" ? new Date().toISOString() : null,
          unlock_approved_by: next === "draft" ? session?.user?.id : null,
          unlock_requested_at: next === "draft" ? null : forecast.unlock_requested_at,
        })
        .eq("id", forecast.id);
      if (error) throw error;
    },
    onSuccess: (_d, next) => {
      qc.invalidateQueries({ queryKey: ["project_forecasts"] });
      toast.success(
        next === "request"
          ? "Unlock requested — waiting for sponsor or admin"
          : locked
            ? "Plan unlocked for estimate changes"
            : "Plan locked as the baseline forecast",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!forecast?.id || !kickedOff) return;
    if (forecast.status === "draft" && !forecast.unlock_approved_at) {
      setLock.mutate("locked");
    }
  }, [forecast?.id, forecast?.status, forecast?.unlock_approved_at, kickedOff]);

  const savePhases = useMutation({
    mutationFn: async (rows: ForecastPhaseRow[]) => {
      let fid = forecast?.id;
      if (!fid) fid = (await ensure.mutateAsync()).id;
      const laid = layoutForecastPhases(rows, planStart || null, projectStreams);
      return persistForecastPhases({
        orgId: orgId!,
        projectId,
        forecastId: fid,
        phases: laid,
        existingNotes: forecast?.notes,
      });
    },
    onSuccess: (rows) => {
      setPhaseDraft(rows);
      qc.invalidateQueries({ queryKey: ["project_forecast_phases"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyPlan = useMutation({
    mutationFn: async (onlyFillEmpty: boolean) => {
      if (!orgId || !projectId) throw new Error("Select a project first");
      if (!planStart) throw new Error("Set the project start date first");
      let fid = forecast?.id;
      if (!fid) fid = (await ensure.mutateAsync()).id;
      if (orgId && templateNames.length) {
        await ensureStageGatesForStreams({
          orgId,
          projectId,
          streams: projectStreams,
          templateNames,
          existingGates: plannedGates,
        });
      }
      const laid = layoutForecastPhases(phaseDraft, planStart, projectStreams);
      await persistForecastPhases({
        orgId,
        projectId,
        forecastId: fid,
        phases: laid,
        existingNotes: forecast?.notes,
      });
      return applyForecastToProjectPlan({
        orgId,
        projectId,
        startDate: planStart,
        phases: laid,
        streams: projectStreams,
        onlyFillEmpty,
        forecastId: fid,
      });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["stage_gates"] });
      qc.invalidateQueries({ queryKey: ["project_streams"] });
      qc.invalidateQueries({ queryKey: ["project_forecasts"] });
      qc.invalidateQueries({ queryKey: ["resource_allocations"] });
      qc.invalidateQueries({ queryKey: ["financials_monthly"] });
      toast.success(
        r.plannedEnd
          ? `Planned baseline applied through ${r.plannedEnd}`
          : "Planned dates, cost, and FTE applied from the forecast",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patchPhase = (phase: ForecastPhaseRow, patch: Partial<ForecastPhaseRow>) => {
    const key = forecastPhaseKey(phase);
    const next = phaseDraft.map((p) => (forecastPhaseKey(p) === key ? { ...p, ...patch } : p));
    setPhaseDraft(next);
  };

  const persistPhaseDraft = () => {
    if (!canEdit) return;
    savePhases.mutate(phaseDraft);
  };

  return (
    <div>
      <PageHeading
        icon="📊"
        title="Project Forecast Estimation"
        subtitle="After a project is created (streams + delivery-method phases), estimate the plan here. Once work starts this stays the planned forecast; actuals update separately so timeline plan vs actual stays in sync."
      />

      <SectionFrame>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">
            Project
            <select
              className="st-input mt-1 min-w-[260px]"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">Select a project…</option>
              {projects.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.project_code} · {p.name} · {p.status || "Not Started"}
                </option>
              ))}
            </select>
          </label>
          {project && (
            <div className="text-xs text-muted-foreground">
              Delivery method: <span className="font-semibold text-foreground">{method?.name || project.delivery_method || "—"}</span>
            </div>
          )}
          <label className="text-xs">
            Project start
            <input
              type="date"
              className="st-input mt-1"
              value={planStart}
              disabled={!projectId || !canEdit}
              onChange={(e) => setPlanStart(e.target.value)}
              onBlur={() => {
                if (planStart && canEdit) applyPlan.mutate(true);
              }}
            />
          </label>
          {projectId && !forecast && (
            <Button type="button" onClick={() => ensure.mutate()} disabled={ensure.isPending}>
              Create forecast
            </Button>
          )}
          {forecast && !locked && (
            <Button type="button" variant="outline" onClick={() => setLock.mutate("locked")}>
              <Lock className="mr-1 h-4 w-4" />
              Lock as plan
            </Button>
          )}
          {forecast && locked && canUnlock && (
            <Button type="button" variant="outline" onClick={() => setLock.mutate("draft")}>
              <Unlock className="mr-1 h-4 w-4" />
              Unlock plan (sponsor)
            </Button>
          )}
          {forecast && locked && !canUnlock && (
            <Button
              type="button"
              variant="outline"
              disabled={unlockRequested}
              onClick={() => setLock.mutate("request")}
            >
              {unlockRequested ? "Unlock requested" : "Request sponsor unlock"}
            </Button>
          )}
          {projectId && (
            <Button
              type="button"
              disabled={!planStart || applyPlan.isPending || !canEdit}
              onClick={() => applyPlan.mutate(false)}
            >
              Apply planned baseline
            </Button>
          )}
          {projectId && (
            <Link
              to="/app/projects/$id"
              params={{ id: projectId }}
              className="text-xs font-medium text-primary hover:underline"
            >
              Open project
            </Link>
          )}
        </div>
        {project && (
          <p className="mt-2 text-xs text-muted-foreground">
            {kickedOff
              ? "Project has started. This page is the planned baseline (dates, cost, and FTE). Actual dates and incurred cost come from streams, gates, and timesheets — they are not overwritten here. Changing the plan needs sponsor or admin unlock."
              : "Not started yet. Apply planned baseline writes forecast dates, phase cost, and resource FTE onto the project as Planned. Timeline treats those dates as planned. Actuals start when the PM records Actual Start."}
          </p>
        )}
        {!project && (
          <p className="mt-2 text-xs text-muted-foreground">
            Shows Not Started and In Progress projects created in the new-project flow (streams +
            phases). Completed / cancelled projects are omitted.
          </p>
        )}
      </SectionFrame>

      {!projectId ? (
        <p className="text-sm text-muted-foreground">
          Choose a Not Started or In Progress project. Create the structure first in{" "}
          <Link to="/app/projects/new" className="font-medium text-primary hover:underline">
            New project
          </Link>
          , then estimate streams and phases here.
        </p>
      ) : (
        <>
          <SectionFrame>
            <SectionTitle>Phase timeline (months &amp; FY)</SectionTitle>
            <ForecastPhaseGantt
              phases={phases.map((p, idx, arr) => {
                const gate = (gates as any[]).find(
                  (g) =>
                    g.gate_name === p.gate_name &&
                    (g.stream_id === p.stream_id ||
                      (!g.stream_id && projectStreams.find((s) => s.id === p.stream_id)?.is_default)),
                );
                const stream = projectStreams.find((s) => s.id === p.stream_id);
                const prev = [...arr]
                  .slice(0, idx)
                  .reverse()
                  .find((x) => (x.stream_id || "") === (p.stream_id || ""));
                const prevGate = prev
                  ? (gates as any[]).find(
                      (g) =>
                        g.gate_name === prev.gate_name &&
                        (g.stream_id === prev.stream_id || !g.stream_id),
                    )
                  : null;
                return {
                  stream_id: p.stream_id,
                  stream_name: p.stream_name,
                  gate_name: p.gate_name,
                  start_date: p.start_date,
                  end_date: p.end_date,
                  actual_start: prevGate?.actual_date || stream?.actual_start_date || null,
                  actual_end: gate?.actual_date || stream?.actual_end_date || null,
                  cost: laborForPhase(p) + otherForPhase(p),
                };
              })}
              fyStartMonth={fyStartMonth}
              showActuals={kickedOff}
            />
          </SectionFrame>

          <SectionFrame>
            <SectionTitle>Resources by phase</SectionTitle>
            <ForecastResourceBoard
              resources={resources as any[]}
              allocations={allocations as any[]}
              streams={projectStreams}
              phases={phases}
              phaseRes={phaseRes as any[]}
              canEdit={canEdit}
              planStart={planStart || null}
              onAssign={(opts) => addResourceToPhase.mutate(opts)}
              onPatchEffort={(opts) => patchEffort.mutate(opts)}
              onRemove={(id) => removePhaseRes.mutate(id)}
            />
          </SectionFrame>

          <SectionFrame>
            <SectionTitle>Advanced estimate — phases, resources, cost</SectionTitle>
            <p className="mb-3 text-xs text-muted-foreground">
              Each stream from the project setup is listed with the{" "}
              {method?.name || "delivery method"} stage-gate phases. Planned gate dates from
              new-project setup fill the timeline automatically (per stream). Duration is
              calendar days (months ≈ 30 days) and lays out sequentially per stream from the
              planned start.
            </p>
            <div className="overflow-x-auto">
              <table className="st-table text-xs">
                <thead>
                  <tr>
                    <th>Stream</th>
                    <th>Phase</th>
                    <th className="st-num">Days</th>
                    <th className="st-num">Months</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Override dates</th>
                    <th className="st-num">Labor</th>
                    <th className="st-num">Other</th>
                    <th className="st-num">Phase total</th>
                  </tr>
                </thead>
                <tbody>
                  {phases.map((ph) => {
                    const labor = laborForPhase(ph);
                    const other = otherForPhase(ph);
                    return (
                      <tr key={forecastPhaseKey(ph)}>
                        <td>{ph.stream_name || "—"}</td>
                        <td className="font-medium">{ph.gate_name}</td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            className="st-input !w-20 !py-0.5"
                            value={ph.duration_days}
                            disabled={!canEdit}
                            onChange={(e) =>
                              patchPhase(ph, {
                                duration_days: Number(e.target.value) || 0,
                              })
                            }
                            onBlur={persistPhaseDraft}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            step={0.1}
                            className="st-input !w-20 !py-0.5"
                            value={daysToMonths(ph.duration_days)}
                            disabled={!canEdit}
                            onChange={(e) =>
                              patchPhase(ph, {
                                duration_days: monthsToDays(Number(e.target.value) || 0),
                              })
                            }
                            onBlur={persistPhaseDraft}
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            className="st-input !py-0.5"
                            value={ph.start_date || ""}
                            disabled={!canEdit || !ph.dates_overridden}
                            onChange={(e) =>
                              patchPhase(ph, { start_date: e.target.value })
                            }
                            onBlur={persistPhaseDraft}
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            className="st-input !py-0.5"
                            value={ph.end_date || ""}
                            disabled={!canEdit || !ph.dates_overridden}
                            onChange={(e) =>
                              patchPhase(ph, { end_date: e.target.value })
                            }
                            onBlur={persistPhaseDraft}
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            disabled={!canEdit}
                            checked={!!ph.dates_overridden}
                            onChange={(e) => {
                              patchPhase(ph, { dates_overridden: e.target.checked });
                              window.setTimeout(persistPhaseDraft, 0);
                            }}
                          />
                        </td>
                        <td className="st-num tabular-nums">{money(labor)}</td>
                        <td className="st-num tabular-nums">{money(other)}</td>
                        <td className="st-num tabular-nums font-semibold">{money(labor + other)}</td>
                      </tr>
                    );
                  })}
                  {phases.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-4 text-center text-muted-foreground">
                        No stage-gate phases for this delivery method yet.{" "}
                        <Link
                          to="/app/stage-gate-config"
                          className="font-medium text-primary hover:underline"
                        >
                          Configure methods &amp; gates
                        </Link>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionFrame>

          <SectionFrame>
            <div className="mb-2 flex items-center justify-between">
              <SectionTitle>Further cost categories</SectionTitle>
              {canEdit && (
                <Button type="button" size="sm" variant="outline" onClick={() => addOther.mutate()}>
                  <Plus className="mr-1 h-4 w-4" /> Add cost category
                </Button>
              )}
            </div>
            {otherCosts.map((c) => (
              <div key={c.id} className="mb-2 flex flex-wrap items-center gap-2">
                <input
                  className="st-input min-w-[10rem]"
                  defaultValue={c.heading}
                  disabled={!canEdit}
                  onBlur={(e) => patchOther.mutate({ id: c.id, heading: e.target.value })}
                />
                <select
                  className="st-input !w-44"
                  defaultValue={c.category || "Other"}
                  disabled={!canEdit}
                  onChange={(e) => patchOther.mutate({ id: c.id, category: e.target.value })}
                >
                  {FORECAST_COST_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <select
                  className="st-input !w-48"
                  defaultValue={c.forecast_phase_id || ""}
                  disabled={!canEdit}
                  onChange={(e) =>
                    patchOther.mutate({
                      id: c.id,
                      forecast_phase_id: e.target.value || null,
                    })
                  }
                >
                  <option value="">Whole project</option>
                  {phases.map((p) => (
                    <option key={forecastPhaseKey(p)} value={p.id || ""}>
                      {p.stream_name ? `${p.stream_name} · ` : ""}
                      {p.gate_name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  className="st-input !w-32"
                  defaultValue={c.amount}
                  disabled={!canEdit}
                  onBlur={(e) =>
                    patchOther.mutate({ id: c.id, amount: Number(e.target.value) || 0 })
                  }
                />
                {canEdit && (
                  <button
                    type="button"
                    className="text-xs text-red-600"
                    onClick={() => removeOther.mutate(c.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </SectionFrame>

          <SectionFrame>
            <SectionTitle>Total project cost estimation</SectionTitle>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard label="Planned labor" value={money(laborTotal)} />
              <KpiCard label="Planned other" value={money(otherTotal)} />
              <KpiCard label="Planned forecast" value={money(grand)} accent="#1d4ed8" />
              <KpiCard
                label="Actual incurred"
                value={money(
                  (streams as any[]).reduce(
                    (s, x) => s + Number(x.capex_incurred || 0) + Number(x.opex_incurred || 0),
                    0,
                  ) ||
                    Number(project?.capex_incurred || 0) + Number(project?.opex_incurred || 0),
                )}
                accent="#059669"
              />
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={!forecast || locked}
                checked={!!forecast?.override_budget}
                onChange={(e) => applyOverride.mutate(e.target.checked)}
              />
              Override project budget forecast (FAC) with this total
            </label>
            <Button
              className="mt-3"
              type="button"
              disabled={!forecast || locked}
              onClick={() => applyOverride.mutate(!!forecast?.override_budget)}
            >
              Save totals
            </Button>
            {kickedOff && (
              <p className="mt-2 text-xs text-muted-foreground">
                Actual incurred is live from stream / project actuals. The planned forecast does not
                change unless the sponsor ({project?.sponsor || "unset"}) or an admin unlocks it.{" "}
                <Link to="/app/timeline" className="font-medium text-primary hover:underline">
                  Open timeline (plan vs actual)
                </Link>
              </p>
            )}
          </SectionFrame>
        </>
      )}
    </div>
  );
}
