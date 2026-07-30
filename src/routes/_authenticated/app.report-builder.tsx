import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import { PROJECT_PORTFOLIO_SELECT } from "@/lib/project-selects";
import { computeProjectEvm, formatIndex } from "@/lib/evm";
import {
  projectApprovedFunding,
  projectIncurred,
  projectTargetRoi,
} from "@/lib/project-finance";

export const Route = createFileRoute("/_authenticated/app/report-builder")({
  component: ReportBuilderPage,
});

const METRICS = [
  { id: "count", label: "Project count" },
  { id: "budget", label: "Approved funding" },
  { id: "incurred", label: "Incurred (AC)" },
  { id: "bac", label: "BAC (baseline)" },
  { id: "ev", label: "Earned value (EV)" },
  { id: "pv", label: "Planned value (PV)" },
  { id: "spi", label: "SPI" },
  { id: "cpi", label: "CPI" },
  { id: "roi", label: "Target ROI %" },
  { id: "rag_red", label: "RAG Red count" },
  { id: "rag_amber", label: "RAG Amber count" },
  { id: "rag_green", label: "RAG Green count" },
] as const;

type MetricId = (typeof METRICS)[number]["id"];

const money = (n: number) =>
  "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0);

function ReportBuilderPage() {
  const { organization, session } = useAuth();
  const orgId = organization?.id;
  const userId = session?.user?.id;
  const qc = useQueryClient();

  const [name, setName] = useState("Portfolio snapshot");
  const [selected, setSelected] = useState<MetricId[]>([
    "count",
    "budget",
    "incurred",
    "spi",
    "cpi",
    "rag_red",
  ]);
  const [portfolioF, setPortfolioF] = useState("All");
  const [statusF, setStatusF] = useState("All");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", orgId, "report-builder"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select(
          `${PROJECT_PORTFOLIO_SELECT},baseline_budget,baseline_capex,baseline_opex,baseline_date,baseline_label` as "*",
        );
      if (error) {
        const fb = await supabase.from("projects").select(PROJECT_PORTFOLIO_SELECT as "*");
        if (fb.error) throw fb.error;
        return fb.data ?? [];
      }
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const { data: workItems = [] } = useQuery({
    queryKey: ["work_items", orgId, "report-builder"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_items" as any)
        .select("project_id,percent_complete,estimate_hours,status");
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!orgId,
  });

  const { data: saved = [] } = useQuery({
    queryKey: ["custom_reports", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_reports" as any)
        .select("id,name,description,config,updated_at")
        .eq("org_id", orgId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!orgId,
  });

  const wiByProject = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const w of workItems) {
      const list = m.get(w.project_id) || [];
      list.push(w);
      m.set(w.project_id, list);
    }
    return m;
  }, [workItems]);

  const filtered = useMemo(() => {
    return (projects as any[]).filter((p) => {
      if (portfolioF !== "All" && p.portfolio !== portfolioF) return false;
      if (statusF !== "All" && p.status !== statusF) return false;
      return true;
    });
  }, [projects, portfolioF, statusF]);

  const values = useMemo(() => {
    let budget = 0;
    let incurred = 0;
    let bac = 0;
    let ev = 0;
    let pv = 0;
    let roiSum = 0;
    let roiN = 0;
    let red = 0;
    let amber = 0;
    let green = 0;
    let spiW = 0;
    let spiN = 0;
    let cpiW = 0;
    let cpiN = 0;

    for (const p of filtered) {
      budget += projectApprovedFunding(p);
      incurred += projectIncurred(p);
      const m = computeProjectEvm({
        project: p,
        workItems: wiByProject.get(p.id) || [],
      });
      bac += m.bac;
      ev += m.ev;
      pv += m.pv;
      if (m.spi != null) {
        spiW += m.spi;
        spiN += 1;
      }
      if (m.cpi != null) {
        cpiW += m.cpi;
        cpiN += 1;
      }
      const roi = projectTargetRoi(p);
      if (roi != null && Number.isFinite(roi)) {
        roiSum += roi;
        roiN += 1;
      }
      const rag = String(p.rag || "");
      if (rag === "Red") red += 1;
      else if (rag === "Amber") amber += 1;
      else if (rag === "Green") green += 1;
    }

    const map: Record<MetricId, string | number> = {
      count: filtered.length,
      budget: money(budget),
      incurred: money(incurred),
      bac: money(bac),
      ev: money(ev),
      pv: money(pv),
      spi: formatIndex(spiN ? spiW / spiN : null),
      cpi: formatIndex(cpiN ? cpiW / cpiN : null),
      roi: roiN ? `${(roiSum / roiN).toFixed(1)}%` : "—",
      rag_red: red,
      rag_amber: amber,
      rag_green: green,
    };
    return map;
  }, [filtered, wiByProject]);

  const portfolios = useMemo(() => {
    const s = new Set<string>();
    for (const p of projects as any[]) if (p.portfolio) s.add(p.portfolio);
    return ["All", ...[...s].sort()];
  }, [projects]);

  const statuses = useMemo(() => {
    const s = new Set<string>();
    for (const p of projects as any[]) if (p.status) s.add(p.status);
    return ["All", ...[...s].sort()];
  }, [projects]);

  const toggle = (id: MetricId) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No org");
      const config = {
        metrics: selected,
        portfolio: portfolioF,
        status: statusF,
      };
      const { error } = await supabase.from("custom_reports" as any).insert({
        org_id: orgId,
        name: name.trim() || "Untitled report",
        description: "Custom report builder snapshot",
        config,
        created_by: userId || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom_reports", orgId] });
      toast.success("Report definition saved");
    },
    onError: (e: Error) => {
      if (/custom_reports|schema cache|does not exist/i.test(e.message)) {
        toast.error("Run ppm_platform_depth.sql in Supabase, then Reload schema");
      } else toast.error(e.message);
    },
  });

  const loadSaved = (row: any) => {
    const cfg = row.config || {};
    setName(row.name || "Report");
    if (Array.isArray(cfg.metrics)) setSelected(cfg.metrics);
    if (cfg.portfolio) setPortfolioF(cfg.portfolio);
    if (cfg.status) setStatusF(cfg.status);
    toast.message(`Loaded “${row.name}”`);
  };

  return (
    <PageExport name="Custom_Report" title={name || "Custom Report"}>
      <PageHeading
        title="Report builder"
        subtitle="Pick metrics and filters, preview live KPIs, save definitions, then use Print / PDF from the page export bar"
      />

      <SectionFrame>
        <SectionTitle>Definition</SectionTitle>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <input
            className="st-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Report name"
          />
          <select className="st-input" value={portfolioF} onChange={(e) => setPortfolioF(e.target.value)}>
            {portfolios.map((p) => (
              <option key={p} value={p}>
                Portfolio: {p}
              </option>
            ))}
          </select>
          <select className="st-input" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
            {statuses.map((s) => (
              <option key={s} value={s}>
                Status: {s}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {METRICS.map((m) => {
            const on = selected.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
                  on
                    ? "border-sky-300 bg-sky-50 text-sky-800"
                    : "border-border bg-surface text-muted-foreground"
                }`}
                onClick={() => toggle(m.id)}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="st-btn-primary"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save report definition"}
          </button>
          <button type="button" className="st-btn-secondary" onClick={() => window.print()}>
            Print / PDF
          </button>
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Preview — {name}</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {selected.map((id) => {
            const meta = METRICS.find((m) => m.id === id)!;
            return <KpiCard key={id} label={meta.label} value={values[id]} />;
          })}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Scope: {filtered.length} of {(projects as any[]).length} projects
          {portfolioF !== "All" ? ` · ${portfolioF}` : ""}
          {statusF !== "All" ? ` · ${statusF}` : ""}
        </p>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Saved definitions</SectionTitle>
        {saved.length === 0 ? (
          <p className="text-sm text-muted-foreground">No saved reports yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {saved.map((r: any) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
              >
                <div>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Updated {r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}
                  </div>
                </div>
                <button type="button" className="text-xs text-sky-700 hover:underline" onClick={() => loadSaved(r)}>
                  Load
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionFrame>
    </PageExport>
  );
}
