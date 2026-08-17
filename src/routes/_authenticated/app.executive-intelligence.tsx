/**
 * Executive Intelligence hub — What-If, capacity, optimisation, dependency
 * criticality, investment ranking, funding what-if, benefits insight, governance.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PROJECT_PORTFOLIO_SELECT } from "@/lib/project-selects";
import { sortProjectsByCodeName } from "@/lib/project-sort";
import { PageHeading, SectionFrame, SectionTitle, KpiCard, RagChip } from "@/components/streamlit";
import { explainRag } from "@/lib/explain-metric";
import { PageExport } from "@/components/page-export";
import { PageLoading } from "@/components/page-loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  analyzeChangeRequestImpact,
  analyzeDependencyCriticality,
  benefitsRealisationInsight,
  computeCapacityGap,
  generateGovernanceCadence,
  rankPortfolioInvestments,
  simulateDelayWhatIf,
  simulateFundingWhatIf,
  suggestReallocations,
} from "@/lib/executive-intelligence";
import { projectBenefitsRealised, projectBenefitsTarget } from "@/lib/project-finance";
import { GovernanceChainPanel } from "@/components/governance-chain-panel";
import { isDecisionAwaiting } from "@/lib/decision-approval";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/executive-intelligence")({
  head: () => ({
    meta: [
      { title: "Executive Intelligence — iProjectX" },
      {
        name: "description",
        content: "What-if, capacity, prioritisation, dependency and governance intelligence.",
      },
    ],
  }),
  component: ExecutiveIntelligencePage,
});

const money = (n: number) =>
  "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0);

function ExecutiveIntelligencePage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const [seedId, setSeedId] = useState("");
  const [delayWeeks, setDelayWeeks] = useState(6);
  const [fundingBudget, setFundingBudget] = useState("5000000");
  const month = new Date().toISOString().slice(0, 7);

  const projectsQ = useQuery({
    queryKey: ["projects", orgId, "exec-intel"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select(PROJECT_PORTFOLIO_SELECT as "*")
        .eq("org_id", orgId!);
      if (error) throw error;
      return sortProjectsByCodeName((data ?? []) as any[]);
    },
    enabled: !!orgId,
  });

  const benefitsQ = useQuery({
    queryKey: ["benefits", orgId, "exec-intel-payback"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("benefits")
        .select("project_id,payback_months")
        .eq("org_id", orgId!);
      if (error) return [];
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const depsQ = useQuery({
    queryKey: ["dependencies", orgId, "exec-intel"],
    queryFn: async () => {
      const { data, error } = await supabase.from("dependencies").select("*").eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!orgId,
  });

  const resourcesQ = useQuery({
    queryKey: ["resources", orgId, "exec-intel"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resources")
        .select("id,name,role,skills,capacity_hours_week,status")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!orgId,
  });

  const allocQ = useQuery({
    queryKey: ["resource_allocations", orgId, "exec-intel", month],
    queryFn: async () => {
      const monthStart = `${month}-01`;
      const [y, m] = month.split("-").map(Number);
      const next =
        m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
      const { data, error } = await supabase
        .from("resource_allocations")
        .select("resource_id,project_id,allocation_percent,allocated_hours,period_month")
        .eq("org_id", orgId!)
        .gte("period_month", monthStart)
        .lt("period_month", next);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!orgId,
  });

  const crsQ = useQuery({
    queryKey: ["change_requests", orgId, "exec-intel"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("change_requests")
        .select("id,project_id,title,status,impact_cost,impact_schedule_days,impact_scope")
        .eq("org_id", orgId!)
        .order("updated_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!orgId,
  });

  const decisionsQ = useQuery({
    queryKey: ["decisions", orgId, "exec-intel"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("decisions")
        .select(
          "id,project_id,title,owner,outcome,status,required_date,recommendation,options,schedule_impact_days,cost_impact,decision_date",
        )
        .eq("org_id", orgId!)
        .order("decision_date", { ascending: false })
        .limit(40);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!orgId,
  });

  const projects = projectsQ.data ?? [];
  const dependencies = depsQ.data ?? [];
  const activeSeed = seedId || projects[0]?.id || "";

  const whatIf = useMemo(() => {
    if (!activeSeed) return null;
    return simulateDelayWhatIf({
      seedProjectId: activeSeed,
      delayWeeks: Math.max(1, delayWeeks),
      projects,
      dependencies,
    });
  }, [activeSeed, delayWeeks, projects, dependencies]);

  const capacity = useMemo(
    () =>
      computeCapacityGap({
        month,
        resources: resourcesQ.data ?? [],
        allocations: allocQ.data ?? [],
      }),
    [month, resourcesQ.data, allocQ.data],
  );

  const realloc = useMemo(
    () =>
      suggestReallocations({
        month,
        resources: resourcesQ.data ?? [],
        allocations: allocQ.data ?? [],
        projects,
      }),
    [month, resourcesQ.data, allocQ.data, projects],
  );

  const depIntel = useMemo(
    () => analyzeDependencyCriticality({ projects, dependencies }),
    [projects, dependencies],
  );

  const ranked = useMemo(
    () =>
      rankPortfolioInvestments({
        projects,
        dependencies,
        benefits: (benefitsQ.data ?? []) as any[],
      }),
    [projects, dependencies, benefitsQ.data],
  );

  const funding = useMemo(
    () =>
      simulateFundingWhatIf({
        budget: Number(fundingBudget) || 0,
        ranked,
      }),
    [fundingBudget, ranked],
  );

  const benefitsInsights = useMemo(() => {
    return projects
      .map((p) => {
        const target = projectBenefitsTarget(p);
        const realised = projectBenefitsRealised(p);
        if (target <= 0 && realised <= 0) return null;
        const insight = benefitsRealisationInsight({
          projectName: p.name || p.project_code || "Project",
          target,
          realised,
          deliveryStatus: p.status,
        });
        return { project: p, ...insight, target, realised };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.rate - b.rate)
      .slice(0, 8) as any[];
  }, [projects]);

  const govTasks = useMemo(() => generateGovernanceCadence({ projects }), [projects]);
  const overdueGov = govTasks.filter((t) => t.status === "overdue");

  const openCrs = (crsQ.data ?? []).filter(
    (c) => !/approved|rejected|closed|cancelled/i.test(String(c.status || "")),
  );
  const crIntel = useMemo(() => {
    return openCrs.slice(0, 5).map((c) => ({
      cr: c,
      intel: analyzeChangeRequestImpact({ change: c, projects, dependencies }),
    }));
  }, [openCrs, projects, dependencies]);

  const openDecisions = useMemo(
    () => (decisionsQ.data ?? []).filter((d) => isDecisionAwaiting(d)).slice(0, 8),
    [decisionsQ.data],
  );
  const projectLabel = (id: string) => {
    const p = projects.find((x: any) => x.id === id);
    return p ? `${p.project_code ? `${p.project_code} · ` : ""}${p.name}` : id;
  };

  if (!orgId || (projectsQ.isLoading && !projects.length)) {
    return <PageLoading label="Loading executive intelligence…" />;
  }

  return (
    <PageExport name="Executive_Intelligence" title="Executive Intelligence">
      <PageHeading
        icon="🧠"
        title="Executive Intelligence"
        subtitle="What-if cascade, capacity gaps, resource optimisation, dependency criticality, investment ranking, funding simulation, benefits realisation, and governance automation."
      />

      {/* What-If */}
      <SectionFrame>
        <SectionTitle>What-If engine — delay cascade</SectionTitle>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="flex min-w-[16rem] flex-col gap-1 text-xs">
            <span className="font-semibold uppercase text-muted-foreground">Project</span>
            <Select value={activeSeed} onValueChange={setSeedId}>
              <SelectTrigger>
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.project_code ? `${p.project_code} · ` : ""}
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex w-32 flex-col gap-1 text-xs">
            <span className="font-semibold uppercase text-muted-foreground">Delay (weeks)</span>
            <Input
              type="number"
              min={1}
              max={52}
              value={delayWeeks}
              onChange={(e) => setDelayWeeks(Number(e.target.value) || 1)}
            />
          </label>
        </div>
        {whatIf ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
            <div className="space-y-2">
              {whatIf.cascade.map((n, i) => (
                <div key={n.projectId} className="flex items-start gap-2 text-sm">
                  <div className="w-6 text-muted-foreground">{i === 0 ? "" : "↓"}</div>
                  <div>
                    <span className="font-semibold">{n.label}</span>
                    <span className="ml-2 text-amber-700">+{n.delayWeeks} weeks</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {n.program} · cost {money(n.costImpact)}
                    </span>
                  </div>
                </div>
              ))}
              <p className="pt-2 text-sm">
                Portfolio milestone:{" "}
                <strong>+{whatIf.portfolioMilestoneDelayWeeks} weeks</strong>
              </p>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3">
              <div className="text-xs font-semibold uppercase text-rose-800">Additional cost</div>
              <div className="mt-1 text-2xl font-bold text-rose-700">
                {money(whatIf.additionalCost)}
              </div>
              <p className="mt-2 text-[11px] text-rose-900/80">
                Estimated portfolio burn from propagated delay.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Select a project to simulate.</p>
        )}
      </SectionFrame>

      {/* Capacity + optimisation */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionFrame>
          <SectionTitle>Resource capacity — {month}</SectionTitle>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <KpiCard label="Available FTE" value={capacity.availableFte} />
            <KpiCard label="Required FTE" value={capacity.requiredFte} />
            <KpiCard
              label="Gap"
              value={`${capacity.gapFte > 0 ? "🔴 " : ""}${capacity.gapFte}`}
              accent={capacity.gapFte > 0 ? "#ef4444" : "#22c55e"}
            />
          </div>
          <p className="mb-2 text-sm">{capacity.narrative}</p>
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="py-1 text-left">Bottleneck</th>
                <th className="py-1 text-right">Gap FTE</th>
              </tr>
            </thead>
            <tbody>
              {capacity.bySkill
                .filter((s) => s.gapFte > 0)
                .map((s) => (
                  <tr key={s.skill} className="border-t">
                    <td className="py-1.5">{s.skill}</td>
                    <td className="py-1.5 text-right font-semibold text-rose-700">+{s.gapFte}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap gap-2">
            {["Hire", "Reallocate", "Delay Project", "Reduce Scope"].map((a) => (
              <Button
                key={a}
                size="sm"
                variant="outline"
                onClick={() =>
                  toast.message(`${a} — open Resources / Scenarios / Change Register to act`)
                }
              >
                {a}
              </Button>
            ))}
          </div>
        </SectionFrame>

        <SectionFrame>
          <SectionTitle>Resource optimisation</SectionTitle>
          {realloc.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No reallocation suggestions for this month (balanced or no allocation data).
            </p>
          ) : (
            <div className="space-y-3">
              {realloc.map((s, i) => (
                <div key={i} className="rounded-lg border border-border p-3 text-sm">
                  <div className="font-semibold text-rose-700">
                    🔴 {s.skill} capacity shortage — move {s.fte} FTE
                  </div>
                  <p className="mt-1">
                    Suggested: <strong>{s.fromLabel}</strong> → <strong>{s.toLabel}</strong>
                  </p>
                  <p className="text-xs text-muted-foreground">{s.rationale}</p>
                  <p className="mt-1 text-xs">Expected outcome: {s.expectedOutcome}</p>
                </div>
              ))}
            </div>
          )}
          <Link to="/app/resources" className="mt-3 inline-block text-xs text-primary hover:underline">
            Open Resources →
          </Link>
        </SectionFrame>
      </div>

      {/* Dependency + Change intel */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionFrame>
          <SectionTitle>Dependency intelligence</SectionTitle>
          {depIntel.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cross-project dependencies recorded.</p>
          ) : (
            <div className="space-y-2">
              {depIntel.slice(0, 6).map((d) => (
                <div key={d.projectId} className="rounded-md border border-border px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{d.label}</span>
                    <RagChip
                      rag={d.criticality === "High" ? "Red" : d.criticality === "Medium" ? "Amber" : "Green"}
                      label={`Criticality ${d.criticality}`}
                      explain={explainRag({
                        rag: d.criticality === "High" ? "Red" : d.criticality === "Medium" ? "Amber" : "Green",
                        source: "criticality",
                        extraBullets: [d.message],
                      })}
                    />
                  </div>
                  <p className="mt-1 text-xs">
                    Dependency for <strong>{d.downstreamCount}</strong> other project
                    {d.downstreamCount === 1 ? "" : "s"}. {d.message}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Estimated portfolio impact: {money(d.portfolioImpact)}
                  </p>
                </div>
              ))}
            </div>
          )}
          <Link
            to="/app/dependencies"
            className="mt-3 inline-block text-xs text-primary hover:underline"
          >
            Open Dependencies →
          </Link>
        </SectionFrame>

        <SectionFrame>
          <SectionTitle>Change control intelligence</SectionTitle>
          {crIntel.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open change requests.</p>
          ) : (
            <div className="space-y-3">
              {crIntel.map(({ cr, intel }) => (
                <div key={cr.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="font-semibold">{cr.title}</div>
                  <div className="mt-2 grid grid-cols-2 gap-1 text-[11px]">
                    {intel.dimensions.map((d) => (
                      <div key={d.label}>
                        <span className="text-muted-foreground">{d.label}: </span>
                        <strong>{d.value}</strong>
                      </div>
                    ))}
                  </div>
                  {intel.warning ? (
                    <p className="mt-2 text-xs font-medium text-amber-800">⚠️ {intel.warning}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          <Link
            to="/app/release-register"
            className="mt-3 inline-block text-xs text-primary hover:underline"
          >
            Open Change Register →
          </Link>
        </SectionFrame>
      </div>

      {/* Investment + funding */}
      <SectionFrame>
        <SectionTitle>Investment decision engine & prioritisation</SectionTitle>
        <div className="st-table-wrap overflow-x-auto">
          <table className="st-table min-w-[800px]">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Project</th>
                <th className="text-right">Investment</th>
                <th className="text-right">Strategic</th>
                <th className="text-right">Benefit</th>
                <th>Risk</th>
                <th className="text-right">Confidence</th>
                <th className="text-right">ROI</th>
                <th className="text-right">Payback</th>
                <th className="text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {ranked.slice(0, 12).map((r, i) => (
                <tr key={r.projectId}>
                  <td>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</td>
                  <td className="font-medium">{r.label}</td>
                  <td className="text-right tabular-nums">{money(r.investment)}</td>
                  <td className="text-right tabular-nums">{r.strategicAlignment}%</td>
                  <td className="text-right tabular-nums">{money(r.expectedBenefit)}</td>
                  <td>{r.risk}</td>
                  <td className="text-right tabular-nums">{r.confidence}%</td>
                  <td className="text-right tabular-nums">{r.roi}%</td>
                  <td className="text-right tabular-nums">
                    {r.paybackMonths == null ? "—" : `${r.paybackMonths} mo`}
                  </td>
                  <td className="text-right font-bold tabular-nums">{r.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Score = Strategic 20% · ROI 14% · Payback 14% · Urgency 12% · Risk 12% · Regulatory 8% ·
          Dependency 8% · Customer 6% · Resource demand 6%. Faster payback scores higher.
        </p>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Portfolio what-if funding</SectionTitle>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="flex w-56 flex-col gap-1 text-xs">
            <span className="font-semibold uppercase text-muted-foreground">
              Additional funding available
            </span>
            <Input value={fundingBudget} onChange={(e) => setFundingBudget(e.target.value)} />
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {funding.options.map((o) => (
            <div
              key={o.id}
              className={`rounded-lg border p-3 text-sm ${
                funding.recommended?.id === o.id
                  ? "border-emerald-300 bg-emerald-50/60"
                  : "border-border"
              }`}
            >
              <div className="font-semibold">{o.label}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {o.projectLabels.slice(0, 4).join(" · ")}
                {o.projectLabels.length > 4 ? "…" : ""}
              </p>
              <div className="mt-2 text-xs">
                Investment: <strong>{money(o.totalInvestment)}</strong>
              </div>
              <div className="text-xs">
                Expected benefit: <strong>{money(o.expectedBenefit)}</strong>
              </div>
            </div>
          ))}
        </div>
        {funding.recommended ? (
          <p className="mt-3 text-sm font-medium text-emerald-800">{funding.rationale}</p>
        ) : null}
      </SectionFrame>

      {/* Decision management */}
      <SectionFrame>
        <SectionTitle>Decision management</SectionTitle>
        {openDecisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No decisions awaiting action. Record options, recommendation, owner, and required date on
            the Decisions page.
          </p>
        ) : (
          <div className="space-y-3">
            {openDecisions.map((d: any) => (
              <div key={d.id} className="rounded-md border border-border p-3 text-sm">
                <div className="font-semibold">Decision required</div>
                <p className="mt-1">{d.title}</p>
                <p className="text-xs text-muted-foreground">{projectLabel(d.project_id)}</p>
                {d.recommendation ? (
                  <p className="mt-1 text-xs">
                    Recommendation: <strong>{d.recommendation}</strong>
                  </p>
                ) : null}
                {d.options ? (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                    Options: {d.options}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {d.owner ? <span>Owner: {d.owner}</span> : null}
                  {d.required_date ? (
                    <span>
                      Required by: <strong>{d.required_date}</strong>
                    </span>
                  ) : null}
                  {d.schedule_impact_days != null ? (
                    <span className="text-amber-800">
                      Without decision: schedule +{d.schedule_impact_days} days
                    </span>
                  ) : null}
                  {d.cost_impact != null ? (
                    <span className="text-rose-700">Cost impact: {money(Number(d.cost_impact))}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
        <Link to="/app/decisions" className="mt-3 inline-block text-xs text-primary hover:underline">
          Open Decisions →
        </Link>
      </SectionFrame>

      <GovernanceChainPanel />

      {/* Benefits + Governance */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionFrame>
          <SectionTitle>Benefits realisation</SectionTitle>
          {benefitsInsights.length === 0 ? (
            <p className="text-sm text-muted-foreground">No benefit targets recorded.</p>
          ) : (
            <div className="space-y-2">
              {benefitsInsights.map((b: any) => (
                <div key={b.project.id} className="rounded-md border border-border px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{b.project.name}</span>
                    <RagChip
                      rag={b.rag}
                      explain={explainRag({
                        rag: b.rag,
                        source: "benefits",
                        extraBullets: [b.headline, b.detail].filter(Boolean),
                      })}
                    />
                  </div>
                  <p className="mt-1 text-xs font-medium">
                    {b.rag === "Amber" ? "🟠 " : b.rag === "Red" ? "🔴 " : "🟢 "}
                    {b.headline}
                  </p>
                  <p className="text-xs text-muted-foreground">{b.detail}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Target {money(b.target)} · Actual {money(b.realised)}
                  </p>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Delivery success ≠ business success.
          </p>
        </SectionFrame>

        <SectionFrame>
          <SectionTitle>Governance automation</SectionTitle>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <KpiCard label="Cadence tasks" value={govTasks.length} />
            <KpiCard
              label="Overdue"
              value={overdueGov.length}
              accent={overdueGov.length ? "#ef4444" : undefined}
            />
          </div>
          <p className="mb-2 text-xs text-muted-foreground">
            Weekly progress · Monthly health & financial · Quarterly benefits · Stage-gate approvals
          </p>
          <ul className="max-h-64 space-y-1.5 overflow-auto text-sm">
            {(overdueGov.length ? overdueGov : govTasks.slice(0, 12)).map((t) => (
              <li key={t.key} className="flex gap-2 border-b border-border/60 py-1">
                <span className="text-[10px] uppercase text-muted-foreground">{t.cadence}</span>
                <span className="min-w-0 flex-1 truncate">
                  {t.projectLabel}: {t.title}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">{t.dueDate}</span>
                {t.status === "overdue" ? (
                  <span className="text-xs font-semibold text-rose-700">🔴 Overdue</span>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <Link to="/app/decisions" className="text-primary hover:underline">
              Decisions
            </Link>
            <Link to="/app/actions" className="text-primary hover:underline">
              Actions
            </Link>
            <Link to="/app/stage-gates" className="text-primary hover:underline">
              Stage gates
            </Link>
          </div>
        </SectionFrame>
      </div>
    </PageExport>
  );
}
