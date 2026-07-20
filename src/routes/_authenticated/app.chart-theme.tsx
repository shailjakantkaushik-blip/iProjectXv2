import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";
import { Button } from "@/components/ui/button";
import { useAuth, isAdmin } from "@/lib/auth-context";
import {
  PALETTES, DEFAULT_PALETTE, loadStoredTheme, saveStoredTheme, applyChartTheme,
  resolvedTokens, type ChartTokenKey,
} from "@/lib/chart-theme";
import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Cell, Tooltip,
} from "recharts";
import { toast } from "sonner";
import { RotateCcw, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/chart-theme")({
  component: ChartThemePage,
});

const TOKEN_GROUPS: { title: string; keys: { key: ChartTokenKey; label: string }[] }[] = [
  {
    title: "RAG status",
    keys: [
      { key: "rag-green", label: "Green" },
      { key: "rag-amber", label: "Amber" },
      { key: "rag-red", label: "Red" },
    ],
  },
  {
    title: "Priority",
    keys: [
      { key: "priority-critical", label: "Critical" },
      { key: "priority-high", label: "High" },
      { key: "priority-medium", label: "Medium" },
      { key: "priority-low", label: "Low" },
    ],
  },
  {
    title: "Stage gate status",
    keys: [
      { key: "status-approved", label: "Approved" },
      { key: "status-review", label: "In Review" },
      { key: "status-pending", label: "Pending" },
      { key: "status-hold", label: "On Hold" },
      { key: "status-rejected", label: "Rejected" },
    ],
  },
  {
    title: "Dependencies",
    keys: [
      { key: "status-healthy", label: "Healthy" },
      { key: "status-at-risk", label: "At Risk" },
      { key: "status-blocked", label: "Blocked" },
    ],
  },
  {
    title: "Series palette (bar/line/pie)",
    keys: [
      { key: "chart-1", label: "Series 1" }, { key: "chart-2", label: "Series 2" },
      { key: "chart-3", label: "Series 3" }, { key: "chart-4", label: "Series 4" },
      { key: "chart-5", label: "Series 5" }, { key: "chart-6", label: "Series 6" },
      { key: "chart-7", label: "Series 7" }, { key: "chart-8", label: "Series 8" },
    ],
  },
];

function ChartThemePage() {
  const { roles, loading } = useAuth();
  const navigate = useNavigate();
  const [paletteId, setPaletteId] = useState(DEFAULT_PALETTE.id);
  const [overrides, setOverrides] = useState<Partial<Record<ChartTokenKey, string>>>({});

  useEffect(() => {
    const t = loadStoredTheme();
    setPaletteId(t.paletteId);
    setOverrides(t.overrides ?? {});
  }, []);

  useEffect(() => {
    if (loading || roles.length === 0) return;
    if (!isAdmin(roles)) navigate({ to: "/app/configuration", replace: true });
  }, [roles, loading, navigate]);

  const tokens = useMemo(() => resolvedTokens({ paletteId, overrides }), [paletteId, overrides]);

  // Live preview — apply on every change without persisting.
  useEffect(() => { applyChartTheme({ paletteId, overrides }); }, [paletteId, overrides, tokens]);

  const previewBar = useMemo(
    () => Array.from({ length: 8 }, (_, i) => ({ name: `S${i + 1}`, value: 30 + (i * 13) % 70, k: `chart-${i + 1}` as ChartTokenKey })),
    [],
  );
  const previewRAG = [
    { name: "Green", value: 9, k: "rag-green" as ChartTokenKey },
    { name: "Amber", value: 4, k: "rag-amber" as ChartTokenKey },
    { name: "Red", value: 3, k: "rag-red" as ChartTokenKey },
  ];

  const save = () => {
    saveStoredTheme({ paletteId, overrides });
    toast.success("Chart theme saved");
  };
  const reset = () => {
    setPaletteId(DEFAULT_PALETTE.id);
    setOverrides({});
    saveStoredTheme({ paletteId: DEFAULT_PALETTE.id, overrides: {} });
    toast.success("Chart theme reset to default");
  };

  return (
    <div className="space-y-6">
      <PageHeading
        title="Chart Theme"
        subtitle="Choose a palette or fine-tune individual colors. Changes apply live across every chart in the app."
      />

      <SectionFrame>
        <SectionTitle>Palette</SectionTitle>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PALETTES.map((p) => {
            const selected = p.id === paletteId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => { setPaletteId(p.id); setOverrides({}); }}
                className={`rounded-lg border p-3 text-left transition ${selected ? "border-[var(--st-accent)] ring-2 ring-[var(--st-accent)]/40" : "border-[var(--border)] hover:border-[var(--st-accent)]"}`}
              >
                <div className="text-sm font-semibold">{p.name}</div>
                <div className="mt-0.5 text-xs text-[var(--st-muted)]">{p.description}</div>
                <div className="mt-2 flex gap-1">
                  {(["chart-1","chart-2","chart-3","chart-4","chart-5","chart-6","chart-7","chart-8"] as ChartTokenKey[]).map((k) => (
                    <span key={k} className="h-4 w-4 rounded" style={{ background: p.tokens[k] }} />
                  ))}
                </div>
                <div className="mt-2 flex gap-1">
                  <span className="h-3 w-6 rounded" style={{ background: p.tokens["rag-green"] }} />
                  <span className="h-3 w-6 rounded" style={{ background: p.tokens["rag-amber"] }} />
                  <span className="h-3 w-6 rounded" style={{ background: p.tokens["rag-red"] }} />
                </div>
              </button>
            );
          })}
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Live preview</SectionTitle>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div className="h-56">
            <div className="mb-1 text-xs font-medium text-[var(--st-muted)]">Series palette</div>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={previewBar}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value">
                  {previewBar.map((d) => <Cell key={d.name} fill={`var(--ct-${d.k})`} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="h-56">
            <div className="mb-1 text-xs font-medium text-[var(--st-muted)]">RAG</div>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={previewRAG}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value">
                  {previewRAG.map((d) => <Cell key={d.name} fill={`var(--ct-${d.k})`} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </SectionFrame>

      <SectionFrame>
        <div className="flex items-center justify-between">
          <SectionTitle>Fine-tune individual colors</SectionTitle>
          <div className="text-xs text-[var(--st-muted)]">Any override sits on top of the selected palette.</div>
        </div>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          {TOKEN_GROUPS.map((g) => (
            <div key={g.title}>
              <div className="mb-2 text-sm font-semibold">{g.title}</div>
              <div className="grid gap-2">
                {g.keys.map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <label className="text-sm">{label}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={tokens[key]}
                        onChange={(e) => setOverrides({ ...overrides, [key]: e.target.value })}
                        className="h-8 w-12 cursor-pointer rounded border border-[var(--border)] bg-transparent"
                      />
                      <input
                        type="text"
                        value={tokens[key]}
                        onChange={(e) => setOverrides({ ...overrides, [key]: e.target.value })}
                        className="h-8 w-24 rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-mono"
                      />
                      {overrides[key] !== undefined && (
                        <button
                          type="button"
                          className="text-xs text-[var(--st-muted)] underline"
                          onClick={() => { const n = { ...overrides }; delete n[key]; setOverrides(n); }}
                        >clear</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionFrame>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={reset}><RotateCcw className="mr-1 h-4 w-4" />Reset to default</Button>
        <Button onClick={save}><Save className="mr-1 h-4 w-4" />Save theme</Button>
      </div>
    </div>
  );
}
