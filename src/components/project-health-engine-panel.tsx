/**
 * Project Health Engine panel — calculated score, drivers, early warnings,
 * 30-day predictive health, automated forecast, and action layer.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  Gauge,
  LineChart,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SectionFrame, SectionTitle, RagChip } from "@/components/streamlit";
import { Button } from "@/components/ui/button";
import { WORK_ITEMS_SELECT } from "@/lib/query-selects";
import {
  evaluateProjectHealth,
  readStoredHealthScore,
  writeStoredHealthScore,
  type HealthEngineResult,
} from "@/lib/project-health-engine";
import { explainRag, type MetricExplanation } from "@/lib/explain-metric";
import { ExplainThis } from "@/components/explain-this";

const money = (n: number) =>
  "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0);

function ScoreRing({ score, rag }: { score: number; rag: string }) {
  const color =
    rag === "Green" ? "#16a34a" : rag === "Amber" ? "#d97706" : rag === "Red" ? "#dc2626" : "#64748b";
  const pct = Math.min(100, Math.max(0, score));
  return (
    <div className="relative mx-auto flex h-28 w-28 items-center justify-center">
      <svg viewBox="0 0 36 36" className="h-28 w-28 -rotate-90">
        <path
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          stroke="currentColor"
          className="text-muted/30"
          strokeWidth="3"
        />
        <path
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={`${pct}, 100`}
          strokeLinecap="round"
          className="transition-[stroke-dasharray] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-bold tabular-nums" style={{ color }}>
          {score}
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Health
        </div>
      </div>
    </div>
  );
}

function DimensionBar({
  label,
  weight,
  score,
  rag,
  detail,
  explain,
}: {
  label: string;
  weight: number;
  score: number;
  rag: string;
  detail: string;
  explain?: MetricExplanation | null;
}) {
  const color =
    rag === "Green" ? "bg-emerald-500" : rag === "Amber" ? "bg-amber-500" : "bg-rose-500";
  // Score 0 must still paint a visible critical sliver — width:0% looks like a missing bar.
  const pct = Math.min(100, Math.max(0, Number(score) || 0));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-foreground">
          {label}{" "}
          <span className="font-normal text-muted-foreground">({Math.round(weight * 100)}%)</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="tabular-nums font-semibold">{score}</span>
          {explain ? <ExplainThis explanation={explain} size="xs" /> : null}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted/80 ring-1 ring-inset ring-border/60"
        role="meter"
        aria-label={`${label} score ${score} of 100`}
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${color}`}
          style={{ width: pct <= 0 ? "8px" : `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}

export function ProjectHealthEnginePanel({
  project,
  gates = [],
  risks = [],
  dependencies = [],
  monthly = [],
  allocations = [],
}: {
  project: any;
  gates?: any[];
  risks?: any[];
  dependencies?: any[];
  monthly?: any[];
  allocations?: any[];
}) {
  const { organization, profile } = useAuth();
  const orgId = organization?.id;
  const projectId = project?.id as string | undefined;
  const qc = useQueryClient();
  const [prevScore, setPrevScore] = useState<number | null>(null);

  const { data: workItems = [] } = useQuery({
    queryKey: ["work_items", orgId, "health-engine", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_items" as any)
        .select(WORK_ITEMS_SELECT as "*")
        .eq("org_id", orgId!)
        .eq("project_id", projectId!);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!orgId && !!projectId,
    staleTime: 30_000,
  });

  const { data: changeRequests = [] } = useQuery({
    queryKey: ["change_requests", orgId, "health-engine", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("change_requests")
        .select("id,status,change_type,impact_cost,impact_schedule_days,title")
        .eq("org_id", orgId!)
        .eq("project_id", projectId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId && !!projectId,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!projectId) return;
    setPrevScore(readStoredHealthScore(projectId));
  }, [projectId]);

  const health: HealthEngineResult | null = useMemo(() => {
    if (!project) return null;
    return evaluateProjectHealth({
      project,
      workItems,
      gates,
      risks,
      dependencies,
      changeRequests,
      allocations,
      monthly,
      previousScore: prevScore,
    });
  }, [
    project,
    workItems,
    gates,
    risks,
    dependencies,
    changeRequests,
    allocations,
    monthly,
    prevScore,
  ]);

  useEffect(() => {
    if (!projectId || !health) return;
    writeStoredHealthScore(projectId, health.score);
  }, [projectId, health?.score]);

  const reforecast = useMutation({
    mutationFn: async () => {
      if (!projectId || !health) throw new Error("No forecast available");
      const fac = Math.round(health.forecast.forecastFinalCost);
      // Prefer writing FAC on the default stream when streams are on — project
      // FAC is a rollup and would otherwise be overwritten on the next stream edit.
      const { data: defaultStream } = await supabase
        .from("project_streams" as never)
        .select("id")
        .eq("project_id", projectId)
        .eq("is_default", true)
        .maybeSingle();
      const streamId = (defaultStream as { id?: string } | null)?.id;
      if (streamId) {
        const { error: streamErr } = await supabase
          .from("project_streams" as never)
          .update({ forecast_at_completion: fac } as never)
          .eq("id", streamId);
        if (streamErr) throw streamErr;
      }
      const { error } = await supabase
        .from("projects")
        .update({ forecast_at_completion: fac } as never)
        .eq("id", projectId);
      if (error) throw error;
      return fac;
    },
    onSuccess: (fac) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project_streams"] });
      window.dispatchEvent(new CustomEvent("pmo:data-changed", { detail: { table: "projects" } }));
      toast.success(`FAC reforecast to ${money(fac)}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createFundingRequest = useMutation({
    mutationFn: async () => {
      if (!orgId || !projectId || !health) throw new Error("Missing project");
      const overrun = Math.max(0, Math.round(Number(health.forecast.overrun) || 0));
      const ask =
        overrun > 0
          ? overrun
          : Math.max(
              0,
              Math.round(
                Number(health.forecast.forecastFinalCost) - Number(health.forecast.approvedBudget),
              ) || 0,
            );
      const code = String(project.project_code || "PRJ").trim() || "PRJ";
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const crNumber = `${code}-FU-${stamp}`;
      const title = `Request funding uplift — ${code || project.name}`;
      const rationale = [
        `Health Engine forecast final cost ${money(health.forecast.forecastFinalCost)} vs approved ${money(health.forecast.approvedBudget)}.`,
        ask > 0 ? `Funding ask ${money(ask)}.` : "Confirm funding envelope against forecast.",
        health.forecast.message,
      ]
        .filter(Boolean)
        .join(" ");

      // Primary artefact: Budget change request (Release Register) — mirrors Reduce Scope.
      const { data: cr, error: crErr } = await supabase
        .from("change_requests")
        .insert({
          org_id: orgId,
          project_id: projectId,
          cr_number: crNumber,
          title,
          description: rationale,
          change_type: "Budget",
          impact_scope: ask > 0 ? "High" : "Medium",
          impact_cost: ask > 0 ? ask : null,
          status: "Submitted",
          raised_date: new Date().toISOString().slice(0, 10),
          raised_by: profile?.full_name || profile?.email || null,
          owner: profile?.full_name || profile?.email || null,
          approver: project.sponsor || null,
          notes:
            health.earlyWarnings.map((w) => w.message).filter(Boolean).join("\n") ||
            "Raised from Project Health Engine action layer.",
        } as never)
        .select("id")
        .single();
      if (crErr) throw crErr;

      // Governance record so Approvals / Decisions also show the funding ask.
      const { error: decErr } = await supabase.from("decisions").insert({
        org_id: orgId,
        project_id: projectId,
        program: project.program || null,
        sponsor: project.sponsor || null,
        owner: profile?.full_name || profile?.email || null,
        title,
        description: rationale,
        rationale,
        impact: ask > 0 ? `Funding ask ${money(ask)}` : "Funding confirmation",
        cost_impact: ask > 0 ? ask : null,
        outcome: "Pending",
        status: "Pending",
        decision_date: new Date().toISOString().slice(0, 10),
        notes: `Linked change request ${crNumber}${cr?.id ? ` (${cr.id})` : ""}.`,
      } as never);
      if (decErr) throw decErr;

      return { crNumber, ask };
    },
    onSuccess: ({ crNumber, ask }) => {
      qc.invalidateQueries({ queryKey: ["decisions"] });
      qc.invalidateQueries({ queryKey: ["change_requests"] });
      window.dispatchEvent(new CustomEvent("pmo:data-changed", { detail: { table: "change_requests" } }));
      window.dispatchEvent(new CustomEvent("pmo:data-changed", { detail: { table: "decisions" } }));
      toast.success(
        ask > 0
          ? `Funding request ${crNumber} submitted (${money(ask)})`
          : `Funding request ${crNumber} submitted`,
        {
          description: "Open Release Register or Decisions to review and approve.",
          action: {
            label: "Release Register",
            onClick: () => {
              window.location.href = "/app/release-register";
            },
          },
        },
      );
    },
    onError: (e: Error) => toast.error(e.message || "Could not create funding request"),
  });

  const createScopeCr = useMutation({
    mutationFn: async () => {
      if (!orgId || !projectId || !health) throw new Error("Missing project");
      const code = String(project.project_code || "PRJ").trim() || "PRJ";
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const { error } = await supabase.from("change_requests").insert({
        org_id: orgId,
        project_id: projectId,
        cr_number: `${code}-SC-${stamp}`,
        title: `Reduce scope to protect delivery — ${project.project_code || project.name}`,
        description: `Raised from Project Health Engine (score ${health.score}, ${health.rag}). ${health.predictive.warning || health.forecast.message}`,
        change_type: "Scope",
        status: "Submitted",
        raised_date: new Date().toISOString().slice(0, 10),
        raised_by: profile?.full_name || profile?.email || null,
        owner: profile?.full_name || profile?.email || null,
        impact_cost: health.forecast.overrun > 0 ? -Math.round(health.forecast.overrun) : null,
        impact_schedule_days: health.earlyWarnings[0]?.potentialDelayWeeks
          ? health.earlyWarnings[0].potentialDelayWeeks * 7
          : null,
        impact_scope: "High",
        notes: "Reduce or defer lower-priority deliverables to recover schedule/cost.",
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["change_requests"] });
      window.dispatchEvent(
        new CustomEvent("pmo:data-changed", { detail: { table: "change_requests" } }),
      );
      toast.success("Scope change request submitted", {
        description: "Review it under Release Register.",
        action: {
          label: "Open",
          onClick: () => {
            window.location.href = "/app/release-register";
          },
        },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createDecision = useMutation({
    mutationFn: async () => {
      if (!orgId || !projectId || !health) throw new Error("Missing project");
      const { error } = await supabase.from("decisions").insert({
        org_id: orgId,
        project_id: projectId,
        program: project.program || null,
        sponsor: project.sponsor || null,
        owner: profile?.full_name || profile?.email || null,
        title: `Health recovery decision — ${project.project_code || project.name}`,
        rationale: [
          `Current health ${health.score} (${health.rag}).`,
          health.predictive.warning,
          ...health.drivers.map((d) => `• ${d.label}: ${d.message}`),
        ]
          .filter(Boolean)
          .join("\n"),
        impact: health.forecast.overrun > 0 ? health.forecast.message : null,
        outcome: "Pending",
        status: "Pending",
        decision_date: new Date().toISOString().slice(0, 10),
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decisions"] });
      window.dispatchEvent(new CustomEvent("pmo:data-changed", { detail: { table: "decisions" } }));
      toast.success("Decision created from health insight");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!health) return null;

  const manualRag = String(project.rag || "").trim();
  const showDrop =
    health.previousScore != null &&
    health.scoreDelta != null &&
    health.scoreDelta < 0 &&
    Math.abs(health.scoreDelta) >= 2;

  return (
    <SectionFrame exportName="project-health-engine" exportTitle="Project Health Engine">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-sky-600" />
              Project Health Engine
            </span>
          </SectionTitle>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            Calculated from schedule, financials, scope, delivery, resources, risks, dependencies,
            and benefits — not manual RAG entry.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RagChip
            rag={health.rag}
            label={`Calculated · ${health.rag}`}
            explain={explainRag({
              rag: health.rag,
              engine: health,
              manualRag,
            })}
          />
          {manualRag ? (
            <span className="text-[11px] text-muted-foreground">
              Manual field:{" "}
              <RagChip rag={manualRag} explain={explainRag({ rag: manualRag, manualRag })} />
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[140px_minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col items-center justify-start gap-2 rounded-lg border border-border bg-muted/20 p-3">
          <ScoreRing score={health.score} rag={health.rag} />
          {showDrop ? (
            <p className="text-center text-xs font-medium text-amber-700">
              Health dropped {health.previousScore} → {health.score}
            </p>
          ) : (
            <p className="text-center text-[11px] text-muted-foreground">
              {health.rag === "Green"
                ? "On track"
                : health.rag === "Amber"
                  ? "Needs attention"
                  : "Critical"}
            </p>
          )}
        </div>

        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Gauge className="h-3.5 w-3.5" />
            Dimension scores
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {health.dimensions.map((d) => (
              <DimensionBar
                key={d.key}
                label={d.label}
                weight={d.weight}
                score={d.score}
                rag={d.rag}
                detail={d.detail}
                explain={explainRag({ rag: d.rag, engine: health, dimension: d.key })}
              />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {(showDrop || health.drivers.length > 0) && (
            <div className="rounded-lg border border-border p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Main drivers
              </div>
              {health.drivers.length === 0 ? (
                <p className="text-xs text-muted-foreground">No material health pressures.</p>
              ) : (
                <ul className="space-y-1.5">
                  {health.drivers.map((d) => (
                    <li key={d.dimension} className="flex gap-2 text-xs">
                      <RagChip rag={d.severity} />
                      <span>
                        <span className="font-medium">{d.label}</span> — {d.message}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="rounded-lg border border-border p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Brain className="h-3.5 w-3.5" />
              Predictive health (30 days)
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Current</div>
                <div className="text-lg font-bold tabular-nums">{health.predictive.currentScore}</div>
              </div>
              <ArrowRight className="mb-1.5 h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Forecast</div>
                <div className="text-lg font-bold tabular-nums">
                  {health.predictive.forecastScore30d}{" "}
                      <RagChip rag={health.predictive.likelyRag} explain={explainRag({ rag: health.predictive.likelyRag, engine: health })} />
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Confidence</div>
                <div className="text-lg font-bold tabular-nums">{health.predictive.confidencePct}%</div>
              </div>
            </div>
            {health.predictive.warning ? (
              <p className="mt-2 flex gap-1.5 text-xs font-medium text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {health.predictive.warning}
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Trajectory stable under current trends.
              </p>
            )}
          </div>
        </div>
      </div>

      {health.earlyWarnings.length > 0 ? (
        <div className="mt-4 space-y-2">
          {health.earlyWarnings.map((w) => (
            <div
              key={w.code}
              className={`rounded-lg border px-3 py-2.5 text-sm ${
                w.severity === "Red"
                  ? "border-rose-200 bg-rose-50/80"
                  : "border-amber-200 bg-amber-50/80"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" />
                {w.title}
                <RagChip rag={w.severity} />
              </div>
              <p className="mt-1 text-xs leading-relaxed">{w.message}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                {w.potentialDelayWeeks != null ? (
                  <span>
                    Potential impact:{" "}
                    <strong className="text-foreground">{w.potentialDelayWeeks}-week delay</strong>
                  </span>
                ) : null}
                {w.potentialCostImpact != null ? (
                  <span>
                    Potential cost impact:{" "}
                    <strong className="text-foreground">+{money(w.potentialCostImpact)}</strong>
                  </span>
                ) : null}
                <span>
                  Recommended: <strong className="text-foreground">{w.recommendedAction}</strong>
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="rounded-lg border border-border p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <LineChart className="h-3.5 w-3.5" />
            Automated forecasting
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Approved</div>
              <div className="font-semibold tabular-nums">{money(health.forecast.approvedBudget)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Actual</div>
              <div className="font-semibold tabular-nums">{money(health.forecast.actual)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Remaining</div>
              <div className="font-semibold tabular-nums">
                {money(health.forecast.remainingApproved)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Forecast final</div>
              <div className="font-semibold tabular-nums">
                {money(health.forecast.forecastFinalCost)}
              </div>
            </div>
          </div>
          <p
            className={`mt-2 text-sm font-semibold ${
              health.forecast.overrun > 0 ? "text-rose-700" : "text-emerald-700"
            }`}
          >
            {health.forecast.overrun > 0 ? "🔴 " : ""}
            {health.forecast.message}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Source:{" "}
            {health.forecast.source === "evm_eac"
              ? "Earned value EAC (BAC ÷ CPI)"
              : health.forecast.source === "burn_rate"
                ? "Current burn rate × remaining schedule"
                : health.forecast.source === "stated_fac"
                  ? "Stated forecast at completion"
                  : "Approved funding baseline"}
            {health.forecast.burnRatePerWeek
              ? ` · Burn ~${money(health.forecast.burnRatePerWeek)}/week`
              : ""}
          </p>
        </div>

        <div className="rounded-lg border border-border p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Action layer
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="default"
              disabled={reforecast.isPending}
              onClick={() => {
                if (
                  confirm(
                    `Set forecast at completion to ${money(health.forecast.forecastFinalCost)}?`,
                  )
                ) {
                  reforecast.mutate();
                }
              }}
            >
              Reforecast
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={createScopeCr.isPending}
              onClick={() => createScopeCr.mutate()}
            >
              Reduce Scope
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={createFundingRequest.isPending}
              onClick={() => createFundingRequest.mutate()}
            >
              Request Funding
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={createDecision.isPending}
              onClick={() => createDecision.mutate()}
            >
              Create Decision
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            <strong className="font-medium text-foreground">Reforecast</strong> writes FAC.{" "}
            <strong className="font-medium text-foreground">Reduce Scope</strong> /{" "}
            <strong className="font-medium text-foreground">Request Funding</strong> raise change
            requests (Release Register); funding also drafts a Pending decision.{" "}
            <Link to="/app/release-register" className="text-primary hover:underline">
              Release Register
            </Link>
            {" · "}
            <Link to="/app/decisions" className="text-primary hover:underline">
              Decisions
            </Link>
          </p>
        </div>
      </div>
    </SectionFrame>
  );
}
