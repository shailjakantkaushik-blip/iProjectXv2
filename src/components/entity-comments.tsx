import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

type CommentRow = {
  id: string;
  body: string;
  author_id: string;
  parent_id: string | null;
  created_at: string;
};

type ProfileLite = { id: string; full_name: string | null; email: string | null };

function authorLabel(p: ProfileLite | undefined, id: string) {
  if (!p) return "User";
  return String(p.full_name || "").trim() || String(p.email || "").trim() || "User";
}

/** Threaded comments for any entity (project, gate, work item, …). */
export function EntityComments({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string;
}) {
  const { organization, session } = useAuth();
  const orgId = organization?.id;
  const userId = session?.user?.id;
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const commentsQ = useQuery({
    queryKey: ["entity_comments", orgId, entityType, entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entity_comments" as any)
        .select("id,body,author_id,parent_id,created_at")
        .eq("org_id", orgId!)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CommentRow[];
    },
    enabled: !!orgId && !!entityId,
  });

  const profilesQ = useQuery({
    queryKey: ["profiles", orgId, "comments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as ProfileLite[];
    },
    enabled: !!orgId,
  });

  const profileById = new Map((profilesQ.data ?? []).map((p) => [p.id, p]));

  const post = useMutation({
    mutationFn: async () => {
      if (!orgId || !userId) throw new Error("Not signed in");
      const text = body.trim();
      if (!text) throw new Error("Enter a comment");
      const { error } = await supabase.from("entity_comments" as any).insert({
        org_id: orgId,
        entity_type: entityType,
        entity_id: entityId,
        author_id: userId,
        body: text,
        parent_id: replyTo,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      setReplyTo(null);
      qc.invalidateQueries({ queryKey: ["entity_comments", orgId, entityType, entityId] });
      toast.success("Comment posted");
    },
    onError: (e: Error) => {
      const msg = e.message || "";
      if (/entity_comments|schema cache|does not exist/i.test(msg)) {
        toast.error("Run ppm_platform_depth.sql in Supabase, then Reload schema");
      } else toast.error(msg);
    },
  });

  const comments = commentsQ.data ?? [];
  const roots = comments.filter((c) => !c.parent_id);
  const childrenOf = (id: string) => comments.filter((c) => c.parent_id === id);

  return (
    <div className="space-y-3">
      {commentsQ.isError ? (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Comments need the platform-depth SQL applied (entity_comments table).
        </p>
      ) : null}

      <div className="space-y-2">
        {roots.length === 0 && !commentsQ.isLoading ? (
          <p className="text-xs text-muted-foreground">No comments yet — start a thread.</p>
        ) : null}
        {roots.map((c) => (
          <div key={c.id} className="rounded-lg border border-border bg-surface px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold">
                {authorLabel(profileById.get(c.author_id), c.author_id)}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {new Date(c.created_at).toLocaleString()}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
            <button
              type="button"
              className="mt-1 text-[11px] text-sky-700 hover:underline"
              onClick={() => setReplyTo(c.id)}
            >
              Reply
            </button>
            <div className="mt-2 space-y-2 border-l-2 border-border pl-3">
              {childrenOf(c.id).map((r) => (
                <div key={r.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-semibold">
                      {authorLabel(profileById.get(r.author_id), r.author_id)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-xs">{r.body}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-md border border-border bg-muted/20 p-3">
        {replyTo ? (
          <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Replying to thread</span>
            <button type="button" className="hover:underline" onClick={() => setReplyTo(null)}>
              Cancel
            </button>
          </div>
        ) : null}
        <textarea
          className="st-input w-full"
          rows={3}
          placeholder="Write a comment…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button
          type="button"
          className="st-btn-primary mt-2"
          disabled={post.isPending}
          onClick={() => post.mutate()}
        >
          {post.isPending ? "Posting…" : "Post comment"}
        </button>
      </div>
    </div>
  );
}
