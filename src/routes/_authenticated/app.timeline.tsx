import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Zap, Minus, Plus, Filter, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";
import { PortfolioTimeline } from "@/components/portfolio-timeline";
import { toast } from "sonner";
import {
  groupGatesByProject,
  resolveCurrentStage,
} from "@/lib/project-phase";
import {
  expandProjectsToTimelineLanes,
  fetchOrgStreams,
} from "@/lib/project-streams";

export const Route = createFileRoute("/_authenticated/app/timeline")({
  component: TimelinePage,
});

type ApplyTo = "planned" | "actual" | "both";

function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v && v.trim() !== ""))).sort();
}

function shiftISO(date: string | null, days: number): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fyLabel(d: Date, fyStartMonth: number = 4) {
  const y = d.getFullYear();
  const startYear = d.getMonth() >= (fyStartMonth - 1) ? y : y - 1;
  return `FY${String(startYear + 1).slice(-2)}`;
}

function TimelinePage() {
  const { organization } = useAuth();
  const qc = useQueryClient();

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").order("start_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organization,
  });

  const { data: gates = [] } = useQuery({
    queryKey: ["stage_gates", organization?.id],
    queryFn: async () => (await supabase.from("stage_gates").select("*")).data ?? [],
    enabled: !!organization,
  });

  const { data: streams = [] } = useQuery({
    queryKey: ["project_streams", organization?.id],
    queryFn: () => fetchOrgStreams(organization!.id),
    enabled: !!organization?.id,
  });

  const { data: gateDefs = [] } = useQuery({
    queryKey: ["stage_gate_definitions", organization?.id],
    queryFn: async () =>
      (
        await supabase
          .from("stage_gate_definitions")
          .select("gate_name")
          .eq("org_id", organization!.id)
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
      ).data ?? [],
    enabled: !!organization,
  });

  const orgPhases = useMemo(
    () => (gateDefs as any[]).map((d) => d.gate_name).filter(Boolean),
    [gateDefs],
  );
  const gatesByProject = useMemo(() => groupGatesByProject(gates as any[]), [gates]);
  const projectPhase = (p: any) =>
    resolveCurrentStage(p, gatesByProject.get(p.id) || [], orgPhases);

  // ---------- Filters ----------
  const programs = useMemo(() => uniqueSorted(projects.map((p: any) => p.program)), [projects]);
  const sponsors = useMemo(() => uniqueSorted(projects.map((p: any) => p.sponsor)), [projects]);
  const phases = useMemo(
    () => uniqueSorted(projects.map((p: any) => projectPhase(p))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projects, gatesByProject, orgPhases],
  );

  const fyStartMonth = organization?.fy_start_month || 4;
  // FY options derived from planned/actual dates
  const fyOptions = useMemo(() => {
    const s = new Set<string>();
    projects.forEach((p: any) => {
      [p.planned_start_date, p.planned_end_date, p.actual_start_date, p.actual_end_date, p.start_date, p.end_date]
        .filter(Boolean)
        .forEach((d: string) => s.add(fyLabel(new Date(d), fyStartMonth)));
    });
    return Array.from(s).sort();
  }, [projects, fyStartMonth]);

  const [fFy, setFFy] = useState("All");
  const [fProgram, setFProgram] = useState("All");
  const [fSponsor, setFSponsor] = useState("All");
  const [fPhase, setFPhase] = useState("All");
  const [fRag, setFRag] = useState("All");
  const [fPriority, setFPriority] = useState("All");
  const [fMethod, setFMethod] = useState("All");
  const [fSchedule, setFSchedule] = useState("All"); // On Track | Delayed | Ahead
  const [fSearch, setFSearch] = useState("");
  const [fPids, setFPids] = useState<string[]>([]);   // multi-select of project ids
  const [pidsOpen, setPidsOpen] = useState(false);
  const [pidsSearch, setPidsSearch] = useState("");
  const [showGates, setShowGates] = useState(true);

  const scheduleStatus = (p: any): "On Track" | "Delayed" | "Ahead" => {
    const pE = p.planned_end_date ? new Date(p.planned_end_date).getTime() : (p.end_date ? new Date(p.end_date).getTime() : null);
    const aE = p.actual_end_date ? new Date(p.actual_end_date).getTime() : (p.end_date ? new Date(p.end_date).getTime() : null);
    if (!pE || !aE) return "On Track";
    const slip = Math.round((aE - pE) / 86400000);
    if (slip > 3) return "Delayed";
    if (slip < -3) return "Ahead";
    return "On Track";
  };

  const filtered = useMemo(() => {
    const q = fSearch.trim().toLowerCase();
    const pidSet = new Set(fPids);
    return projects.filter((p: any) => {
      if (pidSet.size > 0 && !pidSet.has(p.id)) return false;
      if (fProgram !== "All" && (p.program || "") !== fProgram) return false;
      if (fSponsor !== "All" && (p.sponsor || "") !== fSponsor) return false;
      if (fPhase !== "All" && (projectPhase(p) || "") !== fPhase) return false;
      if (fRag !== "All" && (p.rag || "") !== fRag) return false;
      if (fPriority !== "All" && (p.priority || "") !== fPriority) return false;
      if (fMethod !== "All" && (p.delivery_method || "") !== fMethod) return false;
      if (fSchedule !== "All" && scheduleStatus(p) !== fSchedule) return false;
      if (q && !(`${p.name || ""} ${p.project_code || ""}`.toLowerCase().includes(q))) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, fPids, fProgram, fSponsor, fPhase, fRag, fPriority, fMethod, fSchedule, fSearch, gatesByProject, orgPhases]);

  const resetFilters = () => {
    setFFy("All"); setFProgram("All"); setFSponsor("All"); setFPhase("All");
    setFRag("All"); setFPriority("All"); setFMethod("All"); setFSchedule("All"); setFSearch("");
    setFPids([]); setPidsSearch("");
  };

  // ---------- Combined planned + actual dataset (stream lanes when enabled) ----------
  const combinedProjects = useMemo(() => {
    const base = filtered.map((p: any) => ({
      ...p,
      start_date: p.planned_start_date || p.actual_start_date || p.start_date,
      end_date: p.actual_end_date || p.planned_end_date || p.end_date,
    }));
    const lanes = expandProjectsToTimelineLanes(base, streams as any[], {
      gates: gates as any[],
      resolvePhase: (p, streamGates) => resolveCurrentStage(p, streamGates, orgPhases),
    }).map((lane: any) => ({
      ...lane,
      start_date: lane.planned_start_date || lane.actual_start_date || lane.start_date,
      end_date: lane.actual_end_date || lane.planned_end_date || lane.end_date,
    }));
    return lanes.filter((p: any) => p.start_date && p.end_date);
  }, [filtered, streams, gates, orgPhases]);

  // ---------- Quick shift ----------
  const [shiftPid, setShiftPid] = useState<string>("");
  const [shiftStreamId, setShiftStreamId] = useState<string>("");
  const [shiftDays, setShiftDays] = useState<number>(7);
  const [shiftApply, setShiftApply] = useState<ApplyTo>("both");
  const [shifting, setShifting] = useState(false);

  const shiftProject = useMemo(
    () => projects.find((p: any) => p.id === shiftPid) as any,
    [projects, shiftPid],
  );
  const shiftProjectStreams = useMemo(
    () => (streams as any[]).filter((s) => s.project_id === shiftPid),
    [streams, shiftPid],
  );

  const applyShift = async () => {
    if (!shiftPid) { toast.error("Pick a project"); return; }
    const proj = projects.find((p: any) => p.id === shiftPid);
    if (!proj) return;

    const buildPatch = (row: any) => {
      const patch: Record<string, any> = {};
      if (shiftApply === "planned" || shiftApply === "both") {
        patch.planned_start_date = shiftISO(row.planned_start_date || row.start_date, shiftDays);
        patch.planned_end_date = shiftISO(row.planned_end_date || row.end_date, shiftDays);
      }
      if (shiftApply === "actual" || shiftApply === "both") {
        patch.actual_start_date = shiftISO(row.actual_start_date || row.start_date, shiftDays);
        patch.actual_end_date = shiftISO(row.actual_end_date || row.end_date, shiftDays);
      }
      return patch;
    };

    setShifting(true);
    try {
      if (proj.streams_enabled && shiftProjectStreams.length > 0) {
        const targets = shiftStreamId
          ? shiftProjectStreams.filter((s) => s.id === shiftStreamId)
          : shiftProjectStreams;
        if (targets.length === 0) {
          toast.error("Pick a stream");
          return;
        }
        for (const s of targets) {
          const { error } = await supabase.from("project_streams").update(buildPatch(s) as any).eq("id", s.id);
          if (error) throw error;
        }
        toast.success(
          `Shifted ${targets.length} stream${targets.length > 1 ? "s" : ""} on ${proj.project_code || proj.name} by ${shiftDays > 0 ? "+" : ""}${shiftDays} day(s)`,
        );
        qc.invalidateQueries({ queryKey: ["project_streams"] });
        qc.invalidateQueries({ queryKey: ["projects"] });
      } else {
        const patch = buildPatch(proj);
        if (shiftApply === "actual" || shiftApply === "both") {
          patch.start_date = patch.actual_start_date;
          patch.end_date = patch.actual_end_date;
        }
        const { error } = await supabase.from("projects").update(patch as any).eq("id", shiftPid);
        if (error) throw error;
        toast.success(`Shifted ${proj.project_code || proj.name} by ${shiftDays > 0 ? "+" : ""}${shiftDays} day(s)`);
        qc.invalidateQueries({ queryKey: ["projects"] });
      }
    } catch (e: any) {
      toast.error(e.message || "Shift failed");
    } finally {
      setShifting(false);
    }
  };

  // ---------- Render ----------
  const Select = ({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) => (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-input bg-background px-2 py-1.5 text-sm">
        <option value="All">All</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );

  const projectOptions = useMemo(() => {
    const q = pidsSearch.trim().toLowerCase();
    return projects
      .map((p: any) => ({ id: p.id, code: p.project_code || "", name: p.name || "" }))
      .filter((p) => !q || `${p.code} ${p.name}`.toLowerCase().includes(q))
      .sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name));
  }, [projects, pidsSearch]);

  const togglePid = (id: string) => {
    setFPids((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  return (
    <div>
      <PageHeading icon="🗓️">Portfolio Timeline</PageHeading>
      <div className="text-sm text-muted-foreground mb-4">
        Planned vs actual side-by-side per project (or per stream when streams are enabled), financial context,
        stage-gate diamonds, and quick date-shift.
      </div>

      {/* Filters bar */}
      <SectionFrame>
        <div className="mb-2 flex items-center justify-between pr-10">
          <SectionTitle>
            <span className="inline-flex items-center gap-2"><Filter className="h-4 w-4" /> Filters</span>
          </SectionTitle>
          <button onClick={resetFilters}
            className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-muted">
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-9">
          <Select label="Financial Year" value={fFy} onChange={setFFy} options={fyOptions} />
          <Select label="Program" value={fProgram} onChange={setFProgram} options={programs} />
          <Select label="Sponsor" value={fSponsor} onChange={setFSponsor} options={sponsors} />
          <Select label="Phase" value={fPhase} onChange={setFPhase} options={phases} />
          <Select label="RAG" value={fRag} onChange={setFRag} options={["Green", "Amber", "Red"]} />
          <Select label="Priority" value={fPriority} onChange={setFPriority} options={["Critical", "High", "Medium", "Low"]} />
          <Select label="Delivery" value={fMethod} onChange={setFMethod} options={["Waterfall", "Agile", "Hybrid"]} />
          <Select label="Schedule" value={fSchedule} onChange={setFSchedule} options={["On Track", "Delayed", "Ahead"]} />
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Search</span>
            <input value={fSearch} onChange={(e) => setFSearch(e.target.value)} placeholder="Name or code…"
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
          </label>
        </div>

        {/* Project multi-select */}
        <div className="mt-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Projects</div>
          <div className="relative">
            <button type="button" onClick={() => setPidsOpen((o) => !o)}
              className="flex w-full items-center justify-between rounded-md border border-input bg-background px-2 py-1.5 text-left text-sm hover:bg-muted">
              <span className="truncate">
                {fPids.length === 0 ? "All projects" : `${fPids.length} project${fPids.length > 1 ? "s" : ""} selected`}
              </span>
              <span className="text-xs text-muted-foreground">{pidsOpen ? "▲" : "▼"}</span>
            </button>
            {pidsOpen && (
              <div className="absolute z-30 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
                <div className="flex items-center gap-2 border-b border-border p-2">
                  <input value={pidsSearch} onChange={(e) => setPidsSearch(e.target.value)}
                    placeholder="Search projects…"
                    className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs" />
                  <button onClick={() => setFPids(projectOptions.map((p) => p.id))}
                    className="rounded border border-input bg-background px-2 py-1 text-[11px] hover:bg-muted">All</button>
                  <button onClick={() => setFPids([])}
                    className="rounded border border-input bg-background px-2 py-1 text-[11px] hover:bg-muted">None</button>
                </div>
                <div className="max-h-60 overflow-y-auto p-1">
                  {projectOptions.length === 0 && (
                    <div className="py-3 text-center text-xs text-muted-foreground">No matches</div>
                  )}
                  {projectOptions.map((p) => (
                    <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted">
                      <input type="checkbox" checked={fPids.includes(p.id)} onChange={() => togglePid(p.id)} />
                      <span className="font-mono text-[11px] text-muted-foreground">{p.code || "—"}</span>
                      <span className="truncate text-foreground">{p.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>
            Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {projects.length} projects
            {" · "}
            <span className="font-semibold text-foreground">{combinedProjects.length}</span> timeline lanes
          </span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded-sm bg-sky-500" /> Planned</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded-sm bg-emerald-500" /> Actual (RAG-coloured)</span>
          <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 text-foreground hover:bg-muted">
            <input type="checkbox" checked={showGates} onChange={(e) => setShowGates(e.target.checked)} />
            Show stage gates
          </label>
        </div>
      </SectionFrame>

      {/* Planned vs Actual timeline (per project, side by side) */}
      <SectionFrame>
        <PortfolioTimeline
          projects={combinedProjects}
          gates={gates}
          fy={fFy}
          title="Planned vs Actual Timeline"
          showPlannedVsActual
          showGates={showGates}
          expandToolbar={
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted">
              <input type="checkbox" checked={showGates} onChange={(e) => setShowGates(e.target.checked)} />
              Show stage gates
            </label>
          }
        />
      </SectionFrame>

      {/* Quick shift */}
      <SectionFrame>
        <div className="mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          <SectionTitle>Quick shift project / stream dates</SectionTitle>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Project</span>
            <select
              value={shiftPid}
              onChange={(e) => {
                setShiftPid(e.target.value);
                setShiftStreamId("");
              }}
              className="rounded-md border border-input bg-background px-2 py-2 text-sm"
            >
              <option value="">Select project…</option>
              {projects.map((p: any) => (
                <option key={p.id} value={p.id}>{p.project_code ? `${p.project_code} · ` : ""}{p.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Stream</span>
            <select
              value={shiftStreamId}
              onChange={(e) => setShiftStreamId(e.target.value)}
              disabled={!shiftProject?.streams_enabled || shiftProjectStreams.length === 0}
              className="rounded-md border border-input bg-background px-2 py-2 text-sm disabled:opacity-50"
            >
              <option value="">
                {shiftProject?.streams_enabled ? "All streams" : "N/A (streams off)"}
              </option>
              {shiftProjectStreams.map((s: any) => (
                <option key={s.id} value={s.id}>{s.code ? `${s.code} · ` : ""}{s.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Shift by (days)</span>
            <div className="flex items-stretch rounded-md border border-input bg-background">
              <input type="number" value={shiftDays}
                onChange={(e) => setShiftDays(parseInt(e.target.value || "0", 10) || 0)}
                className="w-full bg-transparent px-2 py-2 text-sm outline-none" />
              <button type="button" onClick={() => setShiftDays((d) => d - 1)}
                className="border-l border-input px-2 hover:bg-muted" aria-label="Decrease">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => setShiftDays((d) => d + 1)}
                className="border-l border-input px-2 hover:bg-muted" aria-label="Increase">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Apply to</span>
            <select value={shiftApply} onChange={(e) => setShiftApply(e.target.value as ApplyTo)}
              className="rounded-md border border-input bg-background px-2 py-2 text-sm">
              <option value="both">Both</option>
              <option value="planned">Planned only</option>
              <option value="actual">Actual only</option>
            </select>
          </label>
          <button onClick={applyShift} disabled={shifting || !shiftPid}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">
            {shifting ? "Applying…" : "Apply shift"}
          </button>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Positive days push dates forward (slippage); negative days pull them earlier.
          When streams are enabled, shifts apply to stream dates (project rollup updates automatically).
        </div>
      </SectionFrame>
    </div>
  );
}
