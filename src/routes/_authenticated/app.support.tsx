import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageLoading } from "@/components/page-loading";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_PRIORITY_CLASS,
  SUPPORT_STATUS_CLASS,
  SUPPORT_STATUSES,
  useOrgSupportAccess,
  type SupportComment,
  type SupportPriority,
  type SupportStatus,
  type SupportTicket,
} from "@/lib/support-tickets";
import { ChevronDown, ChevronRight, LifeBuoy, MessageSquare } from "lucide-react";

type Search = { ticket?: string };

export const Route = createFileRoute("/_authenticated/app/support")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ticket: typeof s.ticket === "string" && s.ticket.trim() ? s.ticket.trim() : undefined,
  }),
  component: SupportPage,
});

function SupportPage() {
  const { user, profile } = useAuth();
  const { orgId, allowed, isReady, settings } = useOrgSupportAccess();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { ticket: focusTicketId } = Route.useSearch();

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    title: "",
    body: "",
    category: "General",
    priority: "Medium" as SupportPriority,
  });

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["support_tickets", orgId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("support_tickets")
        .select("*")
        .eq("org_id", orgId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SupportTicket[];
    },
    enabled: !!orgId && allowed,
  });

  const ticketIds = useMemo(() => tickets.map((t) => t.id), [tickets]);

  const { data: comments = [] } = useQuery({
    queryKey: ["support_ticket_comments", orgId, ticketIds.join(",")],
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
    enabled: !!orgId && allowed && ticketIds.length > 0,
  });

  const authorIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of tickets) ids.add(t.created_by);
    for (const c of comments) ids.add(c.author_id);
    return [...ids];
  }, [tickets, comments]);

  const { data: profiles = [] } = useQuery({
    queryKey: ["support_profiles", authorIds.join(",")],
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

  useEffect(() => {
    if (!focusTicketId) return;
    setExpanded((prev) => ({ ...prev, [focusTicketId]: true }));
  }, [focusTicketId]);

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId || !user?.id) throw new Error("Not signed in");
      if (!form.title.trim() || !form.body.trim()) {
        throw new Error("Title and description are required");
      }
      const { data, error } = await (supabase as any)
        .from("support_tickets")
        .insert({
          org_id: orgId,
          created_by: user.id,
          title: form.title.trim(),
          body: form.body.trim(),
          category: form.category,
          priority: form.priority,
          status: "Open",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["support_tickets", orgId] });
      toast.success("Support ticket logged");
      setForm({ title: "", body: "", category: "General", priority: "Medium" });
      setExpanded((prev) => ({ ...prev, [row.id]: true }));
      void navigate({ to: "/app/support", search: { ticket: row.id }, replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addComment = useMutation({
    mutationFn: async ({ ticketId, body }: { ticketId: string; body: string }) => {
      if (!user?.id) throw new Error("Not signed in");
      const { error } = await (supabase as any).from("support_ticket_comments").insert({
        ticket_id: ticketId,
        author_id: user.id,
        body: body.trim(),
        is_internal: false,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["support_ticket_comments", orgId] });
      qc.invalidateQueries({ queryKey: ["support_tickets", orgId] });
      setCommentDraft((prev) => ({ ...prev, [vars.ticketId]: "" }));
      toast.success("Comment added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isReady) return <PageLoading label="Loading support…" />;

  if (!allowed) {
    return (
      <div className="space-y-4">
        <PageHeading
          title="Support"
          subtitle="Log tickets with the iProjectX platform team"
        />
        <SectionFrame>
          <div className="flex flex-col items-start gap-3 py-6">
            <LifeBuoy className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground max-w-lg">
              Support is not enabled for your organisation
              {settings?.enabled === false || !settings
                ? ". Ask your platform administrator to activate it."
                : " for your role. Your administrator can request access for all users."}
            </p>
          </div>
        </SectionFrame>
      </div>
    );
  }

  const filtered =
    statusFilter === "all" ? tickets : tickets.filter((t) => t.status === statusFilter);

  const counts: Record<string, number> = {};
  for (const t of tickets) counts[t.status] = (counts[t.status] ?? 0) + 1;
  const openish = tickets.filter((t) =>
    ["Open", "In Progress", "Waiting on User"].includes(t.status),
  ).length;

  return (
    <div className="space-y-6">
      <PageHeading
        title="Support"
        subtitle="Log a ticket with the platform team and track status, comments, and updates"
        actions={
          <Button
            type="button"
            onClick={() =>
              document.getElementById("log-support")?.scrollIntoView({ behavior: "smooth" })
            }
          >
            + Log ticket
          </Button>
        }
      />

      <SectionFrame>
        <SectionTitle>Overview</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Total" value={tickets.length} />
          <KpiCard label="Active" value={openish} />
          <KpiCard label="Waiting on you" value={counts["Waiting on User"] ?? 0} />
          <KpiCard label="Resolved" value={counts.Resolved ?? 0} />
        </div>
      </SectionFrame>

      <SectionFrame id="log-support">
        <SectionTitle>Log a ticket</SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="st-title">Title</Label>
            <Input
              id="st-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Short summary of the issue or request"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select
              value={form.category}
              onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select
              value={form.priority}
              onValueChange={(v) => setForm((f) => ({ ...f, priority: v as SupportPriority }))}
            >
              <SelectTrigger>
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
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="st-body">Description</Label>
            <Textarea
              id="st-body"
              rows={4}
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="What happened, what you expected, and any steps to reproduce…"
            />
          </div>
          <div className="md:col-span-2">
            <Button
              type="button"
              disabled={create.isPending || !form.title.trim() || !form.body.trim()}
              onClick={() => create.mutate()}
            >
              {create.isPending ? "Submitting…" : "Submit ticket"}
            </Button>
          </div>
        </div>
      </SectionFrame>

      <SectionFrame>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <SectionTitle>Your organisation’s tickets</SectionTitle>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ({tickets.length})</SelectItem>
              {SUPPORT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s} ({counts[s] ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6">Loading tickets…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">No tickets yet.</p>
        ) : (
          <div className="divide-y rounded-md border">
            {filtered.map((t) => {
              const open = !!expanded[t.id];
              const thread = commentsByTicket.get(t.id) ?? [];
              const closed = t.status === "Closed";
              return (
                <div key={t.id} id={`ticket-${t.id}`}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/40"
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
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Logged by {nameById.get(t.created_by) || "user"} ·{" "}
                        {new Date(t.created_at).toLocaleString()}
                        {thread.length > 0 && (
                          <>
                            {" "}
                            · <MessageSquare className="inline h-3 w-3" /> {thread.length}
                          </>
                        )}
                      </p>
                    </div>
                  </button>
                  {open && (
                    <div className="space-y-4 border-t bg-muted/20 px-4 py-4 pl-11">
                      <p className="whitespace-pre-wrap text-sm">{t.body}</p>

                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Updates & comments
                        </h4>
                        {thread.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            No comments yet. The platform team will reply here.
                          </p>
                        ) : (
                          thread.map((c) => {
                            const mine = c.author_id === user?.id;
                            const label = mine
                              ? profile?.full_name || "You"
                              : nameById.get(c.author_id) || "Platform team";
                            return (
                              <div
                                key={c.id}
                                className="rounded-md border bg-background px-3 py-2 text-sm"
                              >
                                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <span className="font-medium text-foreground">{label}</span>
                                  <span>{new Date(c.created_at).toLocaleString()}</span>
                                </div>
                                <p className="whitespace-pre-wrap">{c.body}</p>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {!closed ? (
                        <div className="space-y-2">
                          <Label htmlFor={`c-${t.id}`}>Add a comment</Label>
                          <Textarea
                            id={`c-${t.id}`}
                            rows={3}
                            value={commentDraft[t.id] ?? ""}
                            onChange={(e) =>
                              setCommentDraft((prev) => ({
                                ...prev,
                                [t.id]: e.target.value,
                              }))
                            }
                            placeholder="Reply or add more detail…"
                          />
                          <Button
                            type="button"
                            size="sm"
                            disabled={
                              addComment.isPending || !(commentDraft[t.id] || "").trim()
                            }
                            onClick={() =>
                              addComment.mutate({
                                ticketId: t.id,
                                body: commentDraft[t.id] || "",
                              })
                            }
                          >
                            Post comment
                          </Button>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          This ticket is closed. Log a new ticket if you need further help.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionFrame>
    </div>
  );
}
