import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import { PageLoading } from "@/components/page-loading";
import { isColdLoading } from "@/lib/query-ui";
import {
  PROJECT_PORTFOLIO_SELECT,
  STAGE_GATES_SELECT,
  DECISIONS_SELECT,
} from "@/lib/query-selects";
import { PROJECT_OPS_EXTRAS } from "@/lib/project-selects";
import { loadGovernanceChannels } from "@/lib/governance-forums";
import {
  buildInvestmentCommitteePack,
  pickInvestmentCommitteeChannel,
  type FundingGateAsk,
  type IcDecision,
  type IcDemandAsk,
  type IcProject,
} from "@/lib/investment-committee";
import { DECISION_OUTCOME_CLASS, decisionOutcome } from "@/lib/decision-approval";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";
import { compareProjectsByCodeName } from "@/lib/project-sort";

export const Route = createFileRoute("/_authenticated/app/investment-committee")({
  head: () => ({
    meta: [
      { title: "Investment Committee — PMO Enterprise" },
      {
        name: "description",
        content:
          "Capital decision pack: demand asks, funding gates, ranked investments, and IC decisions.",
      },
    ],
  }),
  component: InvestmentCommitteePage,
});

function money(n: number) {
  return (
    "$" +
    new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0)
  );
}

function fmtDate(v?: string | null) {
  if (!v) return "—";
  return String(v).slice(0, 10);
}

function InvestmentCommitteePage() {
  const { organization } = useAuth();
  const orgId = organization?.id;

  const channelsQ = useQuery({
    queryKey: ["governance_channels", orgId],
    queryFn: () => loadGovernanceChannels(),
    enabled: !!orgId,
  });

  const projectsQ = useQuery({
    queryKey: ["projects", orgId, "investment-committee"],
    queryFn: async () => {
      const wide = await supabase
        .from("projects")
        .select(`${PROJECT_PORTFOLIO_SELECT},${PROJECT_OPS_EXTRAS}` as "*");
      if (!wide.error) return (wide.data ?? []) as IcProject[];
      const { data } = await supabase.from("projects").select(PROJECT_PORTFOLIO_SELECT as "*");
      return (data ?? []) as IcProject[];
    },
    enabled: !!orgId,
  });

  const demandQ = useQuery({
    queryKey: ["demand_pipeline", orgId, "ic"],
    queryFn: async () => {
      const wide = await supabase
        .from("demand_pipeline")
        .select(
          "id,idea_name,status,sponsor,estimated_cost,estimated_benefit,estimated_roi,submitted_date,project_id" as "*",
        )
        .order("submitted_date", { ascending: false });
      if (!wide.error) return (wide.data ?? []) as IcDemandAsk[];
      const { data, error } = await supabase
        .from("demand_pipeline")
        .select(
          "id,idea_name,status,sponsor,estimated_cost,estimated_benefit,estimated_roi,submitted_date",
        )
        .order("submitted_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as IcDemandAsk[];
    },
    enabled: !!orgId,
  });

  const gatesQ = useQuery({
    queryKey: ["stage_gates", orgId, "ic"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_gates")
        .select(STAGE_GATES_SELECT as "*")
        .order("planned_date");
      if (error) throw error;
      return (data ?? []) as FundingGateAsk[];
    },
    enabled: !!orgId,
  });

  const decisionsQ = useQuery({
    queryKey: ["decisions", orgId, "ic"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("decisions")
        .select(DECISIONS_SELECT as "*")
        .order("decision_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as IcDecision[];
    },
    enabled: !!orgId,
  });

  const benefitsQ = useQuery({
    queryKey: ["benefits", orgId, "payback"],
    queryFn: async () => {
      const { data, error } = await supabase.from("benefits").select("project_id,payback_months");
      if (error) return [];
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const depsQ = useQuery({
    queryKey: ["dependencies", orgId, "ic"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dependencies")
        .select("project_id,depends_on_project_id,status");
      if (error) return [];
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const icChannel = useMemo(
    () => pickInvestmentCommitteeChannel(channelsQ.data?.channels ?? []),
    [channelsQ.data],
  );
  const channelNames = useMemo(() => {
    const names = (channelsQ.data?.channels ?? [])
      .map((c) => c.name)
      .filter((n): n is string => Boolean(n));
    return names.length ? names.filter((n) => /investment\s*committee|^ic$/i.test(n)) : [];
  }, [channelsQ.data]);

  const projectById = useMemo(() => {
    const m = new Map<string, IcProject>();
    for (const p of projectsQ.data ?? []) m.set(p.id, p);
    return m;
  }, [projectsQ.data]);

  const pack = useMemo(
    () =>
      buildInvestmentCommitteePack({
        projects: projectsQ.data ?? [],
        demand: demandQ.data ?? [],
        gates: gatesQ.data ?? [],
        decisions: decisionsQ.data ?? [],
        benefits: benefitsQ.data as Array<{ project_id?: string; payback_months?: number | null }>,
        dependencies: (depsQ.data ?? []).flatMap((d) =>
          d.project_id && d.depends_on_project_id
            ? [
                {
                  project_id: d.project_id,
                  depends_on_project_id: d.depends_on_project_id,
                  status: d.status ?? undefined,
                },
              ]
            : [],
        ),
        channelNames: channelNames.length ? channelNames : undefined,
      }),
    [
      projectsQ.data,
      demandQ.data,
      gatesQ.data,
      decisionsQ.data,
      benefitsQ.data,
      depsQ.data,
      channelNames,
    ],
  );

  const demandColumns: ColumnarColumn<IcDemandAsk>[] = useMemo(
    () => [
      { key: "idea_name", label: "Idea", getValue: (r) => r.idea_name },
      { key: "status", label: "Stage", getValue: (r) => r.status },
      { key: "sponsor", label: "Sponsor", getValue: (r) => r.sponsor },
      {
        key: "estimated_cost",
        label: "Est. cost",
        getValue: (r) => money(Number(r.estimated_cost || 0)),
        getSortValue: (r) => Number(r.estimated_cost || 0),
      },
      {
        key: "estimated_benefit",
        label: "Est. benefit",
        getValue: (r) => money(Number(r.estimated_benefit || 0)),
        getSortValue: (r) => Number(r.estimated_benefit || 0),
      },
      { key: "submitted_date", label: "Submitted", getValue: (r) => fmtDate(r.submitted_date) },
    ],
    [],
  );
  const demandTable = useColumnarTable(pack.demandAsks, demandColumns);

  type GateRow = FundingGateAsk & { _project: string; _code: string };
  const gateRows = useMemo<GateRow[]>(
    () =>
      pack.fundingAsks
        .map((g) => {
          const p = projectById.get(g.project_id);
          return {
            ...g,
            _project: p?.name || "Project",
            _code: p?.project_code || "",
          };
        })
        .sort((a, b) =>
          compareProjectsByCodeName(
            { project_code: a._code, name: a._project },
            { project_code: b._code, name: b._project },
          ),
        ),
    [pack.fundingAsks, projectById],
  );
  const gateColumns: ColumnarColumn<GateRow>[] = useMemo(
    () => [
      { key: "_code", label: "Code", getValue: (r) => r._code },
      { key: "_project", label: "Project", getValue: (r) => r._project },
      { key: "gate_name", label: "Gate" },
      { key: "status", label: "Status" },
      { key: "planned_date", label: "Planned", getValue: (r) => fmtDate(r.planned_date) },
    ],
    [],
  );
  const gateTable = useColumnarTable(gateRows, gateColumns);

  type RankRow = (typeof pack.ranked)[number] & { _rank: number; _code: string };
  const rankRows = useMemo<RankRow[]>(
    () =>
      pack.ranked.slice(0, 15).map((r, i) => ({
        ...r,
        _rank: i + 1,
        _code: projectById.get(r.projectId)?.project_code || "",
      })),
    [pack.ranked, projectById],
  );
  const rankColumns: ColumnarColumn<RankRow>[] = useMemo(
    () => [
      { key: "_rank", label: "Rank", filterable: false, getSortValue: (r) => r._rank },
      { key: "_code", label: "Code" },
      { key: "label", label: "Project" },
      {
        key: "investment",
        label: "Investment",
        getValue: (r) => money(r.investment),
        getSortValue: (r) => r.investment,
      },
      {
        key: "expectedBenefit",
        label: "Benefit",
        getValue: (r) => money(r.expectedBenefit),
        getSortValue: (r) => r.expectedBenefit,
      },
      {
        key: "roi",
        label: "ROI",
        getValue: (r) => `${r.roi.toFixed(0)}%`,
        getSortValue: (r) => r.roi,
      },
      { key: "risk", label: "Risk" },
      {
        key: "score",
        label: "Score",
        getValue: (r) => r.score.toFixed(0),
        getSortValue: (r) => r.score,
      },
    ],
    [],
  );
  const rankTable = useColumnarTable(rankRows, rankColumns);

  type SpendRow = (typeof pack.spend)[number];
  const spendColumns: ColumnarColumn<SpendRow>[] = useMemo(
    () => [
      { key: "code", label: "Code", getValue: (r) => r.code },
      { key: "label", label: "Project" },
      {
        key: "budget",
        label: "Budget",
        getValue: (r) => money(r.budget),
        getSortValue: (r) => r.budget,
      },
      {
        key: "forecast",
        label: "Forecast",
        getValue: (r) => money(r.forecast),
        getSortValue: (r) => r.forecast,
      },
      {
        key: "incurred",
        label: "Actual",
        getValue: (r) => money(r.incurred),
        getSortValue: (r) => r.incurred,
      },
      {
        key: "remaining",
        label: "Remaining",
        getValue: (r) => money(r.remaining),
        getSortValue: (r) => r.remaining,
      },
    ],
    [],
  );
  const spendTable = useColumnarTable(pack.spend, spendColumns);

  type DecRow = IcDecision & { _project: string; _outcome: string };
  const decRows = useMemo<DecRow[]>(
    () =>
      pack.decisions.map((d) => ({
        ...d,
        _project: projectById.get(d.project_id || "")?.name || "—",
        _outcome: decisionOutcome(d),
      })),
    [pack.decisions, projectById],
  );
  const decColumns: ColumnarColumn<DecRow>[] = useMemo(
    () => [
      { key: "raid_code", label: "ID", getValue: (r) => r.raid_code },
      { key: "_project", label: "Project" },
      { key: "title", label: "Decision" },
      { key: "forum", label: "Forum" },
      { key: "_outcome", label: "Outcome" },
      { key: "sponsor", label: "Sponsor", getValue: (r) => r.sponsor },
      { key: "decision_date", label: "Date", getValue: (r) => fmtDate(r.decision_date) },
    ],
    [],
  );
  const decTable = useColumnarTable(decRows, decColumns);

  const loading =
    isColdLoading(projectsQ) ||
    isColdLoading(demandQ) ||
    isColdLoading(gatesQ) ||
    isColdLoading(decisionsQ);
  if (loading) return <PageLoading label="Loading Investment Committee pack…" />;

  const t = pack.totals;
  const spendRatio = t.budget > 0 ? (t.incurred / t.budget) * 100 : 0;

  return (
    <PageExport name="Investment_Committee" title="Investment Committee">
      <PageHeading
        icon="🏛"
        title="Investment Committee"
        subtitle="Capital decision pack — not a second projects list. Demand, funding gates, ranked investments, and RAID decisions assigned to this forum. Cadence, chair, and members stay on Governance Channel."
        actions={
          <div className="flex flex-wrap gap-2 text-xs">
            <Link
              to="/app/governance-channels"
              className="rounded-md border border-border px-2 py-1 hover:bg-muted"
            >
              Governance Channel
            </Link>
            <Link
              to="/app/demand-pipeline"
              className="rounded-md border border-border px-2 py-1 hover:bg-muted"
            >
              Demand Pipeline
            </Link>
            <Link
              to="/app/stage-gates"
              className="rounded-md border border-border px-2 py-1 hover:bg-muted"
            >
              Stage Gates
            </Link>
            <Link
              to="/app/prioritisation"
              className="rounded-md border border-border px-2 py-1 hover:bg-muted"
            >
              Prioritisation
            </Link>
            <Link
              to="/app/decisions"
              className="rounded-md border border-border px-2 py-1 hover:bg-muted"
            >
              Decisions
            </Link>
          </div>
        }
      />

      <SectionFrame>
        <SectionTitle>Forum</SectionTitle>
        {icChannel ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 text-sm">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Name
              </div>
              <div className="mt-0.5 font-medium">{icChannel.name}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Cadence
              </div>
              <div className="mt-0.5">{icChannel.cadence || "—"}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Chair
              </div>
              <div className="mt-0.5">{icChannel.chair || "—"}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Last meeting
              </div>
              <div className="mt-0.5">{fmtDate(icChannel.last_meeting)}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Next meeting
              </div>
              <div className="mt-0.5">{fmtDate(icChannel.next_meeting)}</div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No Investment Committee forum yet. Create one on{" "}
            <Link
              to="/app/governance-channels"
              className="font-medium text-primary hover:underline"
            >
              Governance Channel
            </Link>{" "}
            (org-wide, Strategic Alignment scope) so cadence, chair, and members live in one place.
            This pack still reads live demand, gates, spend, and decisions.
          </p>
        )}
        {icChannel?.purpose ? (
          <p className="mt-2 text-xs text-muted-foreground">{icChannel.purpose}</p>
        ) : null}
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>This cycle</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Demand asks" value={t.demandAskCount} accent="#8b5cf6" />
          <KpiCard label="Funding gates" value={t.fundingAskCount} accent="#f59e0b" />
          <KpiCard label="IC decisions awaiting" value={t.awaitingDecisionCount} accent="#0ea5e9" />
          <KpiCard label="In-flight budget" value={money(t.budget)} accent="#3b82f6" />
          <KpiCard label="Forecast" value={money(t.forecast)} accent="#06b6d4" />
          <KpiCard
            label="Actual / budget"
            value={`${spendRatio.toFixed(0)}%`}
            sub={money(t.incurred)}
            accent={spendRatio > 100 ? "#ef4444" : "#22c55e"}
          />
        </div>
      </SectionFrame>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionFrame>
          <SectionTitle>Demand asks</SectionTitle>
          <p className="mb-2 text-xs text-muted-foreground">
            Ideas still in the pipeline (not yet converted to a project). Same rows as Demand
            Pipeline.
          </p>
          <ColumnarToolbar
            globalQ={demandTable.globalQ}
            onGlobalQ={demandTable.setGlobalQ}
            shown={demandTable.rows.length}
            total={demandTable.total}
            dirty={demandTable.isDirty}
            onClear={demandTable.clearAll}
            placeholder="Search demand…"
          />
          <div className="st-table-wrap overflow-x-auto">
            <table className="st-table min-w-[640px] text-xs">
              <thead>
                <tr>
                  {demandColumns.map((col) => (
                    <ColumnarTh
                      key={col.key}
                      column={col}
                      filter={demandTable.filters[col.key]}
                      onFilter={(v) => demandTable.setColumnFilter(col.key, v)}
                      sortKey={demandTable.sortKey}
                      sortDir={demandTable.sortDir}
                      onToggleSort={demandTable.toggleSort}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {demandTable.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={demandColumns.length}
                      className="py-6 text-center text-muted-foreground"
                    >
                      No open demand asks
                    </td>
                  </tr>
                ) : (
                  demandTable.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="font-medium">{r.idea_name}</td>
                      <td>{r.status}</td>
                      <td>{r.sponsor || "—"}</td>
                      <td className="st-num tabular-nums">
                        {money(Number(r.estimated_cost || 0))}
                      </td>
                      <td className="st-num tabular-nums">
                        {money(Number(r.estimated_benefit || 0))}
                      </td>
                      <td className="tabular-nums">{fmtDate(r.submitted_date)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionFrame>

        <SectionFrame>
          <SectionTitle>Funding gates awaiting</SectionTitle>
          <p className="mb-2 text-xs text-muted-foreground">
            Seed / Full Funding and Business Case gates still Pending, In Review, or On Hold. Status
            is the same value as Stage Gates.
          </p>
          <ColumnarToolbar
            globalQ={gateTable.globalQ}
            onGlobalQ={gateTable.setGlobalQ}
            shown={gateTable.rows.length}
            total={gateTable.total}
            dirty={gateTable.isDirty}
            onClear={gateTable.clearAll}
            placeholder="Search gates…"
          />
          <div className="st-table-wrap overflow-x-auto">
            <table className="st-table min-w-[640px] text-xs">
              <thead>
                <tr>
                  {gateColumns.map((col) => (
                    <ColumnarTh
                      key={col.key}
                      column={col}
                      filter={gateTable.filters[col.key]}
                      onFilter={(v) => gateTable.setColumnFilter(col.key, v)}
                      sortKey={gateTable.sortKey}
                      sortDir={gateTable.sortDir}
                      onToggleSort={gateTable.toggleSort}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {gateTable.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={gateColumns.length}
                      className="py-6 text-center text-muted-foreground"
                    >
                      No funding gates waiting
                    </td>
                  </tr>
                ) : (
                  gateTable.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="font-mono">{r._code || "—"}</td>
                      <td>
                        <Link
                          to="/app/projects/$id"
                          params={{ id: r.project_id }}
                          className="font-medium text-primary hover:underline"
                        >
                          {r._project}
                        </Link>
                      </td>
                      <td>{r.gate_name}</td>
                      <td>{r.status || "Pending"}</td>
                      <td className="tabular-nums">{fmtDate(r.planned_date)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionFrame>
      </div>

      <SectionFrame>
        <SectionTitle>Ranked investments</SectionTitle>
        <p className="mb-2 text-xs text-muted-foreground">
          Same scoring engine as Prioritisation (strategic, ROI, payback, risk). Not a second
          register — scores recompute from live project finance and benefits.
        </p>
        <ColumnarToolbar
          globalQ={rankTable.globalQ}
          onGlobalQ={rankTable.setGlobalQ}
          shown={rankTable.rows.length}
          total={rankTable.total}
          dirty={rankTable.isDirty}
          onClear={rankTable.clearAll}
          placeholder="Search ranked investments…"
        />
        <div className="st-table-wrap overflow-x-auto">
          <table className="st-table min-w-[860px] text-xs">
            <thead>
              <tr>
                {rankColumns.map((col) => (
                  <ColumnarTh
                    key={col.key}
                    column={col}
                    filter={rankTable.filters[col.key]}
                    onFilter={(v) => rankTable.setColumnFilter(col.key, v)}
                    sortKey={rankTable.sortKey}
                    sortDir={rankTable.sortDir}
                    onToggleSort={rankTable.toggleSort}
                    align={
                      ["investment", "expectedBenefit", "roi", "score", "_rank"].includes(col.key)
                        ? "right"
                        : "left"
                    }
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {rankTable.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={rankColumns.length}
                    className="py-6 text-center text-muted-foreground"
                  >
                    No in-scope projects
                  </td>
                </tr>
              ) : (
                rankTable.rows.map((r) => (
                  <tr key={r.projectId}>
                    <td className="st-num tabular-nums">{r._rank}</td>
                    <td className="font-mono">{r._code || "—"}</td>
                    <td>
                      <Link
                        to="/app/projects/$id"
                        params={{ id: r.projectId }}
                        className="font-medium text-primary hover:underline"
                      >
                        {r.label}
                      </Link>
                    </td>
                    <td className="st-num tabular-nums">{money(r.investment)}</td>
                    <td className="st-num tabular-nums">{money(r.expectedBenefit)}</td>
                    <td className="st-num tabular-nums">{r.roi.toFixed(0)}%</td>
                    <td>{r.risk}</td>
                    <td className="st-num tabular-nums font-semibold">{r.score.toFixed(0)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>In-flight spend vs budget / forecast</SectionTitle>
        <p className="mb-2 text-xs text-muted-foreground">
          Live project finance layers: Budget (approved funding), Forecast (FAC), Actual (incurred).
          Closed projects are excluded.
        </p>
        <ColumnarToolbar
          globalQ={spendTable.globalQ}
          onGlobalQ={spendTable.setGlobalQ}
          shown={spendTable.rows.length}
          total={spendTable.total}
          dirty={spendTable.isDirty}
          onClear={spendTable.clearAll}
          placeholder="Search spend…"
        />
        <div className="st-table-wrap overflow-x-auto">
          <table className="st-table min-w-[760px] text-xs">
            <thead>
              <tr>
                {spendColumns.map((col) => (
                  <ColumnarTh
                    key={col.key}
                    column={col}
                    filter={spendTable.filters[col.key]}
                    onFilter={(v) => spendTable.setColumnFilter(col.key, v)}
                    sortKey={spendTable.sortKey}
                    sortDir={spendTable.sortDir}
                    onToggleSort={spendTable.toggleSort}
                    align={col.key === "code" || col.key === "label" ? "left" : "right"}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {spendTable.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={spendColumns.length}
                    className="py-6 text-center text-muted-foreground"
                  >
                    No in-flight projects
                  </td>
                </tr>
              ) : (
                spendTable.rows.map((r) => (
                  <tr key={r.projectId}>
                    <td className="font-mono">{r.code || "—"}</td>
                    <td>
                      <Link
                        to="/app/projects/$id"
                        params={{ id: r.projectId }}
                        className="font-medium text-primary hover:underline"
                      >
                        {r.label}
                      </Link>
                    </td>
                    <td className="st-num tabular-nums">{money(r.budget)}</td>
                    <td className="st-num tabular-nums">{money(r.forecast)}</td>
                    <td className="st-num tabular-nums">{money(r.incurred)}</td>
                    <td
                      className={
                        "st-num tabular-nums " +
                        (r.remaining < 0 ? "text-red-600" : "text-emerald-700")
                      }
                    >
                      {money(r.remaining)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Decisions assigned to IC</SectionTitle>
        <p className="mb-2 text-xs text-muted-foreground">
          RAID decisions whose forum matches Investment Committee. Changing outcome on the Decisions
          page is what records the IC result — this view does not keep a second log.
        </p>
        <ColumnarToolbar
          globalQ={decTable.globalQ}
          onGlobalQ={decTable.setGlobalQ}
          shown={decTable.rows.length}
          total={decTable.total}
          dirty={decTable.isDirty}
          onClear={decTable.clearAll}
          placeholder="Search IC decisions…"
        />
        <div className="st-table-wrap overflow-x-auto">
          <table className="st-table min-w-[820px] text-xs">
            <thead>
              <tr>
                {decColumns.map((col) => (
                  <ColumnarTh
                    key={col.key}
                    column={col}
                    filter={decTable.filters[col.key]}
                    onFilter={(v) => decTable.setColumnFilter(col.key, v)}
                    sortKey={decTable.sortKey}
                    sortDir={decTable.sortDir}
                    onToggleSort={decTable.toggleSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {decTable.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={decColumns.length}
                    className="py-6 text-center text-muted-foreground"
                  >
                    No decisions tagged to Investment Committee. Set forum on the Decisions page.
                  </td>
                </tr>
              ) : (
                decTable.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="font-mono">{r.raid_code || "—"}</td>
                    <td>
                      {r.project_id ? (
                        <Link
                          to="/app/projects/$id"
                          params={{ id: r.project_id }}
                          className="font-medium text-primary hover:underline"
                        >
                          {r._project}
                        </Link>
                      ) : (
                        r._project
                      )}
                    </td>
                    <td className="font-medium">{r.title}</td>
                    <td>{r.forum || "—"}</td>
                    <td>
                      <span
                        className={
                          "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                          (DECISION_OUTCOME_CLASS[
                            r._outcome as keyof typeof DECISION_OUTCOME_CLASS
                          ] || "")
                        }
                      >
                        {r._outcome}
                      </span>
                    </td>
                    <td>{r.sponsor || r.decided_by || "—"}</td>
                    <td className="tabular-nums">{fmtDate(r.decision_date)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionFrame>
    </PageExport>
  );
}
