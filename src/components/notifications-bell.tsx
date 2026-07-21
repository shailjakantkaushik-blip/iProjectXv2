import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function NotificationsBell() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,kind,title,body,link,read_at,created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
    enabled: !!userId,
    refetchInterval: 60_000,
  });

  const unread = useMemo(
    () => notifications.filter((n) => !n.read_at).length,
    [notifications],
  );

  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() } as never)
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", userId] }),
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["notifications", userId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open || !unread) return;
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
    const t = window.setTimeout(() => markRead.mutate(unreadIds), 800);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!userId) return null;

  const go = (link?: string | null) => {
    setOpen(false);
    if (!link) return;
    if (link.startsWith("/app/decisions")) {
      const awaiting = link.includes("awaiting=me") ? "me" : undefined;
      navigate({ to: "/app/decisions", search: awaiting ? { awaiting } : {} });
      return;
    }
    navigate({ to: link as any });
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="relative rounded-md p-2 text-foreground transition-colors hover:bg-muted"
        aria-label={unread ? `${unread} unread notifications` : "Notifications"}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div className="text-sm font-semibold text-foreground">Notifications</div>
            {unread > 0 && (
              <button
                type="button"
                className="text-[11px] font-medium text-primary hover:underline"
                onClick={() =>
                  markRead.mutate(notifications.filter((n) => !n.read_at).map((n) => n.id))
                }
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                No notifications yet
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={cn(
                    "block w-full border-b border-border/70 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/50",
                    !n.read_at && "bg-sky-50/70",
                  )}
                  onClick={() => go(n.link)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-[12.5px] font-semibold text-foreground">
                      {n.title}
                    </div>
                    <div className="shrink-0 text-[10px] text-muted-foreground">
                      {timeAgo(n.created_at)}
                    </div>
                  </div>
                  {n.body ? (
                    <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                      {n.body}
                    </div>
                  ) : null}
                  {n.kind === "decision_approval" ? (
                    <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-sky-700">
                      Decision approval
                    </div>
                  ) : null}
                </button>
              ))
            )}
          </div>
          <div className="border-t border-border px-3 py-2 text-center">
            <button
              type="button"
              className="text-[11px] font-medium text-primary hover:underline"
              onClick={() => go("/app/decisions?awaiting=me")}
            >
              View decisions awaiting my approval
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
