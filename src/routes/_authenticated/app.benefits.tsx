import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip, Legend,
} from "recharts";

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

  const sum = (k: string) => projects.reduce((a, p) => a + Number((p as any)[k] || 0), 0);
  const target = sum("benefits_target");
  const realised = sum("benefits_realised");
  const gap = target - realised;
  const realisationRate = target > 0 ? (realised / target) * 100 : 0;

  const rows = projects
    .map((p) => ({
      name: p.name,
      program: p.program || "Unassigned",
      target: Number(p.benefits_target || 0),
      realised: Number(p.benefits_realised || 0),
      gap: Number(p.benefits_target || 0) - Number(p.benefits_realised || 0),
      rate: Number(p.benefits_target || 0) > 0
        ? (Number(p.benefits_realised || 0) / Number(p.benefits_target || 0)) * 100
        : 0,
    }))
    .filter((r) => r.target > 0 || r.realised > 0)
    .sort((a, b) => b.target - a.target);

  const byProgram = Array.from(
    rows.reduce((m: Map<string, { program: string; target: number; realised: number }>, r) => {
      const c = m.get(r.program) || { program: r.program, target: 0, realised: 0 };
      c.target += r.target; c.realised += r.realised;
      m.set(r.program, c);
      return m;
    }, new Map()).values(),
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
        <SectionTitle>Target vs Realised by Program</SectionTitle>
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={byProgram}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
              <XAxis dataKey="program" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => fmt(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="target" fill="#94a3b8" name="Target" />
              <Bar dataKey="realised" fill="#1d4ed8" name="Realised" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Benefits Register</SectionTitle>
        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No benefits data captured yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="st-table">
              <thead>
                <tr>
                  <th>Project</th><th>Program</th>
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

