import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard, RagChip } from "@/components/streamlit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LayoutDashboard,
  TrendingUp,
  AlertTriangle,
  DollarSign,
  Users,
  Calendar,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LabelList, Legend } from "recharts";
import { fyLabel } from "@/lib/fiscal-year";
import { ExpandableChart } from "@/components/expandable-chart";
import {
  projectApprovedFunding,
  projectForecast,
  projectIncurred,
  fyAllocBudget,
  fyAllocForecast,
  sumBenefitsRealised,
  sumBenefitsTarget,
} from "@/lib/project-finance";
import {
  computeProjectHealth,
  portfolioSegmentLabels,
  projectPortfolio,
} from "@/lib/project-health";
import { PROJECT_PORTFOLIO_SELECT } from "@/lib/project-selects";

export const Route = createFileRoute("/_authenticated/app/executive-cockpit")({
  head: () => ({
    meta: [
      { title: "Executive Cockpit — PMO Enterprise" },
      { name: "description", content: "High-level executive cockpit view across the portfolio." },
    ],
  }),
  component: ExecutiveCockpit,
});

const tiles = [
  {
    to: "/app/executive",
    label: "Executive Dashboard",
    icon: LayoutDashboard,
    desc: "Portfolio KPIs, health, timeline",
  },
  {
    to: "/app/financials",
    label: "Financials",
    icon: DollarSign,
    desc: "Budget, actuals, forecast",
  },
  { to: "/app/risks", label: "Risks", icon: AlertTriangle, desc: "Top risks & mitigation" },
  {
    to: "/app/prioritisation",
    label: "Prioritisation",
    icon: TrendingUp,
    desc: "ROI & value ranking",
  },
  { to: "/app/resources", label: "Resources", icon: Users, desc: "Capacity & demand" },
  { to: "/app/timeline", label: "Timeline", icon: Calendar, desc: "Portfolio Gantt" },
] as const;

function money(n: number) {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1_000_000) return "$" + (v / 1_000_000).toFixed(2) + "M";
  if (Math.abs(v) >= 1_000) return "$" + Math.round(v / 1_000) + "K";
  return "$" + Math.round(v).toLocaleString();
}
function pct(n: number, d: number) {
  return d ? ((n / d) * 100).toFixed(1) + "%" : "0.0%";
}
const num = (v: unknown) => Number(v || 0);

function ExecutiveCockpit() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const fyStartMonth = organization?.fy_start_month || 4;

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", orgId],
    queryFn: async () =>
      (await supabase.from("projects").select(PROJECT_PORTFOLIO_SELECT as "*")).data ?? [],
    enabled: !!orgId,
  });
  const { data: gates = [] } = useQuery({
    queryKey: ["stage_gates", orgId],
    queryFn: async () =>
      (
        await supabase
          .from("stage_gates")
          .select("id,project_id,gate_name,planned_date,actual_date,status")
      ).data ?? [],
    enabled: !!orgId,
  });
  const { data: decisions = [] } = useQuery({
    queryKey: ["decisions", orgId],
    queryFn: async () =>
      (await supabase.from("decisions").select("id,outcome,status")).data ?? [],
    enabled: !!orgId,
  });
  const { data: actions = [] } = useQuery({
    queryKey: ["actions", orgId],
    queryFn: async () =>
      (await supabase.from("actions").select("id,status,due_date")).data ?? [],
    enabled: !!orgId,
  });
  const { data: benefits = [] } = useQuery({
    queryKey: ["benefits", orgId],
    queryFn: async () =>
      (
        await supabase
          .from("benefits")
          .select("id,project_id,target_value,realised_value")
      ).data ?? [],
    enabled: !!orgId,
  });
  const { data: fyAlloc = [] } = useQuery({
    queryKey: ["fy_allocations", orgId],
    queryFn: async () =>
      (
        await supabase
          .from("fy_allocations")
          .select("id,fy,budget,forecast,capex,opex,benefits,allocated_amount,forecast_amount")
      ).data ?? [],
    enabled: !!orgId,
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles", orgId],
    queryFn: async () =>
      (await supabase.from("profiles").select("id,full_name,email")).data ?? [],
    enabled: !!orgId,
  });

  const profileById = useMemo(
    () => new Map((profiles as any[]).map((p) => [p.id, p])),
    [profiles],
  );

  const gatesByProject = useMemo(() => {
    const m = new Map<string, any[]>();
    (gates as any[]).forEach((g) => {
      if (!g.project_id) return;
      const list = m.get(g.project_id) || [];
      list.push(g);
      m.set(g.project_id, list);
    });
    return m;
  }, [gates]);

  // ---------- KPIs + segmentation (single memo; index benefits once) ----------
  const {
    totalValue,
    capexApproved,
    opexApproved,
    approvedFunding,
    actualSpend,
    remaining,
    fac,
    total,
    onTrack,
    atRisk,
    delayed,
    strategicPrograms,
    capexPrograms,
    unfundedInitiatives,
    benefitsForecast,
    benefitsRealised,
    decisionsPending,
    overdueActions,
    upcomingGates,
    segRows,
    segTotals,
  } = useMemo(() => {
    const benefitsByProject = new Map<string, any[]>();
    (benefits as any[]).forEach((b) => {
      if (!b.project_id) return;
      const list = benefitsByProject.get(b.project_id) || [];
      list.push(b);
      benefitsByProject.set(b.project_id, list);
    });
    const benefitTargetFor = (p: any) =>
      sumBenefitsTarget(benefitsByProject.get(p.id) || [], p, p.id);

    const totalValue = projects.reduce((s: number, p: any) => s + num(p.budget), 0);
    const capexApproved = projects.reduce((s: number, p: any) => s + num(p.capex_approved), 0);
    const opexApproved = projects.reduce((s: number, p: any) => s + num(p.opex_approved), 0);
    const approvedFunding = projects.reduce(
      (s: number, p: any) => s + projectApprovedFunding(p),
      0,
    );
    const actualSpend = projects.reduce((s: number, p: any) => s + projectIncurred(p), 0);
    const remaining = Math.max(0, approvedFunding - actualSpend);
    const fac = projects.reduce((s: number, p: any) => s + projectForecast(p), 0);

    const total = projects.length || 1;
    const onTrack = projects.filter((p: any) => (p.rag || "").toLowerCase() === "green").length;
    const atRisk = projects.filter((p: any) => (p.rag || "").toLowerCase() === "amber").length;
    const delayed = projects.filter((p: any) => (p.rag || "").toLowerCase() === "red").length;
    const strategicPrograms = new Set(
      projects
        .filter((p: any) => {
          const cat = projectPortfolio(p);
          return cat === "Business Strategic" || cat === "IT Strategic";
        })
        .map((p: any) => p.program)
        .filter(Boolean),
    ).size;
    const capexPrograms = new Set(
      projects
        .filter((p: any) => projectPortfolio(p) === "CAPEX")
        .map((p: any) => p.program)
        .filter(Boolean),
    ).size;
    const unfundedInitiatives = projects.filter(
      (p: any) => projectPortfolio(p).toLowerCase() === "unfunded",
    ).length;

    const benefitsForecast = benefits.reduce((s: number, b: any) => s + num(b.target_value), 0);
    const benefitsRealised = benefits.reduce((s: number, b: any) => s + num(b.realised_value), 0);

    const decisionsPending = decisions.filter((d: any) => {
      const s = String(d.outcome || d.status || "")
        .toLowerCase()
        .trim();
      return !s || s === "pending" || s === "in review" || s === "open";
    }).length;
    const today = new Date();
    const overdueActions = actions.filter((a: any) => {
      const s = String(a.status || "").toLowerCase();
      if (s === "closed" || s === "done" || s === "completed") return false;
      if (!a.due_date) return false;
      return new Date(a.due_date) < today;
    }).length;
    const upcomingGates = gates.filter((g: any) => {
      if (!g.planned_date) return false;
      const d = new Date(g.planned_date);
      const diff = (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 30;
    }).length;

    const segLabels = portfolioSegmentLabels(projects as any[]);
    const segRows = segLabels.map((cat) => {
      const rows = projects.filter((p: any) => projectPortfolio(p) === cat);
      const approved = rows.reduce((s: number, p: any) => s + projectApprovedFunding(p), 0);
      const actual = rows.reduce((s: number, p: any) => s + projectIncurred(p), 0);
      const bf = rows.reduce((s: number, p: any) => s + benefitTargetFor(p), 0);
      return {
        name: cat,
        initiatives: rows.length,
        approved,
        actual,
        remaining: Math.max(0, approved - actual),
        benefits: bf,
        green: rows.filter((p: any) => (p.rag || "").toLowerCase() === "green").length,
        amber: rows.filter((p: any) => (p.rag || "").toLowerCase() === "amber").length,
        red: rows.filter((p: any) => (p.rag || "").toLowerCase() === "red").length,
      };
    });
    const segApproved = approvedFunding;
    const segActual = actualSpend;
    const segTotals = {
      initiatives: projects.length,
      approved: segApproved,
      actual: segActual,
      remaining: Math.max(0, segApproved - segActual),
      benefits: projects.reduce((s: number, p: any) => s + benefitTargetFor(p), 0),
      green: onTrack,
      amber: atRisk,
      red: delayed,
    };

    return {
      totalValue,
      capexApproved,
      opexApproved,
      approvedFunding,
      actualSpend,
      remaining,
      fac,
      total,
      onTrack,
      atRisk,
      delayed,
      strategicPrograms,
      capexPrograms,
      unfundedInitiatives,
      benefitsForecast,
      benefitsRealised,
      decisionsPending,
      overdueActions,
      upcomingGates,
      segRows,
      segTotals,
    };
  }, [projects, benefits, decisions, actions, gates]);

  // ---------- Budget vs Forecast by FY ----------
  const fyData = useMemo(() => {
    const map = new Map<string, { fy: string; budget: number; forecast: number }>();
    fyAlloc.forEach((a: any) => {
      const fy = a.fy || a.financial_year;
      if (!fy) return;
      const cur = map.get(fy) || { fy, budget: 0, forecast: 0 };
      cur.budget += fyAllocBudget(a);
      cur.forecast += fyAllocForecast(a);
      map.set(fy, cur);
    });
    if (map.size === 0) {
      // derive from projects
      projects.forEach((p: any) => {
        const start = p.start_date ? fyLabel(new Date(p.start_date), fyStartMonth) : null;
        if (!start) return;
        const cur = map.get(start) || { fy: start, budget: 0, forecast: 0 };
        cur.budget += projectApprovedFunding(p);
        cur.forecast += projectForecast(p);
        map.set(start, cur);
      });
    }
    return Array.from(map.values()).sort((a, b) => a.fy.localeCompare(b.fy));
  }, [fyAlloc, projects, fyStartMonth]);

  const projectsWithFY =
    new Set(fyAlloc.map((a: any) => a.project_id).filter(Boolean)).size ||
    projects.filter((p: any) => p.start_date).length;
  const allocationCoverage = projects.length
    ? Math.round((projectsWithFY / projects.length) * 100)
    : 0;

  // ---------- Health snapshot rows (computed from live project + gate + benefit data) ----------
  const healthRows = useMemo(() => {
    return projects
      .slice()
      .sort((a: any, b: any) =>
        String(a.project_code || "").localeCompare(String(b.project_code || "")),
      )
      .map((p: any) => {
        const withBenefits = {
          ...p,
          benefits_target: sumBenefitsTarget(benefits as any[], p, p.id),
          benefits_realised: sumBenefitsRealised(benefits as any[], p, p.id),
        };
        const health = computeProjectHealth(withBenefits, gatesByProject.get(p.id) || []);
        const pm = p.pm_user_id ? profileById.get(p.pm_user_id) : null;
        const deliveryLead =
          (pm?.full_name || pm?.email || p.delivery_lead || p.pm_name || "").trim() || "—";
        return { ...p, ...health, delivery_lead: deliveryLead };
      });
  }, [projects, benefits, gatesByProject, profileById]);

  return (
    <div className="space-y-4">
      <PageHeading
        icon="📊"
        title="Executive Cockpit"
        subtitle="Live portfolio snapshot for executives."
      />

      {/* Financial */}
      <SectionFrame exportName="cockpit-financial">
        <SectionTitle>Financial</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <KpiCard label="Total Portfolio Value" value={money(totalValue)} />
          <KpiCard label="Total CAPEX Budget" value={money(capexApproved)} />
          <KpiCard label="Total OPEX Budget" value={money(opexApproved)} />
          <KpiCard label="Approved Funding" value={money(approvedFunding)} />
          <KpiCard label="Actual Spend to Date" value={money(actualSpend)} />
          <KpiCard label="Remaining Portfolio Budget" value={money(remaining)} />
          <KpiCard label="Forecast at Completion" value={money(fac)} />
        </div>
      </SectionFrame>

      {/* Delivery */}
      <SectionFrame exportName="cockpit-delivery">
        <SectionTitle>Delivery</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="On Track (%)" value={pct(onTrack, total)} accent="#22c55e" />
          <KpiCard label="At Risk (%)" value={pct(atRisk, total)} accent="#f59e0b" />
          <KpiCard label="Critical (RAG) (%)" value={pct(delayed, total)} accent="#ef4444" />
          <KpiCard label="Total Strategic Programs" value={strategicPrograms} />
          <KpiCard label="Total CAPEX Programs" value={capexPrograms} />
          <KpiCard label="Total Unfunded Initiatives" value={unfundedInitiatives} />
        </div>
      </SectionFrame>

      {/* Benefits & Governance */}
      <SectionFrame exportName="cockpit-benefits-governance">
        <SectionTitle>Benefits & Governance</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <KpiCard label="Benefits Forecast" value={money(benefitsForecast)} />
          <KpiCard label="Benefits Realised" value={money(benefitsRealised)} accent="#22c55e" />
          <KpiCard label="Decisions Awaiting Approval" value={decisionsPending} accent="#3b82f6" />
          <KpiCard
            label="Overdue Actions"
            value={overdueActions}
            accent={overdueActions ? "#ef4444" : undefined}
          />
          <KpiCard label="Upcoming Stage Gates" value={upcomingGates} accent="#8b5cf6" />
        </div>
      </SectionFrame>

      {/* Portfolio Segmentation */}
      <SectionFrame exportName="cockpit-segmentation" exportTitle="Portfolio Segmentation">
        <SectionTitle>📁 Portfolio Segmentation</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Portfolio</th>
                <th className="px-3 py-2 text-right">Initiatives</th>
                <th className="px-3 py-2 text-right">Approved Funding</th>
                <th className="px-3 py-2 text-right">Actual Spend</th>
                <th className="px-3 py-2 text-right">Remaining</th>
                <th className="px-3 py-2 text-right">Benefits Forecast</th>
                <th className="px-3 py-2 text-right">Green</th>
                <th className="px-3 py-2 text-right">Amber</th>
                <th className="px-3 py-2 text-right">Red</th>
              </tr>
            </thead>
            <tbody>
              {segRows.map((r) => (
                <tr key={r.name} className="border-t">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-right">{r.initiatives}</td>
                  <td className="px-3 py-2 text-right">
                    {Math.round(r.approved).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">{Math.round(r.actual).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">
                    {Math.round(r.remaining).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {Math.round(r.benefits).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">{r.green}</td>
                  <td className="px-3 py-2 text-right">{r.amber}</td>
                  <td className="px-3 py-2 text-right">{r.red}</td>
                </tr>
              ))}
              <tr className="border-t bg-muted/30 font-semibold">
                <td className="px-3 py-2">All Portfolio</td>
                <td className="px-3 py-2 text-right">{segTotals.initiatives}</td>
                <td className="px-3 py-2 text-right">
                  {Math.round(segTotals.approved).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">
                  {Math.round(segTotals.actual).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">
                  {Math.round(segTotals.remaining).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">
                  {Math.round(segTotals.benefits).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">{segTotals.green}</td>
                <td className="px-3 py-2 text-right">{segTotals.amber}</td>
                <td className="px-3 py-2 text-right">{segTotals.red}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Showing {segRows.length} of {segRows.length} row(s).
        </div>
      </SectionFrame>

      {/* Portfolio Health Snapshot */}
      <SectionFrame
        exportName="cockpit-health"
        exportTitle="Portfolio Health Snapshot"
        className="section-frame--filters overflow-visible"
      >
        <SectionTitle>🚦 Portfolio Health Snapshot</SectionTitle>
        <p className="mb-2 text-[11px] text-muted-foreground md:hidden">Swipe sideways to see all columns.</p>
        <div className="st-table-wrap max-h-[min(520px,70dvh)] overflow-auto overscroll-contain">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="sticky top-0 z-[1] bg-muted/70 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Project ID</th>
                <th className="px-3 py-2 text-left">Project Name</th>
                <th className="px-3 py-2 text-left">Portfolio Category</th>
                <th className="px-3 py-2 text-left">Governance Channel</th>
                <th className="px-3 py-2 text-left">Sponsor</th>
                <th className="px-3 py-2 text-left">Delivery Lead</th>
                <th className="px-3 py-2 text-right">Progress %</th>
                <th className="px-3 py-2 text-left">Schedule Health</th>
                <th className="px-3 py-2 text-left">Financial Health</th>
                <th className="px-3 py-2 text-left">Delivery Health</th>
                <th className="px-3 py-2 text-left">Benefit Health</th>
                <th className="px-3 py-2 text-left">Overall RAG</th>
              </tr>
            </thead>
            <tbody>
              {healthRows.map((p: any) => (
                <tr key={p.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link
                      to="/app/project-infographic"
                      search={{ pid: p.id } as any}
                      className="text-primary hover:underline"
                    >
                      {p.project_code || "—"}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{p.name}</td>
                  <td className="px-3 py-2">{p.portfolio || "—"}</td>
                  <td className="px-3 py-2">{p.governance_channel || "—"}</td>
                  <td className="px-3 py-2">{p.sponsor || "—"}</td>
                  <td className="px-3 py-2">{p.delivery_lead || "—"}</td>
                  <td className="px-3 py-2 text-right">{Math.round(num(p.progress_percent))}</td>
                  <td className="px-3 py-2">
                    <RagChip rag={p.schedule_rag} label={p.schedule_rag} />
                  </td>
                  <td className="px-3 py-2">
                    <RagChip rag={p.financial_rag} label={p.financial_rag} />
                  </td>
                  <td className="px-3 py-2">
                    <RagChip rag={p.delivery_rag} label={p.delivery_rag} />
                  </td>
                  <td className="px-3 py-2">
                    <RagChip rag={p.benefit_rag} label={p.benefit_rag} />
                  </td>
                  <td className="px-3 py-2">
                    <RagChip rag={p.overall_rag || p.rag} label={p.overall_rag || p.rag} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Showing {healthRows.length} of {healthRows.length} row(s).
        </div>
      </SectionFrame>

      {/* Budget & Forecast by FY */}
      <SectionFrame exportName="cockpit-fy" exportTitle="Budget & Forecast by Financial Year">
        <SectionTitle>📅 Budget & Forecast by Financial Year</SectionTitle>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
          <ExpandableChart title="Budget vs Forecast by FY" heightClass="h-72">
            <BarChart data={fyData} margin={{ top: 20, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="fy" />
              <YAxis
                tickFormatter={(v: number) =>
                  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` : `${Math.round(v / 1000)}K`
                }
                label={{ value: "Amount", angle: -90, position: "insideLeft" }}
              />
              <Tooltip formatter={(v: number) => money(v)} />
              <Legend verticalAlign="top" />
              <Bar dataKey="budget" name="Budget" fill="#3b82f6">
                <LabelList
                  dataKey="budget"
                  position="top"
                  style={{ fontSize: 10 }}
                  formatter={(v: number) =>
                    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${Math.round(v / 1000)}K`
                  }
                />
              </Bar>
              <Bar dataKey="forecast" name="Forecast" fill="#f59e0b">
                <LabelList
                  dataKey="forecast"
                  position="top"
                  style={{ fontSize: 10 }}
                  formatter={(v: number) =>
                    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${Math.round(v / 1000)}K`
                  }
                />
              </Bar>
            </BarChart>
          </ExpandableChart>
          <div className="flex flex-col gap-3">
            <KpiCard
              label="Projects with FY Allocation"
              value={`${projectsWithFY}/${projects.length}`}
            />
            <KpiCard
              label="Allocation Coverage"
              value={`${allocationCoverage}%`}
              accent="#22c55e"
            />
          </div>
        </div>
      </SectionFrame>

      {/* Shortcuts — kept as before */}
      <SectionFrame exportable={false}>
        <SectionTitle>Quick Access</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <Link key={t.to} to={t.to} className="block">
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <t.icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base">{t.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{t.desc}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </SectionFrame>
    </div>
  );
}
