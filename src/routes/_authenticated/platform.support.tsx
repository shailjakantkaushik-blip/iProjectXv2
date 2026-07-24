import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SUPPORT_PRIORITIES,
  SUPPORT_PRIORITY_CLASS,
  SUPPORT_STATUS_CLASS,
  SUPPORT_STATUSES,
  audienceLabel,
  notifySupportUser,
  type OrgSupportSettings,
  type SupportAudience,
  type SupportComment,
  type SupportPriority,
  type SupportStatus,
  type SupportTicket,
} from "@/lib/support-tickets";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  LifeBuoy,
  MessageSquare,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/platform/support")({
  component: PlatformSupportPage,
});

type TicketRow = SupportTicket & {
  organizations?: { name: string; slug: string } | null;
};

function PlatformSupportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Platform Support</h1>
        <p className="text-sm text-muted-foreground">
          Review organisation tickets, update status, reply to users, and enable Support
          per organisation.
        </p>
      </div>

      <Tabs defaultValue="tickets">
        <TabsList>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="access">Organisation access</TabsTrigger>
        </TabsList>
        <TabsContent value="tickets" className="mt-4">
          <TicketsTab />
        </TabsContent>
        <TabsContent value="access" className="mt-4">
          <OrgAccessTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TicketsTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [orgFilter, setOrgFilter] = useState("all");
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [internalDraft, setInternalDraft] = useState<Record<string, string>>({});

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["platform_support_tickets"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("support_tickets")
        .select("*, organizations(name, slug)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TicketRow[];
    },
  });

  const ticketIds = useMemo(() => tickets.map((t) => t.id), [tickets]);

  const { data: comments = [] } = useQuery({
    queryKey: ["platform_support_comments", ticketIds.join(",")],
    queryFn: async () => {
      if (!ticketIds.length) return [] as SupportComment[];
      const { data, error } = await (supabase as any)
        .from("support_ticket_comments")
        .select("*")
        .in("ticket_id", ticketIds)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SupportComment[];
    },
    enabled: ticketIds.length > 0,
  });

  const authorIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of tickets) ids.add(t.created_by);
    for (const c of comments) ids.add(c.author_id);
    return [...ids];
  }, [tickets, comments]);

  const { data: profiles = [] } = useQuery({
    queryKey: ["platform_support_profiles", authorIds.join(",")],
    queryFn: async () => {
      if (!authorIds.length) return [] as { id: string; full_name: string | null; email: string }[];
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .in("id", authorIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: authorIds.length > 0,
  });

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of profiles) {
      m.set(p.id, p.full_name?.trim() || p.email || p.id.slice(0, 8));
    }
    return m;
  }, [profiles]);

  const commentsByTicket = useMemo(() => {
    const m = new Map<string, SupportComment[]>();
    for (const c of comments) {
      const list = m.get(c.ticket_id) ?? [];
      list.push(c);
      m.set(c.ticket_id, list);
    }
    return m;
  }, [comments]);

  const orgs = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tickets) {
      map.set(t.org_id, t.organizations?.name || t.org_id.slice(0, 8));
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [tickets]);

  const filtered = tickets.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (orgFilter !== "all" && t.org_id !== orgFilter) return false;
    return true;
  });

  const counts: Record<string, number> = {};
  for (const t of tickets) counts[t.status] = (counts[t.status] ?? 0) + 1;

  const updateStatus = useMutation({
    mutationFn: async ({
      id,
      status,
      createdBy,
      orgId,
      title,
    }: {
      id: string;
      status: string;
      createdBy: string;
      orgId: string;
      title: string;
    }) => {
      const { error } = await (supabase as any)
        .from("support_tickets")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
      if (createdBy && createdBy !== user?.id) {
        await notifySupportUser({
          userId: createdBy,
          orgId,
          ticketId: id,
          title: `Support ticket updated: ${title}`,
          body: `Status is now “${status}”.`,
        });
      }
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["platform_support_tickets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updatePriority = useMutation({
    mutationFn: async ({ id, priority }: { id: string; priority: string }) => {
      const { error } = await (supabase as any)
        .from("support_tickets")
        .update({ priority })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Priority updated");
      qc.invalidateQueries({ queryKey: ["platform_support_tickets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addComment = useMutation({
    mutationFn: async ({
      ticket,
      body,
      isInternal,
    }: {
      ticket: TicketRow;
      body: string;
      isInternal: boolean;
    }) => {
      if (!user?.id) throw new Error("Not signed in");
      const { error } = await (supabase as any).from("support_ticket_comments").insert({
        ticket_id: ticket.id,
        author_id: user.id,
        body: body.trim(),
        is_internal: isInternal,
      });
      if (error) throw error;
      if (!isInternal && ticket.created_by !== user.id) {
        await notifySupportUser({
          userId: ticket.created_by,
          orgId: ticket.org_id,
          ticketId: ticket.id,
          title: `New reply on: ${ticket.title}`,
          body: body.trim().slice(0, 180),
        });
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["platform_support_comments"] });
      qc.invalidateQueries({ queryKey: ["platform_support_tickets"] });
      if (vars.isInternal) {
        setInternalDraft((prev) => ({ ...prev, [vars.ticket.id]: "" }));
        toast.success("Internal note saved");
      } else {
        setCommentDraft((prev) => ({ ...prev, [vars.ticket.id]: "" }));
        toast.success("Reply sent to organisation");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-5">
        {SUPPORT_STATUSES.map((s) => (
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

      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses ({tickets.length})</SelectItem>
            {SUPPORT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s} ({counts[s] ?? 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={orgFilter} onValueChange={setOrgFilter}>
          <SelectTrigger className="h-8 w-56">
            <SelectValue placeholder="Organisation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All organisations</SelectItem>
            {orgs.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
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
              No support tickets yet.
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((t) => {
                const open = !!expanded[t.id];
                const thread = commentsByTicket.get(t.id) ?? [];
                return (
                  <div key={t.id}>
                    <button
                      type="button"
                      className="flex w-full items-start gap-4 px-5 py-4 text-left hover:bg-muted/40"
                      onClick={() =>
                        setExpanded((prev) => ({ ...prev, [t.id]: !prev[t.id] }))
                      }
                    >
                      {open ? (
                        <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{t.title}</span>
                          <Badge
                            className={
                              SUPPORT_STATUS_CLASS[t.status as SupportStatus] ?? ""
                            }
                          >
                            {t.status}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={
                              SUPPORT_PRIORITY_CLASS[t.priority as SupportPriority] ?? ""
                            }
                          >
                            {t.priority}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{t.category}</span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5" />
                            {t.organizations?.name || "Organisation"}
                          </span>
                          <span>{nameById.get(t.created_by) || "User"}</span>
                          <span>{new Date(t.updated_at).toLocaleString()}</span>
                          {thread.length > 0 && (
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-3.5 w-3.5" />
                              {thread.length}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                    {open && (
                      <div className="space-y-4 border-t bg-muted/20 px-5 py-4 pl-14">
                        <p className="whitespace-pre-wrap text-sm">{t.body}</p>

                        <div className="flex flex-wrap gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Status</Label>
                            <Select
                              value={t.status}
                              onValueChange={(status) =>
                                updateStatus.mutate({
                                  id: t.id,
                                  status,
                                  createdBy: t.created_by,
                                  orgId: t.org_id,
                                  title: t.title,
                                })
                              }
                            >
                              <SelectTrigger className="h-8 w-44">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SUPPORT_STATUSES.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {s}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Priority</Label>
                            <Select
                              value={t.priority}
                              onValueChange={(priority) =>
                                updatePriority.mutate({ id: t.id, priority })
                              }
                            >
                              <SelectTrigger className="h-8 w-36">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SUPPORT_PRIORITIES.map((p) => (
                                  <SelectItem key={p} value={p}>
                                    {p}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Thread
                          </h4>
                          {thread.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No comments yet.</p>
                          ) : (
                            thread.map((c) => (
                              <div
                                key={c.id}
                                className={`rounded-md border px-3 py-2 text-sm ${
                                  c.is_internal
                                    ? "border-amber-200 bg-amber-50/80"
                                    : "bg-background"
                                }`}
                              >
                                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <span className="font-medium text-foreground">
                                    {nameById.get(c.author_id) || "User"}
                                  </span>
                                  {c.is_internal && (
                                    <Badge variant="outline" className="text-[10px]">
                                      Internal
                                    </Badge>
                                  )}
                                  <span>{new Date(c.created_at).toLocaleString()}</span>
                                </div>
                                <p className="whitespace-pre-wrap">{c.body}</p>
                              </div>
                            ))
                          )}
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Reply to organisation</Label>
                            <Textarea
                              rows={3}
                              value={commentDraft[t.id] ?? ""}
                              onChange={(e) =>
                                setCommentDraft((prev) => ({
                                  ...prev,
                                  [t.id]: e.target.value,
                                }))
                              }
                              placeholder="Visible to the organisation…"
                            />
                            <Button
                              size="sm"
                              disabled={
                                addComment.isPending || !(commentDraft[t.id] || "").trim()
                              }
                              onClick={() =>
                                addComment.mutate({
                                  ticket: t,
                                  body: commentDraft[t.id] || "",
                                  isInternal: false,
                                })
                              }
                            >
                              Send reply
                            </Button>
                          </div>
                          <div className="space-y-2">
                            <Label>Internal note (platform only)</Label>
                            <Textarea
                              rows={3}
                              value={internalDraft[t.id] ?? ""}
                              onChange={(e) =>
                                setInternalDraft((prev) => ({
                                  ...prev,
                                  [t.id]: e.target.value,
                                }))
                              }
                              placeholder="Not visible to the organisation…"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={
                                addComment.isPending || !(internalDraft[t.id] || "").trim()
                              }
                              onClick={() =>
                                addComment.mutate({
                                  ticket: t,
                                  body: internalDraft[t.id] || "",
                                  isInternal: true,
                                })
                              }
                            >
                              Save internal note
                            </Button>
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

function OrgAccessTab() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: orgs = [], isLoading: loadingOrgs } = useQuery({
    queryKey: ["platform_orgs_for_support"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id,name,slug")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: settings = [], isLoading: loadingSettings } = useQuery({
    queryKey: ["platform_org_support_settings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("org_support_settings")
        .select("*");
      if (error) throw error;
      return (data ?? []) as OrgSupportSettings[];
    },
  });

  const settingsByOrg = useMemo(() => {
    const m = new Map<string, OrgSupportSettings>();
    for (const s of settings) m.set(s.org_id, s);
    return m;
  }, [settings]);

  const save = useMutation({
    mutationFn: async ({
      orgId,
      enabled,
      audience,
    }: {
      orgId: string;
      enabled: boolean;
      audience: SupportAudience;
    }) => {
      const { error } = await (supabase as any).from("org_support_settings").upsert(
        {
          org_id: orgId,
          enabled,
          audience,
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        },
        { onConflict: "org_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Support access updated");
      qc.invalidateQueries({ queryKey: ["platform_org_support_settings"] });
      qc.invalidateQueries({ queryKey: ["org_support_settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeCount = settings.filter((s) => s.enabled).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <LifeBuoy className="h-4 w-4" />
            Organisation Support access
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Turn Support <strong className="text-foreground">active</strong> or{" "}
            <strong className="text-foreground">inactive</strong> per organisation. When
            active, choose whether only organisation admins can log tickets, or all users
            in that organisation.
          </p>
          <p>
            Active organisations:{" "}
            <span className="font-medium text-foreground">{activeCount}</span> / {orgs.length}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loadingOrgs || loadingSettings ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : orgs.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No organisations yet.
            </div>
          ) : (
            <div className="divide-y">
              {orgs.map((org) => {
                const s = settingsByOrg.get(org.id);
                const enabled = !!s?.enabled;
                const audience = (s?.audience ?? "org_admin") as SupportAudience;
                return (
                  <div
                    key={org.id}
                    className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold">{org.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {org.slug} ·{" "}
                        {enabled ? (
                          <span className="text-emerald-700">
                            Active · {audienceLabel(audience)}
                          </span>
                        ) : (
                          <span>Inactive</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={enabled}
                          onCheckedChange={(next) =>
                            save.mutate({
                              orgId: org.id,
                              enabled: next,
                              audience,
                            })
                          }
                          disabled={save.isPending}
                        />
                        <span className="text-sm">{enabled ? "Active" : "Inactive"}</span>
                      </div>
                      <Select
                        value={audience}
                        disabled={!enabled || save.isPending}
                        onValueChange={(v) =>
                          save.mutate({
                            orgId: org.id,
                            enabled,
                            audience: v as SupportAudience,
                          })
                        }
                      >
                        <SelectTrigger className="h-8 w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="org_admin">Org admins only</SelectItem>
                          <SelectItem value="all_users">All users</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
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
