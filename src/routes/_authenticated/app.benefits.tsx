import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { ExpandableChart } from "@/components/expandable-chart";
import { sumBenefitsTarget, sumBenefitsRealised } from "@/lib/project-finance";

export const Route = createFileRoute("/_authenticated/app/benefits")({
  component: BenefitsPage,
});

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;

function BenefitsPage() {
  const { organization } = useAuth();
  const { data: projects = [] } = useQuery({
    queryKey: ["projects", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*");
      if (error) throw error;
      return data;
    },
    enabled: !!organization,
  });

  const { data: benefits = [] } = useQuery({
    queryKey: ["benefits", organization?.id],
    queryFn: async () => (await supabase.from("benefits").select("*")).data ?? [],
    enabled: !!organization,
  });

  // Prefer summing register lines per project; fall back to project rollups.
  const rows = useMemo(
    () =>
      projects
        .map((p) => {
          const target = sumBenefitsTarget(benefits, p, p.id);
          const realised = sumBenefitsRealised(benefits, p, p.id);
          return {
            name: p.name,
            program: p.program || "Unassigned",
            target,
            realised,
            gap: target - realised,
            rate: target > 0 ? (realised / target) * 100 : 0,
          };
        })
        .filter((r) => r.target > 0 || r.realised > 0)
        .sort((a, b) => b.target - a.target),
    [projects, benefits],
  );

  const target = rows.reduce((s, r) => s + r.target, 0);
  const realised = rows.reduce((s, r) => s + r.realised, 0);
  const gap = target - realised;
  const realisationRate = target > 0 ? (realised / target) * 100 : 0;

  const byProgram = Array.from(
    rows
      .reduce((m: Map<string, { program: string; target: number; realised: number }>, r) => {
        const c = m.get(r.program) || { program: r.program, target: 0, realised: 0 };
        c.target += r.target;
        c.realised += r.realised;
        m.set(r.program, c);
        return m;
      }, new Map())
      .values(),
  );

  return (
    <PageExport name="Benefits_Realisation" title="Benefits Realisation">
      <PageHeading icon="🎁">Benefits Realisation</PageHeading>

      <SectionFrame>
        <SectionTitle>Benefits KPIs</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Target Benefits" value={fmt(target)} />
          <KpiCard label="Realised" value={fmt(realised)} />
          <KpiCard label="Gap" value={fmt(gap)} />
          <KpiCard label="Realisation Rate" value={`${realisationRate.toFixed(1)}%`} />
        </div>
      </SectionFrame>

      <SectionFrame>
        <ExpandableChart title="Target vs Realised by Program" heightClass="h-72">
          <BarChart data={byProgram}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
            <XAxis dataKey="program" fontSize={11} />
            <YAxis fontSize={11} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: any) => fmt(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="target" fill="#94a3b8" name="Target" />
            <Bar dataKey="realised" fill="#1d4ed8" name="Realised" />
          </BarChart>
        </ExpandableChart>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Benefits Register</SectionTitle>
        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No benefits data captured yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="st-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Program</th>
                  <th className="text-right">Target</th>
                  <th className="text-right">Realised</th>
                  <th className="text-right">Gap</th>
                  <th className="text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name}>
                    <td className="font-medium">{r.name}</td>
                    <td>{r.program}</td>
                    <td className="text-right tabular-nums">{fmt(r.target)}</td>
                    <td className="text-right tabular-nums">{fmt(r.realised)}</td>
                    <td className="text-right tabular-nums">{fmt(r.gap)}</td>
                    <td className="text-right tabular-nums">{r.rate.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionFrame>
    </PageExport>
  );
}
