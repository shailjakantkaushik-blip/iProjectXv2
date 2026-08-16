import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Lock, Unlock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isAdmin } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { fetchProjectOptions, projectOptionsQueryKey } from "@/lib/project-options";
import { fetchOrgStreams } from "@/lib/project-streams";
import { RESOURCES_SELECT } from "@/lib/query-selects";
import { dailyRateFromHourly, isProjectKickedOff } from "@/lib/ops-enhancements";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app/project-forecast")({
  component: ProjectForecastPage,
});

const money = (n: number) =>
  "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0);

function ProjectForecastPage() {
  const { organization, session, profile, roles } = useAuth();
  const orgId = organization?.id;
  const qc = useQueryClient();
  const admin = isAdmin(roles);
  const [projectId, setProjectId] = useState("");
  const [dragResource, setDragResource] = useState<string | null>(null);

  const { data: projects = [] } = useQuery({
    queryKey: projectOptionsQueryKey(orgId),
    queryFn: fetchProjectOptions,
    enabled: !!orgId,
  });

  const { data: project } = useQuery({
    queryKey: ["project", projectId, "forecast-head"],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .maybeSingle();
      return data as any;
    },
    enabled: !!projectId,
  });

  const { data: streams = [] } = useQuery({
    queryKey: ["project_streams", orgId, projectId],
    queryFn: () => fetchOrgStreams(orgId!),
    enabled: !!orgId && !!projectId,
  });

  const phases = useMemo(
    () =>
      (streams as any[])
        .filter((s) => s.project_id === projectId)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [streams, projectId],
  );

  const { data: resources = [] } = useQuery({
    queryKey: ["resources", orgId],
    queryFn: async () =>
      (
        await supabase
          .from("resources")
          .select(RESOURCES_SELECT as "*")
          .eq("status", "Active")
      ).data ?? [],
    enabled: !!orgId,
  });

  const { data: allocations = [] } = useQuery({
    queryKey: ["resource_allocations", orgId, "capacity"],
    queryFn: async () =>
      (
        await supabase
          .from("resource_allocations")
          .select("resource_id,allocated_hours,allocation_percent")
      ).data ?? [],
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

  const locked = forecast?.status === "locked";
  const kickedOff = project ? isProjectKickedOff(project) : false;
  const sponsorMatch = Boolean(
    project?.sponsor &&
    (String(profile?.full_name || "").toLowerCase() === String(project.sponsor).toLowerCase() ||
      String(session?.user?.email || "").toLowerCase() === String(project.sponsor).toLowerCase()),
  );
  const canUnlock = admin || sponsorMatch;
  const canEdit = !locked;

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
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project_forecasts", orgId, projectId] }),
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
      const sid = r.stream_id || "";
      m.set(sid, (m.get(sid) || 0) + Number(r.labor_cost || 0));
    }
    return m;
  }, [phaseRes]);

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

  const usedHours = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of allocations as any[]) {
      const id = a.resource_id;
      m.set(id, (m.get(id) || 0) + Number(a.allocated_hours || 0));
    }
    return m;
  }, [allocations]);

  const addResourceToPhase = useMutation({
    mutationFn: async ({
      streamId,
      resourceId,
      days,
    }: {
      streamId: string;
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
      const { error } = await supabase.from("project_forecast_phase_resources" as any).insert({
        org_id: orgId,
        forecast_id: fid,
        project_id: projectId,
        stream_id: streamId,
        resource_id: resourceId,
        effort_days: days,
        daily_rate: daily,
        labor_cost: labor,
      });
      if (error) throw error;
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
      const { error } = await supabase.from("project_forecast_other_costs" as any).insert({
        org_id: orgId,
        forecast_id: fid,
        project_id: projectId,
        heading: "Other cost",
        amount: 0,
        sort_order: otherCosts.length,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project_forecast_other_costs"] }),
  });

  const patchOther = useMutation({
    mutationFn: async ({
      id,
      heading,
      amount,
    }: {
      id: string;
      heading?: string;
      amount?: number;
    }) => {
      const { error } = await supabase
        .from("project_forecast_other_costs" as any)
        .update({ heading, amount })
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
    mutationFn: async (next: "draft" | "locked") => {
      if (!forecast?.id) return;
      if (next === "draft" && !canUnlock)
        throw new Error("Only the project sponsor or an admin can unlock a kicked-off estimate.");
      const { error } = await supabase
        .from("project_forecasts" as any)
        .update({
          status: next,
          locked_at: next === "locked" ? new Date().toISOString() : null,
          locked_by: next === "locked" ? session?.user?.id : null,
          unlock_approved_at: next === "draft" ? new Date().toISOString() : null,
          unlock_approved_by: next === "draft" ? session?.user?.id : null,
        })
        .eq("id", forecast.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_forecasts"] });
      toast.success(locked ? "Estimate unlocked" : "Estimate locked");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const minDate = phases.reduce((m, s) => {
    const d = s.planned_start_date || s.start_date;
    return d && (!m || d < m) ? d : m;
  }, "" as string);
  const maxDate = phases.reduce((m, s) => {
    const d = s.planned_end_date || s.end_date;
    return d && (!m || d > m) ? d : m;
  }, "" as string);
  const span =
    minDate && maxDate
      ? Math.max(1, (new Date(maxDate).getTime() - new Date(minDate).getTime()) / 86400000)
      : 1;

  return (
    <div>
      <PageHeading
        icon="📊"
        title="Project Forecast"
        subtitle="Phase Gantt, drag resources onto a phase with effort days, other costs, and a persisted estimate that can override FAC. Locked after kick-off unless the sponsor approves."
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
                  {p.project_code} · {p.name}
                </option>
              ))}
            </select>
          </label>
          {projectId && !forecast && (
            <Button type="button" onClick={() => ensure.mutate()} disabled={ensure.isPending}>
              Create forecast
            </Button>
          )}
          {forecast && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setLock.mutate(locked ? "draft" : "locked")}
            >
              {locked ? <Unlock className="mr-1 h-4 w-4" /> : <Lock className="mr-1 h-4 w-4" />}
              {locked ? "Unlock (sponsor)" : "Lock estimate"}
            </Button>
          )}
        </div>
      </SectionFrame>

      {!projectId ? (
        <p className="text-sm text-muted-foreground">
          Choose a project to estimate phases and cost.
        </p>
      ) : (
        <>
          <SectionFrame>
            <SectionTitle>Phase Gantt</SectionTitle>
            <div className="space-y-2">
              {phases.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No streams/phases on this project yet.
                </p>
              )}
              {phases.map((ph: any) => {
                const start = ph.planned_start_date || ph.start_date;
                const end = ph.planned_end_date || ph.end_date;
                const left =
                  start && minDate
                    ? ((new Date(start).getTime() - new Date(minDate).getTime()) /
                        86400000 /
                        span) *
                      100
                    : 0;
                const width =
                  start && end
                    ? Math.max(
                        4,
                        ((new Date(end).getTime() - new Date(start).getTime()) / 86400000 / span) *
                          100,
                      )
                    : 20;
                const phaseLabor = laborByPhase.get(ph.id) || 0;
                return (
                  <div
                    key={ph.id}
                    className="rounded-md border border-dashed border-border p-2"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const rid = e.dataTransfer.getData("text/resource-id") || dragResource;
                      if (!rid || !canEdit) return;
                      const days = Number(
                        window.prompt("Effort days for this resource on this phase?", "5") || "0",
                      );
                      if (!(days > 0)) return;
                      addResourceToPhase.mutate({ streamId: ph.id, resourceId: rid, days });
                    }}
                  >
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-semibold">{ph.name || ph.code || "Phase"}</span>
                      <span className="tabular-nums">{money(phaseLabor)}</span>
                    </div>
                    <div className="relative h-6 rounded bg-slate-100">
                      <div
                        className="absolute top-0 h-6 rounded bg-sky-500/80"
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`${start || "?"} → ${end || "?"}`}
                      />
                    </div>
                    <div className="mt-2 space-y-1">
                      {phaseRes
                        .filter((r) => r.stream_id === ph.id)
                        .map((r) => {
                          const res = (resources as any[]).find((x) => x.id === r.resource_id);
                          return (
                            <div key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="min-w-[8rem] font-medium">
                                {res?.name || "Resource"}
                              </span>
                              <input
                                type="number"
                                min={0}
                                step={0.5}
                                className="st-input !w-20 !py-0.5"
                                defaultValue={r.effort_days}
                                disabled={!canEdit}
                                onBlur={(e) =>
                                  patchEffort.mutate({
                                    id: r.id,
                                    days: Number(e.target.value) || 0,
                                    rate: Number(r.daily_rate) || 0,
                                  })
                                }
                              />
                              <span>days · {money(r.labor_cost)}</span>
                              {canEdit && (
                                <button
                                  type="button"
                                  className="text-red-600"
                                  onClick={() => removePhaseRes.mutate(r.id)}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionFrame>

          <SectionFrame>
            <SectionTitle>Resources (drag onto a phase)</SectionTitle>
            <p className="mb-2 text-xs text-muted-foreground">
              Daily rate = timesheet hourly cost × 8. Capacity shows remaining hours vs weekly
              capacity.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(resources as any[]).map((r) => {
                const cap = Number(r.capacity_hours_week || 0) * 4;
                const used = usedHours.get(r.id) || 0;
                const left = cap - used;
                return (
                  <div
                    key={r.id}
                    draggable={canEdit}
                    onDragStart={(e) => {
                      setDragResource(r.id);
                      e.dataTransfer.setData("text/resource-id", r.id);
                    }}
                    className="cursor-grab rounded-md border border-border bg-surface px-3 py-2 text-xs"
                  >
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-muted-foreground">
                      {r.role || "—"} · {money(dailyRateFromHourly(r.cost_rate))}/day
                    </div>
                    <div className={left < 0 ? "text-red-600" : "text-emerald-700"}>
                      Capacity (month guide): {Math.round(left)}h remaining of {Math.round(cap)}h
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionFrame>

          <SectionFrame>
            <div className="mb-2 flex items-center justify-between">
              <SectionTitle>Other costs</SectionTitle>
              {canEdit && (
                <Button type="button" size="sm" variant="outline" onClick={() => addOther.mutate()}>
                  <Plus className="mr-1 h-4 w-4" /> Add cost
                </Button>
              )}
            </div>
            {otherCosts.map((c) => (
              <div key={c.id} className="mb-2 flex flex-wrap items-center gap-2">
                <input
                  className="st-input min-w-[12rem]"
                  defaultValue={c.heading}
                  disabled={!canEdit}
                  onBlur={(e) => patchOther.mutate({ id: c.id, heading: e.target.value })}
                />
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
            <SectionTitle>Totals</SectionTitle>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard label="Labor" value={money(laborTotal)} />
              <KpiCard label="Other costs" value={money(otherTotal)} />
              <KpiCard label="Project forecast" value={money(grand)} accent="#1d4ed8" />
              <KpiCard
                label="Current FAC"
                value={money(Number(project?.forecast_at_completion || 0))}
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
                This project is kicked off. The estimate locks; only the sponsor (
                {project?.sponsor || "unset"}) or an admin can unlock it.
              </p>
            )}
          </SectionFrame>
        </>
      )}
    </div>
  );
}
