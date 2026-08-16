import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";
import { GOVERNANCE_CADENCES } from "@/lib/ops-enhancements";

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
  last_meeting: string | null;
  parent_channel_id: string | null;
  status: string | null;
};

const CADENCES = [...GOVERNANCE_CADENCES];
const STATUSES = ["Active", "Paused", "Retired"];

function GovernanceChannelsPage() {
  const { organization } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Channel> | null>(null);

  const {
    data: channels = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["governance_channels", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("governance_channels").select("*").order("name");
      if (error) throw error;
      return data as Channel[];
    },
    enabled: !!organization,
    retry: 1,
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
        last_meeting: v.last_meeting || null,
        parent_channel_id: v.parent_channel_id || null,
        status: v.status || "Active",
      };
      if (v.id) {
        const { error } = await supabase.from("governance_channels").update(payload).eq("id", v.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("governance_channels")
          .insert({ ...payload, org_id: organization!.id });
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
      { key: "parent_channel_id", label: "Reports to" },
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
      <PageHeading
        title="Governance Channels"
        subtitle="Forums and cadence hierarchy — daily through annual — with a calendar of next meetings"
      />

      {isError && (
        <div className="rounded-md border border-border bg-surface px-4 py-3 text-sm" role="status">
          <p className="font-medium text-foreground">Data not available</p>
          <p className="mt-1 text-muted-foreground">
            Governance channels could not be loaded
            {error instanceof Error && error.message ? ` (${error.message})` : ""}. The table may be
            missing or empty after a database change.
          </p>
          <button type="button" className="st-btn-primary mt-3" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard
          label="Active Forums"
          value={channels.filter((c) => (c.status || "Active") === "Active").length}
        />
        <KpiCard
          label="Weekly Cadence"
          value={channels.filter((c) => c.cadence === "Weekly").length}
        />
        <KpiCard
          label="Executive Forums"
          value={channels.filter((c) => (c.audience || "").toLowerCase().includes("exec")).length}
        />
        <KpiCard label="Total Channels" value={channels.length} />
      </div>

      <SectionFrame>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <SectionTitle>Governance Framework</SectionTitle>
          <Button size="sm" onClick={() => setEditing({})}>
            <Plus className="h-4 w-4 mr-1" />
            Add Channel
          </Button>
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
                    <td colSpan={9} className="text-center text-muted-foreground p-4">
                      Loading…
                    </td>
                  </tr>
                )}
                {!isLoading && table.total === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center text-muted-foreground p-4">
                      No channels yet.
                    </td>
                  </tr>
                )}
                {!isLoading && table.total > 0 && table.rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center text-muted-foreground p-4">
                      No channels match filters.
                    </td>
                  </tr>
                )}
                {table.rows.map((c) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.name}</td>
                    <td>{c.cadence || "—"}</td>
                    <td>{channels.find((p) => p.id === c.parent_channel_id)?.name || "—"}</td>
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

      <SectionFrame>
        <SectionTitle>Cadence calendar</SectionTitle>
        <p className="mb-2 text-xs text-muted-foreground">
          Next meeting dates by cadence. Child forums sit under their parent in the hierarchy.
        </p>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {CADENCES.map((cad) => {
            const rows = channels.filter((c) => (c.cadence || "") === cad);
            if (!rows.length) return null;
            return (
              <div key={cad} className="rounded-md border border-border p-3">
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {cad}
                </h4>
                <ul className="space-y-1 text-sm">
                  {rows.map((c) => (
                    <li key={c.id}>
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {c.next_meeting || "no date"}
                        {c.parent_channel_id
                          ? ` · under ${channels.find((p) => p.id === c.parent_channel_id)?.name || "parent"}`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <CadenceMonthCalendar channels={channels} />
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Hierarchy
          </h4>
          <ul className="text-sm">
            {channels
              .filter((c) => !c.parent_channel_id)
              .map((parent) => (
                <li key={parent.id} className="mb-1">
                  <strong>{parent.name}</strong> ({parent.cadence || "—"})
                  <ul className="ml-5 list-disc">
                    {channels
                      .filter((c) => c.parent_channel_id === parent.id)
                      .map((child) => (
                        <li key={child.id}>
                          {child.name} ({child.cadence || "—"})
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
          </ul>
        </div>
      </SectionFrame>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Channel" : "New Governance Channel"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <ChannelForm
              value={editing}
              channels={channels}
              onChange={setEditing}
              onSubmit={() => save.mutate(editing)}
              submitting={save.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChannelForm({
  value,
  channels,
  onChange,
  onSubmit,
  submitting,
}: {
  value: Partial<Channel>;
  channels: Channel[];
  onChange: (v: Partial<Channel>) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const set = (k: keyof Channel, v: any) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Channel Name *</Label>
          <Input value={value.name || ""} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="col-span-2">
          <Label>Reports to (parent cadence)</Label>
          <Select
            value={value.parent_channel_id || "none"}
            onValueChange={(v) => set("parent_channel_id", v === "none" ? null : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="None — top of hierarchy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None — top of hierarchy</SelectItem>
              {channels
                .filter((c) => c.id && c.id !== value.id)
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Cadence</Label>
          <Select value={value.cadence || ""} onValueChange={(v) => set("cadence", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {CADENCES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={value.status || "Active"} onValueChange={(v) => set("status", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Audience</Label>
          <Input value={value.audience || ""} onChange={(e) => set("audience", e.target.value)} />
        </div>
        <div>
          <Label>Chair</Label>
          <Input value={value.chair || ""} onChange={(e) => set("chair", e.target.value)} />
        </div>
        <div>
          <Label>Last Meeting</Label>
          <Input
            type="date"
            value={value.last_meeting || ""}
            onChange={(e) => set("last_meeting", e.target.value)}
          />
        </div>
        <div>
          <Label>Next Meeting</Label>
          <Input
            type="date"
            value={value.next_meeting || ""}
            onChange={(e) => set("next_meeting", e.target.value)}
          />
        </div>
      </div>
      <div>
        <Label>Purpose</Label>
        <Textarea
          rows={3}
          value={value.purpose || ""}
          onChange={(e) => set("purpose", e.target.value)}
        />
      </div>
      <DialogFooter>
        <Button disabled={!value.name || submitting} onClick={onSubmit}>
          {submitting ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </div>
  );
}

const CADENCE_COLORS: Record<string, string> = {
  Daily: "bg-sky-100 text-sky-800",
  Weekly: "bg-indigo-100 text-indigo-800",
  Fortnightly: "bg-violet-100 text-violet-800",
  Monthly: "bg-emerald-100 text-emerald-800",
  Quarterly: "bg-amber-100 text-amber-900",
  "Half-yearly": "bg-orange-100 text-orange-900",
  Annual: "bg-rose-100 text-rose-800",
  "Ad-hoc": "bg-slate-100 text-slate-700",
};

function CadenceMonthCalendar({ channels }: { channels: Channel[] }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const label = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const firstDow = new Date(y, m, 1).getDay();
  const startOffset = firstDow === 0 ? 6 : firstDow - 1;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);

  const byDay = new Map<string, Channel[]>();
  for (const c of channels) {
    for (const key of [c.next_meeting, c.last_meeting]) {
      if (!key) continue;
      const iso = String(key).slice(0, 10);
      const prefix = `${y}-${String(m + 1).padStart(2, "0")}`;
      if (!iso.startsWith(prefix)) continue;
      const list = byDay.get(iso) || [];
      if (!list.some((x) => x.id === c.id)) list.push(c);
      byDay.set(iso, list);
    }
  }

  return (
    <div className="mt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Calendar — {label}
        </h4>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setCursor(new Date(y, m - 1, 1))}
          >
            Prev
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setCursor(new Date(y, m + 1, 1))}
          >
            Next
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[11px]">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-1 py-1 font-semibold text-muted-foreground">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          const iso =
            day != null
              ? `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
              : "";
          const items = iso ? byDay.get(iso) || [] : [];
          return (
            <div
              key={`${iso || "e"}-${i}`}
              className="min-h-[4.5rem] rounded border border-border bg-surface p-1"
            >
              <div className="mb-1 font-semibold text-muted-foreground">{day || ""}</div>
              {items.map((c) => {
                const parent = channels.find((p) => p.id === c.parent_channel_id);
                return (
                  <div
                    key={c.id}
                    className={`mb-0.5 truncate rounded px-1 py-0.5 ${CADENCE_COLORS[c.cadence || ""] || "bg-muted"}`}
                    title={`${c.name} · ${c.cadence || "—"}${parent ? ` · under ${parent.name}` : ""}`}
                  >
                    {c.name}
                    {parent ? ` ↑ ${parent.name}` : ""}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
