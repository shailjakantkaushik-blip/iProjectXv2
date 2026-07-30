import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SectionFrame, SectionTitle } from "@/components/streamlit";
import { fetchOrgStreams, formatStreamLabel } from "@/lib/project-streams";
import { fetchStageGates } from "@/lib/stage-gates";
import { sortGatesByOrgOrder } from "@/lib/project-phase";

const CATEGORIES = [
  "Travel",
  "Software",
  "Vendor / Contractor",
  "Facilities",
  "Training",
  "Licenses",
  "Contingency",
  "Other",
] as const;

const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n || 0);

export type OpexOtherCost = {
  id: string;
  org_id: string;
  project_id: string;
  stream_id: string | null;
  stage_gate_id: string | null;
  cost_date: string;
  period_month: string;
  category: string;
  description: string | null;
  vendor: string | null;
  invoice_ref: string | null;
  amount: number;
  status: string;
};

type ProjectOpt = { id: string; project_code?: string | null; name?: string | null };

export function OpexOtherCostsPanel({
  orgId,
  projects,
  orgPhases = [],
}: {
  orgId: string;
  projects: ProjectOpt[];
  orgPhases?: string[];
}) {
  const qc = useQueryClient();
  const projectsOrdered = useMemo(
    () =>
      [...projects].sort((a, b) =>
        `${a.project_code || ""}`.localeCompare(`${b.project_code || ""}`),
      ),
    [projects],
  );

  const [form, setForm] = useState({
    project_id: "",
    stream_id: "",
    stage_gate_id: "",
    cost_date: new Date().toISOString().slice(0, 10),
    category: "Other",
    amount: "",
    vendor: "",
    description: "",
    invoice_ref: "",
    status: "posted",
  });

  const { data: streams = [] } = useQuery({
    queryKey: ["project_streams", orgId, "opex-other"],
    queryFn: () => fetchOrgStreams(orgId),
    enabled: !!orgId,
  });

  const { data: gates = [] } = useQuery({
    queryKey: ["stage_gates", orgId, "opex-other"],
    queryFn: () => fetchStageGates(),
    enabled: !!orgId,
  });

  const { data: costs = [], isLoading } = useQuery({
    queryKey: ["opex_other_costs", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opex_other_costs" as any)
        .select(
          "id,org_id,project_id,stream_id,stage_gate_id,cost_date,period_month,category,description,vendor,invoice_ref,amount,status",
        )
        .order("cost_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as OpexOtherCost[];
    },
    enabled: !!orgId,
  });

  const streamsForProject = useMemo(
    () => streams.filter((s: any) => s.project_id === form.project_id),
    [streams, form.project_id],
  );

  const gatesForForm = useMemo(() => {
    if (!form.project_id) return [];
    const forProject = gates.filter((g) => g.project_id === form.project_id);
    const scoped = form.stream_id
      ? forProject.filter((g) => !g.stream_id || g.stream_id === form.stream_id)
      : forProject;
    return sortGatesByOrgOrder(scoped.length ? scoped : forProject, orgPhases);
  }, [gates, form.project_id, form.stream_id, orgPhases]);

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );
  const streamById = useMemo(
    () => new Map(streams.map((s: any) => [s.id, s])),
    [streams],
  );
  const gateById = useMemo(() => new Map(gates.map((g) => [g.id, g])), [gates]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["opex_other_costs"] });
    void qc.invalidateQueries({ queryKey: ["financials_monthly"] });
    void qc.invalidateQueries({ queryKey: ["projects"] });
    window.dispatchEvent(
      new CustomEvent("pmo:data-changed", { detail: { table: "opex_other_costs" } }),
    );
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.project_id) throw new Error("Select a project");
      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount greater than 0");
      if (!form.cost_date) throw new Error("Select a cost date");

      const payload = {
        org_id: orgId,
        project_id: form.project_id,
        stream_id: form.stream_id || null,
        stage_gate_id: form.stage_gate_id || null,
        cost_date: form.cost_date,
        category: form.category || "Other",
        amount,
        vendor: form.vendor.trim() || null,
        description: form.description.trim() || null,
        invoice_ref: form.invoice_ref.trim() || null,
        status: form.status === "draft" ? "draft" : "posted",
      };

      const { error } = await supabase.from("opex_other_costs" as any).insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success(
        form.status === "draft"
          ? "Other OpEx saved as draft (not in monthly totals yet)"
          : "Other OpEx posted — rolled into OPEX Other / OPEX Actual",
      );
      setForm((f) => ({
        ...f,
        amount: "",
        vendor: "",
        description: "",
        invoice_ref: "",
      }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("opex_other_costs" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Other OpEx removed and monthly totals refreshed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const postedTotal = costs
    .filter((c) => c.status === "posted")
    .reduce((s, c) => s + Number(c.amount || 0), 0);

  return (
    <SectionFrame>
      <SectionTitle>Other OpEx costs</SectionTitle>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Capture non-labor OpEx (travel, vendors, software, etc.) with optional stream and stage
        gate. <strong>Posted</strong> lines roll up to monthly{" "}
        <code>OPEX Other</code>, and{" "}
        <code>OPEX Actual (all) = FTE Actual + OPEX Other</code>. Labor stays on timesheets.
      </p>

      <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-4">
        <select
          className="st-input"
          value={form.project_id}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              project_id: e.target.value,
              stream_id: "",
              stage_gate_id: "",
            }))
          }
        >
          <option value="">— Project —</option>
          {projectsOrdered.map((p) => (
            <option key={p.id} value={p.id}>
              {p.project_code} · {p.name}
            </option>
          ))}
        </select>
        <select
          className="st-input"
          value={form.stream_id}
          disabled={!form.project_id}
          onChange={(e) =>
            setForm((f) => ({ ...f, stream_id: e.target.value, stage_gate_id: "" }))
          }
        >
          <option value="">— Stream (optional) —</option>
          {streamsForProject.map((s: any) => (
            <option key={s.id} value={s.id}>
              {formatStreamLabel(s)}
            </option>
          ))}
        </select>
        <select
          className="st-input"
          value={form.stage_gate_id}
          disabled={!form.project_id}
          onChange={(e) => setForm((f) => ({ ...f, stage_gate_id: e.target.value }))}
        >
          <option value="">— Stage gate (optional) —</option>
          {gatesForForm.map((g: any) => (
            <option key={g.id} value={g.id}>
              {g.gate_name || "Gate"}
            </option>
          ))}
        </select>
        <input
          className="st-input"
          type="date"
          value={form.cost_date}
          onChange={(e) => setForm((f) => ({ ...f, cost_date: e.target.value }))}
        />
        <select
          className="st-input"
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          className="st-input"
          type="number"
          min={0}
          step={0.01}
          placeholder="Amount $"
          value={form.amount}
          onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
        />
        <input
          className="st-input"
          placeholder="Vendor"
          value={form.vendor}
          onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
        />
        <input
          className="st-input"
          placeholder="Invoice / PO ref"
          value={form.invoice_ref}
          onChange={(e) => setForm((f) => ({ ...f, invoice_ref: e.target.value }))}
        />
        <input
          className="st-input md:col-span-2"
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
        <select
          className="st-input"
          value={form.status}
          onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="posted">Posted (rolls up)</option>
          <option value="draft">Draft (hold)</option>
        </select>
        <button
          type="button"
          className="st-btn-primary"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : "Add Other OpEx"}
        </button>
      </div>

      <div className="mb-2 text-[11px] text-muted-foreground">
        Posted total (loaded rows): <span className="font-semibold tabular-nums">{money(postedTotal)}</span>
      </div>

      <div className="st-table-wrap overflow-x-auto">
        {isLoading ? (
          <p className="py-4 text-sm text-muted-foreground">Loading Other OpEx…</p>
        ) : costs.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No Other OpEx costs yet.</p>
        ) : (
          <table className="st-table !w-max min-w-full text-xs">
            <thead>
              <tr>
                <th className="whitespace-nowrap">Date</th>
                <th className="whitespace-nowrap">Project</th>
                <th className="whitespace-nowrap">Stream</th>
                <th className="whitespace-nowrap">Stage gate</th>
                <th className="whitespace-nowrap">Category</th>
                <th className="whitespace-nowrap">Vendor</th>
                <th className="min-w-[10rem]">Description</th>
                <th className="st-num whitespace-nowrap">Amount</th>
                <th className="whitespace-nowrap">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {costs.map((c) => {
                const p = projectById.get(c.project_id);
                const s = c.stream_id ? streamById.get(c.stream_id) : null;
                const g = c.stage_gate_id ? gateById.get(c.stage_gate_id) : null;
                return (
                  <tr key={c.id}>
                    <td className="whitespace-nowrap">{c.cost_date?.slice(0, 10)}</td>
                    <td className="whitespace-nowrap font-mono">
                      {(p as any)?.project_code || "—"}
                    </td>
                    <td className="whitespace-nowrap">
                      {s ? formatStreamLabel(s) : "—"}
                    </td>
                    <td className="whitespace-nowrap">{g?.gate_name || "—"}</td>
                    <td className="whitespace-nowrap">{c.category}</td>
                    <td className="whitespace-nowrap">{c.vendor || "—"}</td>
                    <td className="max-w-[14rem] truncate" title={c.description || ""}>
                      {c.description || "—"}
                    </td>
                    <td className="st-num whitespace-nowrap">{money(Number(c.amount || 0))}</td>
                    <td className="whitespace-nowrap">
                      <span
                        className={
                          c.status === "posted"
                            ? "text-emerald-700"
                            : "text-muted-foreground"
                        }
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap">
                      <button
                        type="button"
                        className="text-xs text-rose-600 hover:underline"
                        onClick={() => {
                          if (confirm("Delete this Other OpEx cost?")) del.mutate(c.id);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </SectionFrame>
  );
}
