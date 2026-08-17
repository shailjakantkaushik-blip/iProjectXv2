import { useMemo, useState } from "react";
import { dailyRateFromHourly } from "@/lib/ops-enhancements";
import {
  countWeekdaysInclusive,
  hoursLoadChipClass,
  hoursLoadStatus,
  hoursLoadTextClass,
  resourceHoursPerDay,
  resourceHoursPerWeek,
} from "@/lib/resource-capacity";
import {
  daysToEffortAmount,
  effortAmountToDays,
  effortDaysToHours,
  forecastPhaseKey,
  type ForecastEffortUnit,
  type ForecastPhaseRow,
  type ForecastStreamLike,
} from "@/lib/project-forecast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const money = (n: number) =>
  "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0);

const UNITS: { id: ForecastEffortUnit; label: string }[] = [
  { id: "hours", label: "Hours" },
  { id: "days", label: "Days" },
  { id: "months", label: "Months" },
];

type ResourceLike = {
  id: string;
  name?: string | null;
  role?: string | null;
  cost_rate?: number | null;
  capacity_hours_week?: number | null;
  hours_per_day?: number | null;
};

type AllocationLike = {
  resource_id?: string | null;
  allocated_hours?: number | null;
};

type PhaseResLike = {
  id: string;
  resource_id?: string | null;
  stream_id?: string | null;
  phase_name?: string | null;
  forecast_phase_id?: string | null;
  effort_days?: number | null;
  daily_rate?: number | null;
  labor_cost?: number | null;
};

type PendingAssign = {
  resourceId: string;
  phase: ForecastPhaseRow;
  existingId?: string;
  existingDays?: number;
};

function weeksInWindow(start?: string | null, end?: string | null) {
  if (!start || !end) return 4;
  const a = new Date(`${start.slice(0, 10)}T00:00:00`).getTime();
  const b = new Date(`${end.slice(0, 10)}T00:00:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 4;
  const days = Math.max(1, Math.round((b - a) / 86400000) + 1);
  return Math.max(1, Math.round((days / 7) * 10) / 10);
}

export function ForecastResourceBoard({
  resources,
  allocations,
  streams,
  phases,
  phaseRes,
  canEdit,
  planStart,
  onAssign,
  onPatchEffort,
  onRemove,
}: {
  resources: ResourceLike[];
  allocations: AllocationLike[];
  streams: ForecastStreamLike[];
  phases: ForecastPhaseRow[];
  phaseRes: PhaseResLike[];
  canEdit: boolean;
  planStart?: string | null;
  onAssign: (opts: { phase: ForecastPhaseRow; resourceId: string; days: number }) => void;
  onPatchEffort: (opts: { id: string; days: number; rate: number }) => void;
  onRemove: (id: string) => void;
}) {
  const [dragResource, setDragResource] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAssign | null>(null);
  const [unit, setUnit] = useState<ForecastEffortUnit>("hours");
  const [amount, setAmount] = useState("40");
  const [roleFilter, setRoleFilter] = useState("");

  const windowEnd = useMemo(() => {
    const ends = phases.map((p) => p.end_date).filter(Boolean) as string[];
    return ends.sort().slice(-1)[0] || null;
  }, [phases]);
  const weeks = weeksInWindow(planStart, windowEnd);

  const forecastHoursByResource = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of phaseRes) {
      if (!r.resource_id) continue;
      m.set(r.resource_id, (m.get(r.resource_id) || 0) + effortDaysToHours(Number(r.effort_days || 0)));
    }
    return m;
  }, [phaseRes]);

  const allocatedHoursByResource = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of allocations) {
      if (!a.resource_id) continue;
      m.set(a.resource_id, (m.get(a.resource_id) || 0) + Number(a.allocated_hours || 0));
    }
    return m;
  }, [allocations]);

  const roleOptions = useMemo(() => {
    const named = new Set<string>();
    let untitled = false;
    for (const r of resources) {
      const role = String(r.role || "").trim();
      if (role) named.add(role);
      else untitled = true;
    }
    const list = [...named].sort((a, b) => a.localeCompare(b));
    if (untitled) list.push("__none__");
    return list;
  }, [resources]);

  const shownResources = useMemo(() => {
    if (!roleFilter) return [];
    if (roleFilter === "__none__") {
      return resources.filter((r) => !String(r.role || "").trim());
    }
    return resources.filter((r) => String(r.role || "").trim() === roleFilter);
  }, [resources, roleFilter]);

  const lanes = useMemo(() => {
    if (streams.length) return streams;
    return [{ id: "", name: "Project", is_default: true, sort_order: 0 }];
  }, [streams]);

  const phasesByStream = useMemo(() => {
    const m = new Map<string, ForecastPhaseRow[]>();
    for (const p of phases) {
      const k = p.stream_id || "";
      const list = m.get(k) || [];
      list.push(p);
      m.set(k, list);
    }
    return m;
  }, [phases]);

  const rowsForPhase = (ph: ForecastPhaseRow) =>
    phaseRes.filter((r) => {
      if (ph.id && r.forecast_phase_id === ph.id) return true;
      return r.phase_name === ph.gate_name && (r.stream_id || null) === (ph.stream_id || null);
    });

  const openAssign = (next: PendingAssign) => {
    const startDays = next.existingDays && next.existingDays > 0 ? next.existingDays : 5;
    setUnit("hours");
    setAmount(String(daysToEffortAmount(startDays, "hours") || 40));
    setPending(next);
  };

  const confirmAssign = () => {
    if (!pending) return;
    const days = effortAmountToDays(Number(amount) || 0, unit);
    if (!(days > 0)) return;
    if (pending.existingId) {
      const res = resources.find((r) => r.id === pending.resourceId);
      onPatchEffort({
        id: pending.existingId,
        days,
        rate: dailyRateFromHourly(res?.cost_rate),
      });
    } else {
      onAssign({ phase: pending.phase, resourceId: pending.resourceId, days });
    }
    setPending(null);
  };

  const dropOnPhase = (phase: ForecastPhaseRow, resourceId?: string | null) => {
    const rid = resourceId || dragResource;
    if (!rid || !canEdit) return;
    openAssign({ resourceId: rid, phase });
    setDragResource(null);
  };

  const pendingResource = resources.find((r) => r.id === pending?.resourceId);
  const pendingDays = effortAmountToDays(Number(amount) || 0, unit);
  const pendingCost = Math.round(dailyRateFromHourly(pendingResource?.cost_rate) * pendingDays);
  const pendingPhaseDays =
    countWeekdaysInclusive(pending?.phase.start_date, pending?.phase.end_date) || 5;
  const pendingDaily =
    pendingPhaseDays > 0 ? effortDaysToHours(pendingDays) / pendingPhaseDays : effortDaysToHours(pendingDays);
  const pendingDayCap = resourceHoursPerDay(pendingResource);
  const pendingPace = hoursLoadStatus(pendingDaily, pendingDayCap);

  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">
        Select a role, then drag a person onto a stream phase — or click the person, then the
        phase. Available hours are total capacity through the plan window minus hours already
        allocated or assigned here. Load is Over / Optimal / Under vs each person&apos;s
        hours/day cap (Timesheets → Resource setup; weekly = hours/day × 5).
      </p>
      <div className="overflow-x-auto">
        <div
          className="grid min-w-[640px] gap-3"
          style={{
            gridTemplateColumns: `minmax(15rem, 16.5rem) repeat(${Math.max(lanes.length, 1)}, minmax(15rem, 1fr))`,
          }}
        >
          <div className="rounded-md border border-border bg-muted/20 p-2">
            <div className="mb-2 px-1 text-sm font-semibold">Resources</div>
            <label className="mb-2 block px-1 text-[11px] text-muted-foreground">
              Role
              <select
                className="st-input mt-1 w-full"
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setDragResource(null);
                }}
              >
                <option value="">Select a role…</option>
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role === "__none__" ? "No role" : role}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-2">
              {shownResources.map((r) => {
                const weekly = resourceHoursPerWeek(r);
                const dayCap = resourceHoursPerDay(r);
                const total = Math.round(weekly * weeks);
                const used =
                  (allocatedHoursByResource.get(r.id) || 0) +
                  (forecastHoursByResource.get(r.id) || 0);
                const available = Math.round((total - used) * 10) / 10;
                const status = hoursLoadStatus(used, total);
                const tone = hoursLoadTextClass(status);
                return (
                  <button
                    key={r.id}
                    type="button"
                    draggable={canEdit}
                    onDragStart={(e) => {
                      setDragResource(r.id);
                      e.dataTransfer.setData("text/resource-id", r.id);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onDragEnd={() => setDragResource(null)}
                    onClick={() => {
                      if (!canEdit) return;
                      setDragResource((cur) => (cur === r.id ? null : r.id));
                    }}
                    className={`w-full rounded-md border border-border bg-background px-3 py-2 text-left text-xs ${
                      canEdit ? "cursor-grab active:cursor-grabbing" : ""
                    } ${dragResource === r.id ? "ring-2 ring-primary/40" : ""}`}
                  >
                    <div className="font-semibold text-foreground">{r.name || "Resource"}</div>
                    <div className="text-muted-foreground">
                      {r.role || "—"} · {money(dailyRateFromHourly(r.cost_rate))}/day · {dayCap}h/day
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${hoursLoadChipClass(status)}`}
                      >
                        {status}
                      </span>
                      <span className={`tabular-nums ${tone}`}>Available {available}h</span>
                    </div>
                    <div className="tabular-nums text-muted-foreground">
                      Total {total}h through plan
                    </div>
                  </button>
                );
              })}
              {shownResources.length === 0 && (
                <p className="px-1 text-xs text-muted-foreground">
                  {!roleFilter
                    ? "Select a role to see people you can assign."
                    : "No active resources in this role."}
                </p>
              )}
            </div>
          </div>

          {lanes.map((stream) => {
            const streamPhases = phasesByStream.get(stream.id || "") || [];
            return (
              <div key={stream.id || "proj"} className="rounded-md border border-border bg-muted/10 p-2">
                <div className="mb-2 px-1 text-sm font-semibold">{stream.name || "Stream"}</div>
                <div className="space-y-2">
                  {streamPhases.map((ph) => {
                    const rows = rowsForPhase(ph);
                    return (
                      <div
                        key={forecastPhaseKey(ph)}
                        onDragOver={(e) => {
                          if (!canEdit) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "copy";
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          dropOnPhase(ph, e.dataTransfer.getData("text/resource-id"));
                        }}
                        onClick={() => {
                          if (dragResource) dropOnPhase(ph, dragResource);
                        }}
                        className="rounded-md border border-dashed border-border bg-background p-2"
                      >
                        <div className="text-xs font-semibold">{ph.gate_name}</div>
                        <div className="mb-2 text-[11px] text-muted-foreground">
                          {ph.start_date || "—"} → {ph.end_date || "—"}
                        </div>
                        <div className="space-y-1">
                          {rows.map((row) => {
                            const res = resources.find((x) => x.id === row.resource_id);
                            const phaseDays =
                              countWeekdaysInclusive(ph.start_date, ph.end_date) || 5;
                            const assignedH = effortDaysToHours(Number(row.effort_days || 0));
                            const daily = phaseDays > 0 ? assignedH / phaseDays : assignedH;
                            const cap = resourceHoursPerDay(res);
                            const pace = hoursLoadStatus(daily, cap);
                            return (
                              <div
                                key={row.id}
                                className="flex items-start justify-between gap-2 rounded bg-muted/40 px-2 py-1 text-xs"
                              >
                                <div>
                                  <div className="font-medium">{res?.name || "Resource"}</div>
                                  <div className="text-muted-foreground">
                                    {assignedH}h · {money(Number(row.labor_cost || 0))}
                                  </div>
                                  <span
                                    className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${hoursLoadChipClass(pace)}`}
                                    title={`${daily.toFixed(1)}h/day over ${phaseDays} weekdays vs ${cap}h/day cap`}
                                  >
                                    {pace} {daily.toFixed(1)}/{cap}h/day
                                  </span>
                                </div>
                                {canEdit && (
                                  <div className="flex shrink-0 gap-2">
                                    <button
                                      type="button"
                                      className="text-primary"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openAssign({
                                          resourceId: row.resource_id || "",
                                          phase: ph,
                                          existingId: row.id,
                                          existingDays: Number(row.effort_days || 0),
                                        });
                                      }}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      className="text-red-600"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onRemove(row.id);
                                      }}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {rows.length === 0 && (
                            <p className="text-[11px] text-muted-foreground">
                              {canEdit ? "Drop a resource here" : "No resources yet"}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {streamPhases.length === 0 && (
                    <p className="px-1 text-xs text-muted-foreground">No phases on this stream.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign effort</DialogTitle>
            <DialogDescription>
              {pendingResource?.name || "Resource"} on {pending?.phase.stream_name || "stream"} ·{" "}
              {pending?.phase.gate_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {UNITS.map((u) => (
                <Button
                  key={u.id}
                  type="button"
                  size="sm"
                  variant={unit === u.id ? "default" : "outline"}
                  onClick={() => {
                    const days = effortAmountToDays(Number(amount) || 0, unit);
                    setUnit(u.id);
                    setAmount(String(daysToEffortAmount(days, u.id) || ""));
                  }}
                >
                  {u.label}
                </Button>
              ))}
            </div>
            <label className="block text-sm">
              Effort ({unit})
              <input
                type="number"
                min={0}
                step={unit === "months" ? 0.1 : 1}
                className="st-input mt-1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </label>
            <p className="text-xs text-muted-foreground">
              {effortDaysToHours(pendingDays)} hours · {pendingDays} days · {money(pendingCost)}{" "}
              labor
            </p>
            <p
              className={`text-xs font-medium ${hoursLoadTextClass(pendingPace)}`}
            >
              {pendingPace} vs {pendingDayCap}h/day ({pendingDaily.toFixed(1)}h/day over{" "}
              {pendingPhaseDays} weekdays in this phase).
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={!(pendingDays > 0)} onClick={confirmAssign}>
              Save assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
