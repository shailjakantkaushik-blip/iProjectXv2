import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard, RagChip } from "@/components/streamlit";
import { exportProjects } from "@/lib/excel";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, FileText } from "lucide-react";
import { PageLoading } from "@/components/page-loading";

export const Route = createFileRoute("/_authenticated/app/executive-reports")({
  component: ExecutiveReportsPage,
});

const fmtM = (n: number) => `$${(n / 1e6).toFixed(2)}M`;
const fmt$ = (n: number) =>
  "$" + new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);
const num = (v: unknown) => Number(v || 0);
const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

function EmptyRow({ colSpan, label = "No data yet." }: { colSpan: number; label?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-8 text-center text-sm text-muted-foreground">
        {label}
      </td>
    </tr>
  );
}

function ExecutiveReportsPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;

  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ["projects", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const { data: risks = [], isLoading: loadingRisks } = useQuery({
    queryKey: ["risks", orgId],
    queryFn: async () =>
      (await supabase.from("risks").select("*").order("severity", { ascending: false })).data ?? [],
    enabled: !!orgId,
  });

  const { data: actions = [], isLoading: loadingActions } = useQuery({
    queryKey: ["actions", orgId],
    queryFn: async () =>
      (await supabase.from("actions").select("*").order("due_date")).data ?? [],
    enabled: !!orgId,
  });

  const { data: benefits = [], isLoading: loadingBenefits } = useQuery({
    queryKey: ["benefits", orgId],
    queryFn: async () => (await supabase.from("benefits").select("*")).data ?? [],
    enabled: !!orgId,
  });

  const { data: gates = [], isLoading: loadingGates } = useQuery({
    queryKey: ["stage_gates", orgId],
    queryFn: async () =>
      (await supabase.from("stage_gates").select("*").order("planned_date")).data ?? [],
    enabled: !!orgId,
  });

  const { data: milestones = [], isLoading: loadingMilestones } = useQuery({
    queryKey: ["milestones", orgId],
    queryFn: async () =>
      (await supabase.from("milestones").select("*").order("planned_date")).data ?? [],
    enabled: !!orgId,
  });

  const { data: businessUnits = [] } = useQuery({
    queryKey: ["business_units", orgId],
    queryFn: async () =>
      (await supabase.from("business_units").select("id,name,code").order("name")).data ?? [],
    enabled: !!orgId,
  });

  const projectById = useMemo(
    () => new Map(projects.map((p: any) => [p.id, p])),
    [projects],
  );

  const buNameById = useMemo(
    () => new Map(businessUnits.map((b: any) => [b.id, b.name || b.code || "Unassigned"])),
    [businessUnits],
  );

  const total = projects.length;
  const budget = projects.reduce((s: number, p: any) => s + num(p.budget), 0);
  const capexApproved = projects.reduce((s: number, p: any) => s + num(p.capex_approved), 0);
  const capexIncurred = projects.reduce((s: number, p: any) => s + num(p.capex_incurred), 0);
  const opexApproved = projects.reduce((s: number, p: any) => s + num(p.opex_approved), 0);
  const opexIncurred = projects.reduce((s: number, p: any) => s + num(p.opex_incurred), 0);
  const incurred = capexIncurred + opexIncurred;
  const red = projects.filter((p: any) => p.rag === "Red").length;
  const amber = projects.filter((p: any) => p.rag === "Amber").length;
  const green = projects.filter((p: any) => p.rag === "Green").length;

  const benefitsTarget =
    benefits.reduce((s: number, b: any) => s + num(b.target_value), 0) ||
    projects.reduce((s: number, p: any) => s + num(p.benefits_target), 0);
  const benefitsRealised =
    benefits.reduce((s: number, b: any) => s + num(b.realised_value), 0) ||
    projects.reduce((s: number, p: any) => s + num(p.benefits_realised), 0);

  const openRisks = risks.filter((r: any) => {
    const s = String(r.status || "").toLowerCase();
    return s !== "closed" && s !== "mitigated" && s !== "accepted";
  });
  const topRisks = [...openRisks]
    .sort((a: any, b: any) => num(b.severity) - num(a.severity))
    .slice(0, 25);

  const openActions = actions.filter((a: any) => {
    const s = String(a.status || "").toLowerCase();
    return s !== "closed" && s !== "done" && s !== "completed";
  });
  const overdueActions = openActions.filter(
    (a: any) => a.due_date && new Date(a.due_date) < today(),
  );

  const now = today();
  const gateStats = {
    total: gates.length,
    approved: gates.filter((g: any) => String(g.status || "").toLowerCase() === "approved").length,
    pending: gates.filter((g: any) => {
      const s = String(g.status || "pending").toLowerCase();
      return s === "pending" || s === "in review" || s === "in progress";
    }).length,
    overdue: gates.filter((g: any) => {
      const s = String(g.status || "").toLowerCase();
      return (
        g.planned_date &&
        new Date(g.planned_date) < now &&
        s !== "approved" &&
        s !== "rejected"
      );
    }).length,
  };

  const milestoneStats = {
    total: milestones.length,
    complete: milestones.filter((m: any) => {
      const s = String(m.status || "").toLowerCase();
      return s === "complete" || s === "completed" || s === "done" || !!m.actual_date;
    }).length,
    overdue: milestones.filter((m: any) => {
      const s = String(m.status || "").toLowerCase();
      const done = s === "complete" || s === "completed" || s === "done" || !!m.actual_date;
      return m.planned_date && new Date(m.planned_date) < now && !done;
    }).length,
  };

  const programRollup = useMemo(() => {
    const m = new Map<string, any>();
    projects.forEach((p: any) => {
      const key = p.program || "Unassigned";
      const cur = m.get(key) || {
        name: key,
        count: 0,
        budget: 0,
        incurred: 0,
        benefits: 0,
        green: 0,
        amber: 0,
        red: 0,
      };
      cur.count += 1;
      cur.budget += num(p.budget);
      cur.incurred += num(p.capex_incurred) + num(p.opex_incurred);
      cur.benefits += num(p.benefits_realised);
      if (p.rag === "Green") cur.green++;
      else if (p.rag === "Amber") cur.amber++;
      else if (p.rag === "Red") cur.red++;
      m.set(key, cur);
    });
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [projects]);

  const buRollup = useMemo(() => {
    const m = new Map<string, any>();
    projects.forEach((p: any) => {
      const key = (p.bu_id && buNameById.get(p.bu_id)) || "Unassigned";
      const cur = m.get(key) || {
        name: key,
        count: 0,
        budget: 0,
        incurred: 0,
        green: 0,
        amber: 0,
        red: 0,
      };
      cur.count += 1;
      cur.budget += num(p.budget);
      cur.incurred += num(p.capex_incurred) + num(p.opex_incurred);
      if (p.rag === "Green") cur.green++;
      else if (p.rag === "Amber") cur.amber++;
      else if (p.rag === "Red") cur.red++;
      m.set(key, cur);
    });
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, buNameById]);

  const ragProjects = useMemo(
    () =>
      [...projects].sort((a: any, b: any) => {
        const rank = (r: string) => (r === "Red" ? 0 : r === "Amber" ? 1 : r === "Green" ? 2 : 3);
        return rank(a.rag) - rank(b.rag) || String(a.name).localeCompare(String(b.name));
      }),
    [projects],
  );

  const financeRows = useMemo(
    () =>
      [...projects]
        .map((p: any) => ({
          id: p.id,
          name: p.name,
          program: p.program || "—",
          budget: num(p.budget),
          capexApproved: num(p.capex_approved),
          capexIncurred: num(p.capex_incurred),
          opexApproved: num(p.opex_approved),
          opexIncurred: num(p.opex_incurred),
          remaining: Math.max(
            0,
            num(p.capex_approved) +
              num(p.opex_approved) -
              num(p.capex_incurred) -
              num(p.opex_incurred),
          ),
        }))
        .sort((a, b) => b.budget - a.budget),
    [projects],
  );

  const benefitRows = useMemo(() => {
    if (benefits.length) {
      return [...benefits]
        .map((b: any) => ({
          id: b.id,
          title: b.title,
          project: projectById.get(b.project_id)?.name || "—",
          type: b.benefit_type || "—",
          status: b.status || "—",
          target: num(b.target_value),
          realised: num(b.realised_value),
          gap: num(b.target_value) - num(b.realised_value),
        }))
        .sort((a, b) => b.target - a.target);
    }
    return projects
      .map((p: any) => ({
        id: p.id,
        title: p.name,
        project: p.name,
        type: "Project total",
        status: p.status || "—",
        target: num(p.benefits_target),
        realised: num(p.benefits_realised),
        gap: num(p.benefits_target) - num(p.benefits_realised),
      }))
      .filter((r) => r.target > 0 || r.realised > 0)
      .sort((a, b) => b.target - a.target);
  }, [benefits, projects, projectById]);

  const gateRegister = useMemo(() => {
    return projects.map((p: any) => {
      const gs = gates.filter((g: any) => g.project_id === p.id);
      const current =
        [...gs].reverse().find((g: any) => String(g.status || "").toLowerCase() === "approved") ||
        gs[gs.length - 1];
      const next = gs.find((g: any) => {
        const s = String(g.status || "").toLowerCase();
        return s !== "approved" && s !== "rejected";
      });
      return { project: p, current, next, count: gs.length };
    });
  }, [projects, gates]);

  const upcomingMilestones = useMemo(() => {
    return [...milestones]
      .filter((m: any) => {
        const s = String(m.status || "").toLowerCase();
        const done = s === "complete" || s === "completed" || s === "done" || !!m.actual_date;
        return !done;
      })
      .sort((a: any, b: any) => String(a.planned_date || "9999").localeCompare(String(b.planned_date || "9999")))
      .slice(0, 40);
  }, [milestones]);

  const loading =
    loadingProjects ||
    loadingRisks ||
    loadingActions ||
    loadingBenefits ||
    loadingGates ||
    loadingMilestones;

  const handleExport = () => exportProjects(projects as any[]);
  const printReport = () => window.print();

  if (!orgId) return <PageLoading label="Loading workspace…" fullScreen={false} />;

  return (
    <div className="space-y-5">
      <PageHeading
        title="Executive Reports"
        subtitle="Boardroom-ready portfolio reports — browse every section in-page"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={printReport}>
              <FileText className="mr-2 h-4 w-4" />
              Print / PDF
            </Button>
            <Button onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export Excel
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-5">
        <KpiCard label="Projects" value={total} />
        <KpiCard label="Total Budget" value={fmtM(budget)} />
        <KpiCard label="Incurred" value={fmtM(incurred)} />
        <KpiCard label="Red" value={red} accent="var(--st-danger)" />
        <KpiCard label="Amber" value={amber} accent="var(--st-warning)" />
      </div>

      {loading ? (
        <PageLoading label="Loading report data…" fullScreen={false} />
      ) : (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="portfolio">Portfolio & RAG</TabsTrigger>
            <TabsTrigger value="financials">Financials</TabsTrigger>
            <TabsTrigger value="risks">Risks & Actions</TabsTrigger>
            <TabsTrigger value="benefits">Benefits</TabsTrigger>
            <TabsTrigger value="gates">Stage Gates</TabsTrigger>
            <TabsTrigger value="rollups">Programs & BU</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <SectionFrame>
              <SectionTitle>Executive Summary</SectionTitle>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The portfolio comprises <strong className="text-foreground">{total}</strong> projects
                with a total approved budget of{" "}
                <strong className="text-foreground">{fmtM(budget)}</strong>. To date,{" "}
                <strong className="text-foreground">{fmtM(incurred)}</strong> (
                {budget ? ((incurred / budget) * 100).toFixed(1) : "0.0"}%) has been incurred.
                Currently, <strong className="text-foreground">{red}</strong> project(s) are Red and{" "}
                <strong className="text-foreground">{amber}</strong> are Amber. Open risks:{" "}
                <strong className="text-foreground">{openRisks.length}</strong>. Open actions:{" "}
                <strong className="text-foreground">{openActions.length}</strong> (
                {overdueActions.length} overdue). Benefits realised{" "}
                <strong className="text-foreground">{fmt$(benefitsRealised)}</strong> of{" "}
                <strong className="text-foreground">{fmt$(benefitsTarget)}</strong> target.
              </p>
            </SectionFrame>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard label="Green / Amber / Red" value={`${green} / ${amber} / ${red}`} />
              <KpiCard
                label="CAPEX remaining"
                value={fmtM(Math.max(0, capexApproved - capexIncurred))}
              />
              <KpiCard label="Open risks" value={openRisks.length} />
              <KpiCard
                label="Benefits rate"
                value={
                  benefitsTarget
                    ? `${((benefitsRealised / benefitsTarget) * 100).toFixed(1)}%`
                    : "—"
                }
              />
            </div>
          </TabsContent>

          <TabsContent value="portfolio" className="space-y-4">
            <SectionFrame>
              <SectionTitle>Portfolio KPIs & RAG Status</SectionTitle>
              <div className="mb-4 grid gap-3 sm:grid-cols-4">
                <KpiCard label="Projects" value={total} />
                <KpiCard label="Green" value={green} accent="var(--st-success, #15803d)" />
                <KpiCard label="Amber" value={amber} accent="var(--st-warning)" />
                <KpiCard label="Red" value={red} accent="var(--st-danger)" />
              </div>
              <div className="overflow-x-auto">
                <table className="st-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Program</th>
                      <th>Status</th>
                      <th>Priority</th>
                      <th>RAG</th>
                      <th>Budget</th>
                      <th>Sponsor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ragProjects.length === 0 ? (
                      <EmptyRow colSpan={7} label="No projects in the portfolio." />
                    ) : (
                      ragProjects.map((p: any) => (
                        <tr key={p.id}>
                          <td className="font-medium">{p.name}</td>
                          <td>{p.program || "—"}</td>
                          <td>{p.status || "—"}</td>
                          <td>{p.priority || "—"}</td>
                          <td>
                            <RagChip rag={p.rag} />
                          </td>
                          <td>{fmt$(num(p.budget))}</td>
                          <td>{p.sponsor || "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </SectionFrame>
          </TabsContent>

          <TabsContent value="financials" className="space-y-4">
            <SectionFrame>
              <SectionTitle>Financial Position (CAPEX / OPEX)</SectionTitle>
              <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <KpiCard label="CAPEX Approved" value={fmtM(capexApproved)} />
                <KpiCard label="CAPEX Incurred" value={fmtM(capexIncurred)} />
                <KpiCard label="OPEX Approved" value={fmtM(opexApproved)} />
                <KpiCard label="OPEX Incurred" value={fmtM(opexIncurred)} />
                <KpiCard
                  label="Total Remaining"
                  value={fmtM(Math.max(0, capexApproved + opexApproved - incurred))}
                />
              </div>
              <div className="overflow-x-auto">
                <table className="st-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Program</th>
                      <th>Budget</th>
                      <th>CAPEX Appr.</th>
                      <th>CAPEX Inc.</th>
                      <th>OPEX Appr.</th>
                      <th>OPEX Inc.</th>
                      <th>Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financeRows.length === 0 ? (
                      <EmptyRow colSpan={8} />
                    ) : (
                      financeRows.map((r) => (
                        <tr key={r.id}>
                          <td className="font-medium">{r.name}</td>
                          <td>{r.program}</td>
                          <td>{fmt$(r.budget)}</td>
                          <td>{fmt$(r.capexApproved)}</td>
                          <td>{fmt$(r.capexIncurred)}</td>
                          <td>{fmt$(r.opexApproved)}</td>
                          <td>{fmt$(r.opexIncurred)}</td>
                          <td>{fmt$(r.remaining)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </SectionFrame>
          </TabsContent>

          <TabsContent value="risks" className="space-y-4">
            <SectionFrame>
              <SectionTitle>Top Risks</SectionTitle>
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <KpiCard label="Open risks" value={openRisks.length} />
                <KpiCard
                  label="Critical (≥15)"
                  value={openRisks.filter((r: any) => num(r.severity) >= 15).length}
                  accent="var(--st-danger)"
                />
                <KpiCard label="Total logged" value={risks.length} />
              </div>
              <div className="overflow-x-auto">
                <table className="st-table">
                  <thead>
                    <tr>
                      <th>Risk</th>
                      <th>Project</th>
                      <th>Severity</th>
                      <th>Status</th>
                      <th>Owner</th>
                      <th>Due</th>
                      <th>Mitigation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topRisks.length === 0 ? (
                      <EmptyRow colSpan={7} label="No open risks." />
                    ) : (
                      topRisks.map((r: any) => (
                        <tr key={r.id}>
                          <td className="font-medium">{r.title}</td>
                          <td>{projectById.get(r.project_id)?.name || "—"}</td>
                          <td>{num(r.severity) || "—"}</td>
                          <td>{r.status || "—"}</td>
                          <td>{r.owner || "—"}</td>
                          <td>{r.due_date || "—"}</td>
                          <td className="max-w-[220px] truncate">{r.mitigation || "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </SectionFrame>

            <SectionFrame>
              <SectionTitle>Open Actions</SectionTitle>
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <KpiCard label="Open actions" value={openActions.length} />
                <KpiCard
                  label="Overdue"
                  value={overdueActions.length}
                  accent="var(--st-danger)"
                />
                <KpiCard label="Total logged" value={actions.length} />
              </div>
              <div className="overflow-x-auto">
                <table className="st-table">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Project</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Owner</th>
                      <th>Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openActions.length === 0 ? (
                      <EmptyRow colSpan={6} label="No open actions." />
                    ) : (
                      openActions.slice(0, 40).map((a: any) => (
                        <tr key={a.id}>
                          <td className="font-medium">{a.title}</td>
                          <td>{projectById.get(a.project_id)?.name || "—"}</td>
                          <td>{a.priority || "—"}</td>
                          <td>{a.status || "—"}</td>
                          <td>{a.owner || "—"}</td>
                          <td>{a.due_date || "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </SectionFrame>
          </TabsContent>

          <TabsContent value="benefits" className="space-y-4">
            <SectionFrame>
              <SectionTitle>Benefits Realisation</SectionTitle>
              <div className="mb-4 grid gap-3 sm:grid-cols-4">
                <KpiCard label="Target" value={fmt$(benefitsTarget)} />
                <KpiCard label="Realised" value={fmt$(benefitsRealised)} />
                <KpiCard label="Gap" value={fmt$(benefitsTarget - benefitsRealised)} />
                <KpiCard
                  label="Realisation rate"
                  value={
                    benefitsTarget
                      ? `${((benefitsRealised / benefitsTarget) * 100).toFixed(1)}%`
                      : "—"
                  }
                />
              </div>
              <div className="overflow-x-auto">
                <table className="st-table">
                  <thead>
                    <tr>
                      <th>Benefit / Project</th>
                      <th>Project</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Target</th>
                      <th>Realised</th>
                      <th>Gap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {benefitRows.length === 0 ? (
                      <EmptyRow colSpan={7} label="No benefits data captured yet." />
                    ) : (
                      benefitRows.map((r) => (
                        <tr key={r.id}>
                          <td className="font-medium">{r.title}</td>
                          <td>{r.project}</td>
                          <td>{r.type}</td>
                          <td>{r.status}</td>
                          <td>{fmt$(r.target)}</td>
                          <td>{fmt$(r.realised)}</td>
                          <td>{fmt$(r.gap)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </SectionFrame>
          </TabsContent>

          <TabsContent value="gates" className="space-y-4">
            <SectionFrame>
              <SectionTitle>Stage-Gate Progress</SectionTitle>
              <div className="mb-4 grid gap-3 sm:grid-cols-4">
                <KpiCard label="Total gates" value={gateStats.total} />
                <KpiCard label="Approved" value={gateStats.approved} />
                <KpiCard label="In flight" value={gateStats.pending} />
                <KpiCard label="Overdue" value={gateStats.overdue} accent="var(--st-danger)" />
              </div>
              <div className="overflow-x-auto">
                <table className="st-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Program</th>
                      <th>RAG</th>
                      <th>Gates</th>
                      <th>Current gate</th>
                      <th>Status</th>
                      <th>Next gate</th>
                      <th>Next planned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gateRegister.length === 0 ? (
                      <EmptyRow colSpan={8} />
                    ) : (
                      gateRegister.map(({ project, current, next, count }) => (
                        <tr key={project.id}>
                          <td className="font-medium">{project.name}</td>
                          <td>{project.program || "—"}</td>
                          <td>
                            <RagChip rag={project.rag} />
                          </td>
                          <td>{count}</td>
                          <td>{current?.gate_name || "—"}</td>
                          <td>{current?.status || "—"}</td>
                          <td>{next?.gate_name || "All complete"}</td>
                          <td>{next?.planned_date || "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </SectionFrame>

            <SectionFrame>
              <SectionTitle>Upcoming Milestones</SectionTitle>
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <KpiCard label="Total milestones" value={milestoneStats.total} />
                <KpiCard label="Complete" value={milestoneStats.complete} />
                <KpiCard
                  label="Overdue"
                  value={milestoneStats.overdue}
                  accent="var(--st-danger)"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="st-table">
                  <thead>
                    <tr>
                      <th>Milestone</th>
                      <th>Project</th>
                      <th>Status</th>
                      <th>Owner</th>
                      <th>Planned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingMilestones.length === 0 ? (
                      <EmptyRow colSpan={5} label="No upcoming milestones." />
                    ) : (
                      upcomingMilestones.map((m: any) => (
                        <tr key={m.id}>
                          <td className="font-medium">{m.name}</td>
                          <td>{projectById.get(m.project_id)?.name || "—"}</td>
                          <td>{m.status || "—"}</td>
                          <td>{m.owner || "—"}</td>
                          <td>{m.planned_date || "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </SectionFrame>
          </TabsContent>

          <TabsContent value="rollups" className="space-y-4">
            <SectionFrame>
              <SectionTitle>Program Roll-up</SectionTitle>
              <div className="overflow-x-auto">
                <table className="st-table">
                  <thead>
                    <tr>
                      <th>Program</th>
                      <th>Projects</th>
                      <th>Budget</th>
                      <th>Incurred</th>
                      <th>Benefits</th>
                      <th>G / A / R</th>
                    </tr>
                  </thead>
                  <tbody>
                    {programRollup.length === 0 ? (
                      <EmptyRow colSpan={6} />
                    ) : (
                      programRollup.map((p) => (
                        <tr key={p.name}>
                          <td className="font-medium">{p.name}</td>
                          <td>{p.count}</td>
                          <td>{fmt$(p.budget)}</td>
                          <td>{fmt$(p.incurred)}</td>
                          <td>{fmt$(p.benefits)}</td>
                          <td>
                            {p.green} / {p.amber} / {p.red}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </SectionFrame>

            <SectionFrame>
              <SectionTitle>Business Unit Roll-up</SectionTitle>
              <div className="overflow-x-auto">
                <table className="st-table">
                  <thead>
                    <tr>
                      <th>Business unit</th>
                      <th>Projects</th>
                      <th>Budget</th>
                      <th>Incurred</th>
                      <th>G / A / R</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buRollup.length === 0 ? (
                      <EmptyRow colSpan={5} />
                    ) : (
                      buRollup.map((b) => (
                        <tr key={b.name}>
                          <td className="font-medium">{b.name}</td>
                          <td>{b.count}</td>
                          <td>{fmt$(b.budget)}</td>
                          <td>{fmt$(b.incurred)}</td>
                          <td>
                            {b.green} / {b.amber} / {b.red}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </SectionFrame>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
