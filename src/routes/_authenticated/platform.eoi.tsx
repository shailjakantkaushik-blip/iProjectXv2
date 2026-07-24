import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useState } from "react";
import { ChevronDown, ChevronRight, Mail, Building2, Phone, User } from "lucide-react";

export const Route = createFileRoute("/_authenticated/platform/eoi")({
  component: EoiPage,
});

const STATUS_OPTIONS = ["New", "Contacted", "Qualified", "Closed"] as const;
type EoiStatus = (typeof STATUS_OPTIONS)[number];

const STATUS_COLORS: Record<EoiStatus, string> = {
  New: "bg-blue-100 text-blue-800",
  Contacted: "bg-yellow-100 text-yellow-800",
  Qualified: "bg-green-100 text-green-800",
  Closed: "bg-gray-100 text-gray-600",
};

function EoiPage() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["platform_eoi_requests"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("eoi_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase as any)
        .from("eoi_requests")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["platform_eoi_requests"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveNotes = useMutation({
    mutationFn: async ({ id, notesText }: { id: string; notesText: string }) => {
      const { error } = await (supabase as any)
        .from("eoi_requests")
        .update({ notes: notesText })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notes saved");
      qc.invalidateQueries({ queryKey: ["platform_eoi_requests"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered =
    statusFilter === "all" ? rows : rows.filter((r: any) => r.status === statusFilter);

  const counts: Record<string, number> = {};
  for (const r of rows as any[]) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Expressions of Interest</h1>
        <p className="text-sm text-muted-foreground">
          Manage inbound enquiries from the landing page.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        {STATUS_OPTIONS.map((s) => (
          <Card key={s}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{counts[s] ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Filter by status:</span>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ({rows.length})</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s} ({counts[s] ?? 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No expressions of interest yet.
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((r: any) => {
                const open = !!expanded[r.id];
                return (
                  <div key={r.id}>
                    <button
                      type="button"
                      className="flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/40"
                      onClick={() => toggleExpand(r.id)}
                    >
                      {open ? (
                        <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{r.full_name}</span>
                          <Badge className={STATUS_COLORS[r.status as EoiStatus] ?? ""}>
                            {r.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(r.created_at).toLocaleDateString("en-AU", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                          {r.source && r.source !== "landing" && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                              {r.source}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3.5 w-3.5" />
                            {r.email}
                          </span>
                          {r.organization_name && (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3.5 w-3.5" />
                              {r.organization_name}
                            </span>
                          )}
                          {r.job_title && (
                            <span className="flex items-center gap-1">
                              <User className="h-3.5 w-3.5" />
                              {r.job_title}
                            </span>
                          )}
                          {r.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3.5 w-3.5" />
                              {r.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>

                    {open && (
                      <div className="border-t bg-muted/20 px-5 py-5">
                        <div className="grid gap-6 sm:grid-cols-2">
                          <div className="space-y-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                              Details
                            </h3>
                            <dl className="space-y-1.5 text-sm">
                              {r.company_size && (
                                <div className="flex gap-2">
                                  <dt className="w-32 shrink-0 text-muted-foreground">
                                    Company size
                                  </dt>
                                  <dd>{r.company_size}</dd>
                                </div>
                              )}
                              {r.interest_areas && (
                                <div className="flex gap-2">
                                  <dt className="w-32 shrink-0 text-muted-foreground">
                                    Interests
                                  </dt>
                                  <dd>{r.interest_areas}</dd>
                                </div>
                              )}
                              {r.message && (
                                <div className="flex gap-2">
                                  <dt className="w-32 shrink-0 text-muted-foreground">Message</dt>
                                  <dd className="whitespace-pre-wrap">{r.message}</dd>
                                </div>
                              )}
                            </dl>
                          </div>

                          <div className="space-y-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                              Admin
                            </h3>
                            <div className="space-y-2">
                              <label className="text-xs font-medium text-muted-foreground">
                                Status
                              </label>
                              <Select
                                value={r.status}
                                onValueChange={(v) => updateStatus.mutate({ id: r.id, status: v })}
                              >
                                <SelectTrigger className="h-8 w-44">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {STATUS_OPTIONS.map((s) => (
                                    <SelectItem key={s} value={s}>
                                      {s}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-medium text-muted-foreground">
                                Internal notes
                              </label>
                              <Textarea
                                value={notes[r.id] ?? r.notes ?? ""}
                                onChange={(e) =>
                                  setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))
                                }
                                rows={3}
                                placeholder="Add private notes…"
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  saveNotes.mutate({
                                    id: r.id,
                                    notesText: notes[r.id] ?? r.notes ?? "",
                                  })
                                }
                              >
                                Save notes
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
