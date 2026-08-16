import { Link } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SectionFrame, SectionTitle, RagChip, KpiCard } from "@/components/streamlit";
import { ChartLegendList, legendItemsFromCounts } from "@/components/chart-legend-list";
import { ExpandableChart } from "@/components/expandable-chart";
import { RAG_COLORS, CHART_SERIES } from "@/lib/chart-theme";
import { displayRag } from "@/lib/ops-enhancements";
import { projectApprovedFunding, projectForecast, projectIncurred } from "@/lib/project-finance";
import { PageLoading } from "@/components/page-loading";

type SpendPoint = { month: string; actual: number; forecast: number };
type NamedCount = { name: string; value: number };

function money(n: number) {
  return (
    "$" +
    new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0)
  );
}

function pct(n: number, d: number) {
  if (!d) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

function varianceTone(forecast: number, budget: number) {
  if (!budget)
    return { label: "No envelope", rag: null as string | null, cls: "text-muted-foreground" };
  const v = (forecast - budget) / budget;
  if (v > 0.05)
    return { label: `${Math.round(v * 100)}% over budget`, rag: "Red", cls: "text-red-600" };
  if (v > 0.01)
    return { label: `${Math.round(v * 100)}% over budget`, rag: "Amber", cls: "text-amber-600" };
  if (v < -0.05)
    return {
      label: `${Math.round(Math.abs(v) * 100)}% under budget`,
      rag: "Green",
      cls: "text-emerald-700",
    };
  return { label: "On envelope", rag: "Green", cls: "text-emerald-700" };
}

function ragRank(rag: string) {
  const v = (rag || "").toLowerCase();
  if (v === "red") return 0;
  if (v === "amber") return 1;
  return 2;
}

/** IBCS-style bullet: track = budget, fill = incurred, marker = forecast. */
function EnvelopeBullet({
  budget,
  incurred,
  forecast,
}: {
  budget: number;
  incurred: number;
  forecast: number;
}) {
  const max = Math.max(budget, incurred, forecast, 1);
  const w = (n: number) => `${Math.min(100, (n / max) * 100)}%`;
  return (
    <div className="space-y-2">
      <div className="relative h-9 overflow-hidden rounded-md bg-slate-100">
        <div
          className="absolute inset-y-0 left-0 bg-blue-200/80"
          style={{ width: w(budget) }}
          title={`Budget ${money(budget)}`}
        />
        <div
          className="absolute top-1.5 bottom-1.5 left-0 rounded-sm bg-emerald-600"
          style={{ width: w(incurred) }}
          title={`Incurred ${money(incurred)}`}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-amber-500"
          style={{ left: w(forecast) }}
          title={`Forecast ${money(forecast)}`}
        />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-blue-200" /> Budget {money(budget)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" /> Incurred {money(incurred)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-0.5 bg-amber-500" /> Forecast {money(forecast)}
        </span>
      </div>
    </div>
  );
}

type ExecProject = {
  id: string;
  project_code?: string | null;
  name?: string | null;
  status?: string | null;
  end_date?: string | null;
  rag?: string | null;
  rag_override?: string | null;
  budget?: number | null;
  capex_approved?: number | null;
  opex_approved?: number | null;
  capex_incurred?: number | null;
  opex_incurred?: number | null;
  forecast_at_completion?: number | null;
};

export function ExecutiveQuickView({
  filtered,
  approvedFunding,
  totalIncurred,
  totalForecast,
  remaining,
  ragData,
  monthlySpend,
  segmentation,
  loading,
}: {
  filtered: ExecProject[];
  approvedFunding: number;
  totalIncurred: number;
  totalForecast: number;
  remaining: number;
  ragData: NamedCount[];
  monthlySpend: SpendPoint[];
  segmentation: NamedCount[];
  loading?: boolean;
}) {
  const green = filtered.filter((p) => displayRag(p) === "Green").length;
  const amber = filtered.filter((p) => displayRag(p) === "Amber").length;
  const red = filtered.filter((p) => displayRag(p) === "Red").length;
  const today = new Date();
  const overdue = filtered.filter(
    (p) => p.end_date && new Date(p.end_date) < today && p.status !== "Completed",
  );
  const envelope = varianceTone(totalForecast, approvedFunding);
  const spendOfBudget = pct(totalIncurred, approvedFunding);
  const ragScore = filtered.length ? Math.round((green / filtered.length) * 100) : 0;

  const watch = [...filtered]
    .map((p) => {
      const rag = displayRag(p) || "";
      const isOverdue = !!(p.end_date && new Date(p.end_date) < today && p.status !== "Completed");
      const budget = projectApprovedFunding(p);
      const fac = projectForecast(p);
      const incurred = projectIncurred(p);
      return { p, rag, isOverdue, budget, fac, incurred };
    })
    .filter((x) => x.rag === "Red" || x.rag === "Amber" || x.isOverdue)
    .sort((a, b) => {
      const r = ragRank(a.rag) - ragRank(b.rag);
      if (r !== 0) return r;
      return b.fac - b.budget - (a.fac - a.budget);
    })
    .slice(0, 8);

  const headline =
    filtered.length === 0
      ? "No projects in this filter."
      : red > 0
        ? `${red} project${red === 1 ? "" : "s"} are Red — start there. Forecast is ${envelope.label.toLowerCase()}.`
        : amber > 0
          ? `${amber} Amber to watch. Portfolio is ${ragScore}% Green. Forecast is ${envelope.label.toLowerCase()}.`
          : `Portfolio is ${ragScore}% Green. Forecast is ${envelope.label.toLowerCase()}.`;

  if (loading) {
    return <PageLoading label="Loading executive snapshot…" fullScreen={false} />;
  }

  return (
    <div className="space-y-4">
      <SectionFrame>
        <p className="text-base font-medium leading-relaxed text-foreground">{headline}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {filtered.length} project{filtered.length === 1 ? "" : "s"} in view · {overdue.length}{" "}
          overdue · spend {spendOfBudget} of budget. Detailed charts, timeline, and project packs
          stay on Detailed info.
        </p>
      </SectionFrame>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Budget"
          value={money(approvedFunding)}
          sub="Approved envelope"
          accent="#1d4ed8"
        />
        <KpiCard
          label="Incurred"
          value={money(totalIncurred)}
          sub={`${spendOfBudget} of budget · ${money(remaining)} left`}
          accent="#15803d"
        />
        <KpiCard
          label="Forecast (FAC)"
          value={money(totalForecast)}
          sub={<span className={envelope.cls}>{envelope.label}</span>}
          accent="#d97706"
        />
        <KpiCard
          label="Health"
          value={`${ragScore}% Green`}
          sub={`${red} Red · ${amber} Amber · ${green} Green`}
          accent={red ? "#dc2626" : amber ? "#d97706" : "#15803d"}
        />
      </div>

      <SectionFrame>
        <SectionTitle>Where the money sits</SectionTitle>
        <EnvelopeBullet
          budget={approvedFunding}
          incurred={totalIncurred}
          forecast={totalForecast}
        />
      </SectionFrame>

      <div className="grid gap-4 lg:grid-cols-2">
        {ragData.length === 0 ? (
          <SectionFrame>
            <SectionTitle>Portfolio health</SectionTitle>
            <p className="py-8 text-center text-sm text-muted-foreground">No RAG data</p>
          </SectionFrame>
        ) : (
          <ExpandableChart
            title="Portfolio health"
            heightClass="h-52"
            legend={
              <ChartLegendList items={legendItemsFromCounts(ragData, RAG_COLORS)} columns={1} />
            }
          >
            <PieChart>
              <Pie
                data={ragData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="52%"
                outerRadius="78%"
                paddingAngle={2}
                stroke="#fff"
                strokeWidth={2}
              >
                {ragData.map((e) => (
                  <Cell key={e.name} fill={RAG_COLORS[e.name]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number | string) => [`${v} projects`]} />
            </PieChart>
          </ExpandableChart>
        )}

        {monthlySpend.length === 0 ? (
          <SectionFrame>
            <SectionTitle>Spend vs forecast</SectionTitle>
            <p className="py-8 text-center text-sm text-muted-foreground">
              No monthly cashflow yet
            </p>
          </SectionFrame>
        ) : (
          <ExpandableChart title="Spend vs forecast (last 12 months)" heightClass="h-52">
            <LineChart data={monthlySpend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
              <XAxis dataKey="month" fontSize={11} />
              <YAxis fontSize={10} tickFormatter={(v) => `$${v}M`} />
              <Tooltip
                formatter={(v: number | string, n: string | number) => [
                  `$${Number(v).toFixed(2)}M`,
                  String(n),
                ]}
              />
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#15803d"
                strokeWidth={2.2}
                name="Actual"
                dot={{ r: 2.5 }}
              />
              <Line
                type="monotone"
                dataKey="forecast"
                stroke="#d97706"
                strokeWidth={2}
                strokeDasharray="5 4"
                name="Forecast"
                dot={{ r: 2.5 }}
              />
            </LineChart>
          </ExpandableChart>
        )}
      </div>

      {segmentation.length === 0 ? (
        <SectionFrame>
          <SectionTitle>Why we invest (Strategic Alignment)</SectionTitle>
          <p className="py-6 text-center text-sm text-muted-foreground">No alignment tags</p>
        </SectionFrame>
      ) : (
        <ExpandableChart title="Why we invest (Strategic Alignment)" heightClass="h-48">
          <BarChart data={segmentation} margin={{ top: 20, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
            <XAxis dataKey="name" fontSize={11} />
            <YAxis fontSize={10} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Projects">
              {segmentation.map((_, i) => (
                <Cell key={i} fill={CHART_SERIES[i % CHART_SERIES.length]} />
              ))}
            </Bar>
          </BarChart>
        </ExpandableChart>
      )}

      <SectionFrame>
        <div className="mb-2 flex items-end justify-between gap-2">
          <SectionTitle>Needs attention</SectionTitle>
          <Link
            to="/app/executive"
            search={{ tab: "overview" }}
            className="text-xs font-medium text-primary hover:underline"
          >
            Open detailed info
          </Link>
        </div>
        {watch.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            Nothing Red, Amber, or overdue in this filter.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="st-table text-xs">
              <thead>
                <tr>
                  <th className="text-left">Project</th>
                  <th className="text-left">RAG</th>
                  <th className="text-right">Budget</th>
                  <th className="text-right">Incurred</th>
                  <th className="text-right">Forecast</th>
                  <th className="text-left">Flag</th>
                </tr>
              </thead>
              <tbody>
                {watch.map(({ p, rag, isOverdue, budget, fac, incurred }) => (
                  <tr key={p.id}>
                    <td className="text-left">
                      <Link
                        to="/app/projects/$id"
                        params={{ id: p.id }}
                        className="font-medium text-primary hover:underline"
                      >
                        {p.project_code} · {p.name}
                      </Link>
                    </td>
                    <td className="text-left">
                      <RagChip rag={rag} />
                    </td>
                    <td className="text-right tabular-nums">{money(budget)}</td>
                    <td className="text-right tabular-nums">{money(incurred)}</td>
                    <td className="text-right tabular-nums">{money(fac)}</td>
                    <td className="text-left text-muted-foreground">
                      {rag === "Red" ? "Off track" : rag === "Amber" ? "Watch" : null}
                      {isOverdue
                        ? rag === "Red" || rag === "Amber"
                          ? " · overdue"
                          : "Overdue"
                        : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionFrame>
    </div>
  );
}
