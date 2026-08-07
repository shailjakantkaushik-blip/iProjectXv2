/**
 * Cause-and-effect chain: Risk → Issue → Decision → Action → Outcome
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SectionFrame, SectionTitle } from "@/components/streamlit";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const ENTITY_TYPES = [
  "risk",
  "issue",
  "decision",
  "action",
  "change_request",
  "dependency",
  "outcome",
] as const;

type EntityType = (typeof ENTITY_TYPES)[number];

type LinkRow = {
  id: string;
  project_id: string | null;
  from_entity_type: EntityType;
  from_entity_id: string;
  to_entity_type: EntityType;
  to_entity_id: string;
  link_role: string | null;
  notes: string | null;
};

export function GovernanceChainPanel({ projectId }: { projectId?: string }) {
  const { organization, session } = useAuth();
  const orgId = organization?.id;
  const qc = useQueryClient();
  const [fromType, setFromType] = useState<EntityType>("risk");
  const [toType, setToType] = useState<EntityType>("issue");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [notes, setNotes] = useState("");

  const linksQ = useQuery({
    queryKey: ["governance_links", orgId, projectId || "all"],
    queryFn: async () => {
      // Table added by executive_intelligence migration — may precede generated types.
      let q = (supabase as any)
        .from("governance_links")
        .select("*")
        .eq("org_id", orgId!);
      if (projectId) q = q.eq("project_id", projectId);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as LinkRow[];
    },
    enabled: !!orgId,
  });

  const risksQ = useQuery({
    queryKey: ["risks", orgId, "chain"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("risks")
        .select("id,title,project_id")
        .eq("org_id", orgId!)
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
  });
  const issuesQ = useQuery({
    queryKey: ["issues", orgId, "chain"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("issues")
        .select("id,title,project_id")
        .eq("org_id", orgId!)
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
  });
  const decisionsQ = useQuery({
    queryKey: ["decisions", orgId, "chain"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("decisions")
        .select("id,title,project_id")
        .eq("org_id", orgId!)
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
  });
  const actionsQ = useQuery({
    queryKey: ["actions", orgId, "chain"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("actions")
        .select("id,title,project_id")
        .eq("org_id", orgId!)
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const optionsFor = (type: EntityType) => {
    const filter = (rows: any[]) =>
      (projectId ? rows.filter((r) => r.project_id === projectId) : rows).map((r) => ({
        id: r.id as string,
        label: String(r.title || r.id),
        project_id: r.project_id as string | null,
      }));
    if (type === "risk") return filter(risksQ.data ?? []);
    if (type === "issue") return filter(issuesQ.data ?? []);
    if (type === "decision") return filter(decisionsQ.data ?? []);
    if (type === "action") return filter(actionsQ.data ?? []);
    return [];
  };

  const fromOpts = useMemo(() => optionsFor(fromType), [fromType, risksQ.data, issuesQ.data, decisionsQ.data, actionsQ.data, projectId]);
  const toOpts = useMemo(() => optionsFor(toType), [toType, risksQ.data, issuesQ.data, decisionsQ.data, actionsQ.data, projectId]);

  const labelByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of ENTITY_TYPES) {
      for (const o of optionsFor(t)) m.set(`${t}:${o.id}`, o.label);
    }
    return m;
  }, [risksQ.data, issuesQ.data, decisionsQ.data, actionsQ.data, projectId]);

  const createLink = useMutation({
    mutationFn: async () => {
      if (!orgId || !fromId || !toId) throw new Error("Select both ends of the chain");
      if (fromType === toType && fromId === toId) throw new Error("Cannot link an item to itself");
      const fromRow = fromOpts.find((o) => o.id === fromId);
      const { error } = await (supabase as any).from("governance_links").insert({
        org_id: orgId,
        project_id: projectId || fromRow?.project_id || null,
        from_entity_type: fromType,
        from_entity_id: fromId,
        to_entity_type: toType,
        to_entity_id: toId,
        link_role: "leads_to",
        notes: notes || null,
        created_by: session?.user?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["governance_links"] });
      toast.success("Cause-effect link created");
      setNotes("");
    },
    onError: (e: any) => toast.error(e.message || "Could not create link"),
  });

  const links = linksQ.data ?? [];

  return (
    <SectionFrame>
      <SectionTitle>Cause-and-effect chain</SectionTitle>
      <p className="mb-3 text-xs text-muted-foreground">
        Risk → Issue → Decision → Action → Outcome. Link governance objects so executives can follow
        the story, not isolated registers.
      </p>
      <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-5">
        <select
          className="st-input"
          value={fromType}
          onChange={(e) => {
            setFromType(e.target.value as EntityType);
            setFromId("");
          }}
        >
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              From: {t}
            </option>
          ))}
        </select>
        <select className="st-input md:col-span-1" value={fromId} onChange={(e) => setFromId(e.target.value)}>
          <option value="">— Select —</option>
          {fromOpts.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          className="st-input"
          value={toType}
          onChange={(e) => {
            setToType(e.target.value as EntityType);
            setToId("");
          }}
        >
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              To: {t}
            </option>
          ))}
        </select>
        <select className="st-input" value={toId} onChange={(e) => setToId(e.target.value)}>
          <option value="">— Select —</option>
          {toOpts.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <Button
          type="button"
          disabled={createLink.isPending}
          onClick={() => createLink.mutate()}
        >
          Link
        </Button>
      </div>
      <input
        className="st-input mb-3 w-full"
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">No governance links yet.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {links.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 border-b border-border/50 py-1.5">
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">
                {l.from_entity_type}
              </span>
              <span className="font-medium">
                {labelByKey.get(`${l.from_entity_type}:${l.from_entity_id}`) ||
                  l.from_entity_id.slice(0, 8)}
              </span>
              <span className="text-muted-foreground">→</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">
                {l.to_entity_type}
              </span>
              <span className="font-medium">
                {labelByKey.get(`${l.to_entity_type}:${l.to_entity_id}`) ||
                  l.to_entity_id.slice(0, 8)}
              </span>
              {l.notes ? (
                <span className="text-xs text-muted-foreground">· {l.notes}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </SectionFrame>
  );
}
