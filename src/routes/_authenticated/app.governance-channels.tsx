import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";

export const Route = createFileRoute("/_authenticated/app/governance-channels")({
  component: GovernanceChannelsPage,
});

type Channel = {
  id: string;
  org_id: string;
  name: string;
  cadence: string | null;
  audience: string | null;
  purpose: string | null;
  chair: string | null;
  next_meeting: string | null;
  status: string | null;
};

const CADENCES = ["Weekly", "Fortnightly", "Monthly", "Bi-weekly", "Quarterly", "Ad-hoc"];
const STATUSES = ["Active", "Paused", "Retired"];

function GovernanceChannelsPage() {
  const { organization } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Channel> | null>(null);

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ["governance_channels", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("governance_channels").select("*").order("name");
      if (error) throw error;
      return data as Channel[];
    },
    enabled: !!organization,
  });

  const save = useMutation({
    mutationFn: async (v: Partial<Channel>) => {
      const payload = {
        name: v.name!,
        cadence: v.cadence || null,
        audience: v.audience || null,
        purpose: v.purpose || null,
        chair: v.chair || null,
        next_meeting: v.next_meeting || null,
        status: v.status || "Active",
      };
      if (v.id) {
        const { error } = await supabase.from("governance_channels").update(payload).eq("id", v.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("governance_channels").insert({ ...payload, org_id: organization!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Channel saved");
      qc.invalidateQueries({ queryKey: ["governance_channels"] });
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("governance_channels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Channel deleted");
      qc.invalidateQueries({ queryKey: ["governance_channels"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const columns: ColumnarColumn<Channel>[] = useMemo(
    () => [
      { key: "name", label: "Channel" },
      { key: "cadence", label: "Cadence" },
      { key: "audience", label: "Audience" },
      { key: "chair", label: "Chair" },
      { key: "next_meeting", label: "Next Meeting" },
      { key: "status", label: "Status", getValue: (c) => c.status || "Active" },
      { key: "purpose", label: "Purpose" },
    ],
    [],
  );
  const table = useColumnarTable(channels, columns);

  return (
    <div className="space-y-6">
      <PageHeading title="Governance Channels" subtitle="Forums, cadence, and decision rights across the portfolio" />

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard label="Active Forums" value={channels.filter(c => (c.status || "Active") === "Active").length} />
        <KpiCard label="Weekly Cadence" value={channels.filter(c => c.cadence === "Weekly").length} />
        <KpiCard label="Executive Forums" value={channels.filter(c => (c.audience || "").toLowerCase().includes("exec")).length} />
        <KpiCard label="Total Channels" value={channels.length} />
      </div>

      <SectionFrame>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <SectionTitle>Governance Framework</SectionTitle>
          <Button size="sm" onClick={() => setEditing({})}><Plus className="h-4 w-4 mr-1" />Add Channel</Button>
        </div>
        <div className="mt-3">
          <ColumnarToolbar
            globalQ={table.globalQ}
            onGlobalQ={table.setGlobalQ}
            shown={table.rows.length}
            total={table.total}
            dirty={table.isDirty}
          onClear={table.clearAll}
            placeholder="Search channels…"
          />
          <div className="overflow-x-auto">
            <table className="st-table">
              <thead>
                <tr>
                  {columns.map((col) => (
                    <ColumnarTh
                      key={col.key}
                      column={col}
                      filter={table.filters[col.key]}
                      onFilter={(v) => table.setColumnFilter(col.key, v)}
                      sortKey={table.sortKey}
                      sortDir={table.sortDir}
                      onToggleSort={table.toggleSort}
                    />
                  ))}
                  <th className="w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={8} className="text-center text-muted-foreground p-4">
                      Loading…
                    </td>
                  </tr>
                )}
                {!isLoading && table.total === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center text-muted-foreground p-4">
                      No channels yet.
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  table.total > 0 &&
                  table.rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center text-muted-foreground p-4">
                        No channels match filters.
                      </td>
                    </tr>
                  )}
                {table.rows.map((c) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.name}</td>
                    <td>{c.cadence || "—"}</td>
                    <td>{c.audience || "—"}</td>
                    <td>{c.chair || "—"}</td>
                    <td>{c.next_meeting || "—"}</td>
                    <td>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          c.status === "Retired"
                            ? "bg-muted text-muted-foreground"
                            : c.status === "Paused"
                              ? "bg-amber-500/15 text-amber-600"
                              : "bg-emerald-500/15 text-emerald-600"
                        }`}
                      >
                        {c.status || "Active"}
                      </span>
                    </td>
                    <td className="max-w-md">{c.purpose || "—"}</td>
                    <td>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setEditing(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (confirm(`Delete "${c.name}"?`)) del.mutate(c.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </SectionFrame>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit Channel" : "New Governance Channel"}</DialogTitle></DialogHeader>
          {editing && <ChannelForm value={editing} onChange={setEditing} onSubmit={() => save.mutate(editing)} submitting={save.isPending} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChannelForm({ value, onChange, onSubmit, submitting }: { value: Partial<Channel>; onChange: (v: Partial<Channel>) => void; onSubmit: () => void; submitting: boolean }) {
  const set = (k: keyof Channel, v: any) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Label>Channel Name *</Label><Input value={value.name || ""} onChange={e => set("name", e.target.value)} /></div>
        <div>
          <Label>Cadence</Label>
          <Select value={value.cadence || ""} onValueChange={v => set("cadence", v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>{CADENCES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={value.status || "Active"} onValueChange={v => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Audience</Label><Input value={value.audience || ""} onChange={e => set("audience", e.target.value)} /></div>
        <div><Label>Chair</Label><Input value={value.chair || ""} onChange={e => set("chair", e.target.value)} /></div>
        <div><Label>Next Meeting</Label><Input type="date" value={value.next_meeting || ""} onChange={e => set("next_meeting", e.target.value)} /></div>
      </div>
      <div><Label>Purpose</Label><Textarea rows={3} value={value.purpose || ""} onChange={e => set("purpose", e.target.value)} /></div>
      <DialogFooter>
        <Button disabled={!value.name || submitting} onClick={onSubmit}>{submitting ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </div>
  );
}
