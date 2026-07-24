import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard, RagChip } from "@/components/streamlit";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Flag, MessageSquare } from "lucide-react";
import { fetchProjectOptions, projectOptionsQueryKey } from "@/lib/project-options";

export const Route = createFileRoute("/_authenticated/app/latest-updates")({
  component: LatestUpdatesPage,
});

type FeedItem = {
  id: string;
  kind: "update" | "milestone";
  date: string;
  project_id: string;
  project_name?: string;
  title: string;
  detail?: string;
  rag?: string | null;
  reporter?: string | null;
  status?: string | null;
};

function projectLabel(p: { name?: string | null; project_code?: string | null } | undefined) {
  if (!p) return undefined;
  return p.name || p.project_code || undefined;
}

function LatestUpdatesPage() {
  const { organization, user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  // Separate key from full project lists — never overwrite select("*") cache.
  const { data: projects = [] } = useQuery({
    queryKey: projectOptionsQueryKey(organization?.id),
    queryFn: fetchProjectOptions,
    enabled: !!organization,
  });

  const { data: updates = [] } = useQuery({
    queryKey: ["status_updates", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("status_updates").select("*").order("update_date", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
    enabled: !!organization,
  });

  const { data: milestones = [] } = useQuery({
    queryKey: ["milestones-feed", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("milestones").select("*").order("updated_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
    enabled: !!organization,
  });

  const projectMap = useMemo(() => {
    const m: Record<string, any> = {};
    (projects as any[]).forEach((p) => {
      m[p.id] = p;
    });
    return m;
  }, [projects]);

  const feed: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [];
    (updates as any[]).forEach((u) => {
      const p = projectMap[u.project_id];
      items.push({
        id: `u-${u.id}`,
        kind: "update",
        date: u.update_date || u.created_at,
        project_id: u.project_id,
        project_name: projectLabel(p),
        title: u.progress_summary || "Status update",
        detail: [u.achievements && `✅ ${u.achievements}`, u.blockers && `⚠️ ${u.blockers}`, u.next_steps && `➡️ ${u.next_steps}`].filter(Boolean).join("  •  "),
        rag: u.overall_rag,
        reporter: u.reporter,
      });
    });
    (milestones as any[]).forEach((m) => {
      const p = projectMap[m.project_id];
      const done = !!m.actual_date;
      items.push({
        id: `m-${m.id}`,
        kind: "milestone",
        date: m.actual_date || m.updated_at,
        project_id: m.project_id,
        project_name: projectLabel(p),
        title: `${done ? "Milestone completed" : "Milestone updated"}: ${m.name}`,
        detail: [m.planned_date && `Planned: ${m.planned_date}`, m.actual_date && `Actual: ${m.actual_date}`, m.owner && `Owner: ${m.owner}`, m.notes].filter(Boolean).join("  •  "),
        status: m.status,
        reporter: m.owner,
      });
    });
    return items.sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 100);
  }, [updates, milestones, projectMap]);

  const in7 = new Date(Date.now() - 7 * 86400000);
  const thisWeek = feed.filter((f) => f.date && new Date(f.date) >= in7);

  const addUpdate = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await supabase.from("status_updates").insert({ ...payload, org_id: organization!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Update added");
      qc.invalidateQueries({ queryKey: ["status_updates"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeading title="Latest Updates" subtitle="Status updates and milestone activity across the portfolio" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <KpiCard label="Activity (7d)" value={thisWeek.length} accent="var(--st-accent)" />
        <KpiCard label="Status Updates" value={updates.length} />
        <KpiCard label="Milestone Events" value={milestones.length} />
        <KpiCard label="At Risk Projects" value={(projects as any[]).filter((p) => p.rag === "Red" || p.rag === "Amber").length} accent="var(--st-warning)" />
      </div>

      <SectionFrame>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <SectionTitle>Activity Feed</SectionTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add New Update</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>New Status Update</DialogTitle></DialogHeader>
              <UpdateForm
                projects={projects as any[]}
                defaultReporter={user?.email || ""}
                submitting={addUpdate.isPending}
                onSubmit={(v) => addUpdate.mutate(v)}
              />
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-3 mt-3">
          {feed.length === 0 && <div className="text-sm text-muted-foreground p-4">No activity yet. Add your first update.</div>}
          {feed.map((item) => (
            <div key={item.id} className="flex gap-3 p-3 rounded-md border bg-card/50">
              <div className={`mt-1 h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${item.kind === "milestone" ? "bg-amber-500/15 text-amber-600" : "bg-blue-500/15 text-blue-600"}`}>
                {item.kind === "milestone" ? <Flag className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{item.project_name || "Unknown project"}</span>
                  {item.rag && <RagChip rag={item.rag as any} />}
                  {item.status && <span className="text-xs px-2 py-0.5 rounded bg-muted">{item.status}</span>}
                  <span className="text-xs text-muted-foreground ml-auto">{item.date ? new Date(item.date).toLocaleString() : "—"}</span>
                </div>
                <div className="text-sm mt-1">{item.title}</div>
                {item.detail && <div className="text-xs text-muted-foreground mt-1">{item.detail}</div>}
                {item.reporter && <div className="text-xs text-muted-foreground mt-1">— {item.reporter}</div>}
              </div>
            </div>
          ))}
        </div>
      </SectionFrame>
    </div>
  );
}

function UpdateForm({ projects, defaultReporter, submitting, onSubmit }: { projects: any[]; defaultReporter: string; submitting: boolean; onSubmit: (v: any) => void }) {
  const [form, setForm] = useState({
    project_id: "",
    update_date: new Date().toISOString().slice(0, 10),
    reporter: defaultReporter,
    overall_rag: "Green",
    progress_summary: "",
    achievements: "",
    blockers: "",
    next_steps: "",
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Project</Label>
          <Select value={form.project_id} onValueChange={v => set("project_id", v)}>
            <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
            <SelectContent>
              {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name || p.project_code || p.id}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Date</Label>
          <Input type="date" value={form.update_date} onChange={e => set("update_date", e.target.value)} />
        </div>
        <div>
          <Label>Reporter</Label>
          <Input value={form.reporter} onChange={e => set("reporter", e.target.value)} />
        </div>
        <div>
          <Label>Overall RAG</Label>
          <Select value={form.overall_rag} onValueChange={v => set("overall_rag", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Green">Green</SelectItem>
              <SelectItem value="Amber">Amber</SelectItem>
              <SelectItem value="Red">Red</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Progress Summary</Label>
        <Textarea rows={2} value={form.progress_summary} onChange={e => set("progress_summary", e.target.value)} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div><Label>Achievements</Label><Textarea rows={3} value={form.achievements} onChange={e => set("achievements", e.target.value)} /></div>
        <div><Label>Blockers</Label><Textarea rows={3} value={form.blockers} onChange={e => set("blockers", e.target.value)} /></div>
        <div><Label>Next Steps</Label><Textarea rows={3} value={form.next_steps} onChange={e => set("next_steps", e.target.value)} /></div>
      </div>
      <DialogFooter>
        <Button disabled={!form.project_id || submitting} onClick={() => onSubmit(form)}>
          {submitting ? "Saving..." : "Save Update"}
        </Button>
      </DialogFooter>
    </div>
  );
}
