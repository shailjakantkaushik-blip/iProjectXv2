import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ForumSelect } from "@/components/forum-select";
import { RaidStreamSelect } from "@/components/raid-stream-select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  DECISION_OUTCOMES,
  memberLabel,
  type DecisionOutcome,
  type OrgMember,
} from "@/lib/decision-approval";
import { forumSelectNames, loadGovernanceChannels } from "@/lib/governance-forums";
import { fetchOrgStreams } from "@/lib/project-streams";
import { defaultStageGateDecisionTitle } from "@/lib/stage-gate-decision-fields";
import { recordStageGateDecision } from "@/lib/stage-gate-decision";
import { fetchGateChecklistBlockReason } from "@/lib/stage-gate-checklist";
import { normalizeGateStatus } from "@/lib/stage-gate-approval";
import { useProjectOptions } from "@/hooks/use-project-visibility";

export type StageGateDecisionRequest = {
  gateId: string;
  projectId: string;
  status: string;
  gateName?: string | null;
  streamId?: string | null;
};

type Ctx = {
  requestStageGateDecision: (req: StageGateDecisionRequest) => void;
};

const StageGateDecisionContext = createContext<Ctx | null>(null);

export function useStageGateDecision() {
  return useContext(StageGateDecisionContext);
}

export function StageGateDecisionProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<StageGateDecisionRequest | null>(null);
  return (
    <StageGateDecisionContext.Provider value={{ requestStageGateDecision: setRequest }}>
      {children}
      {request ? (
        <StageGateDecisionDialog request={request} onClose={() => setRequest(null)} />
      ) : null}
    </StageGateDecisionContext.Provider>
  );
}

function StageGateDecisionDialog({
  request,
  onClose,
}: {
  request: StageGateDecisionRequest;
  onClose: () => void;
}) {
  const { organization, profile } = useAuth();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const { data: projects = [] } = useProjectOptions(orgId);

  const { data: members = [] } = useQuery({
    queryKey: ["org-members", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .eq("org_id", orgId!)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as OrgMember[];
    },
    enabled: !!orgId,
  });

  const { data: streams = [] } = useQuery({
    queryKey: ["project_streams", orgId],
    queryFn: () => fetchOrgStreams(orgId!),
    enabled: !!orgId,
  });

  const { data: channelPack } = useQuery({
    queryKey: ["governance_channels", orgId],
    queryFn: () => loadGovernanceChannels(),
    enabled: !!orgId,
    staleTime: 60_000,
  });
  const forums = channelPack?.channels ?? [];

  const { data: gate } = useQuery({
    queryKey: ["stage_gates", orgId, request.gateId, "decision-dialog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_gates")
        .select("id,project_id,stream_id,gate_name,status")
        .eq("id", request.gateId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!request.gateId,
  });

  const project = useMemo(
    () => projects.find((p: { id: string }) => p.id === request.projectId) as
      | {
          id: string;
          project_code?: string | null;
          name?: string | null;
          program?: string | null;
          portfolio?: string | null;
          sponsor?: string | null;
        }
      | undefined,
    [projects, request.projectId],
  );

  const gateName = String(request.gateName || gate?.gate_name || "").trim() || "Stage gate";
  const requestedOutcome = normalizeGateStatus(request.status) as DecisionOutcome;

  const [form, setForm] = useState({
    stream_id: request.streamId || "",
    forum: "",
    sponsor: "",
    approver_user_id: "",
    owner: profile?.full_name || "",
    outcome: requestedOutcome,
    decision_date: new Date().toISOString().slice(0, 10),
    required_date: "",
    title: defaultStageGateDecisionTitle(gateName, requestedOutcome),
    options: "",
    recommendation: "",
    schedule_impact_days: "",
    cost_impact: "",
    rationale: "",
    notes: "",
  });

  useEffect(() => {
    setForm((f) => ({
      ...f,
      stream_id: request.streamId || gate?.stream_id || f.stream_id || "",
      sponsor: f.sponsor || project?.sponsor || "",
      owner: f.owner || profile?.full_name || "",
      outcome: requestedOutcome,
      title:
        f.title === defaultStageGateDecisionTitle(gateName, f.outcome) || !f.title
          ? defaultStageGateDecisionTitle(gateName, requestedOutcome)
          : f.title,
    }));
  }, [request.streamId, gate?.stream_id, project?.sponsor, profile?.full_name, requestedOutcome, gateName]);

  useEffect(() => {
    const names = forumSelectNames(forums, { project: project || null });
    if (!names.length) return;
    setForm((f) => (f.forum && names.includes(f.forum) ? f : { ...f, forum: names[0] }));
  }, [forums, project]);

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const save = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("Organisation required");
      if (/approved/i.test(form.outcome)) {
        const reason = await fetchGateChecklistBlockReason(supabase as never, {
          orgId,
          stageGateId: request.gateId,
          gateName,
        });
        if (reason) throw new Error(reason);
      }
      await recordStageGateDecision({
        orgId,
        projectId: request.projectId,
        stageGateId: request.gateId,
        streamId: form.stream_id || gate?.stream_id || null,
        program: project?.program || null,
        forum: form.forum || null,
        sponsor: form.sponsor || project?.sponsor || null,
        approverUserId: form.approver_user_id,
        approver: memberById.get(form.approver_user_id) || null,
        owner: form.owner || null,
        outcome: form.outcome,
        decisionDate: form.decision_date,
        requiredDate: form.required_date || null,
        title: form.title,
        options: form.options || null,
        recommendation: form.recommendation || null,
        scheduleImpactDays: form.schedule_impact_days ? Number(form.schedule_impact_days) : null,
        costImpact: form.cost_impact ? Number(form.cost_impact) : null,
        rationale: form.rationale || null,
        notes: form.notes || null,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["decisions"] });
      void qc.invalidateQueries({ queryKey: ["stage_gates"] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["project"] });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      window.dispatchEvent(new CustomEvent("pmo:data-changed"));
      toast.success("Decision recorded — stage gate approval updated");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const projectLabel = project
    ? `${project.project_code || ""} · ${project.name || ""}`.replace(/^ · /, "")
    : "This project";

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !save.isPending) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Record stage-gate decision</DialogTitle>
          <DialogDescription>
            Same fields as the Decisions log. Submitting captures this as a new decision and
            updates stage-gate approval on the project (and matching stream gates).
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid grid-cols-1 gap-2 md:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="md:col-span-2">
            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
              Project
            </label>
            <input className="st-input" value={projectLabel} readOnly />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
              Stage gate approval
            </label>
            <input className="st-input" value={gateName} readOnly />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
              Stream (optional)
            </label>
            <RaidStreamSelect
              streams={streams}
              projectId={request.projectId}
              value={form.stream_id}
              onChange={(stream_id) => setForm((f) => ({ ...f, stream_id }))}
            />
          </div>
          <ForumSelect
            channels={forums}
            project={project || null}
            extra={[form.forum]}
            value={form.forum}
            onChange={(forum) => setForm((f) => ({ ...f, forum }))}
          />
          <input
            className="st-input"
            placeholder="Sponsor"
            value={form.sponsor}
            onChange={(e) => setForm((f) => ({ ...f, sponsor: e.target.value }))}
          />
          <select
            className="st-input"
            value={form.approver_user_id}
            onChange={(e) => setForm((f) => ({ ...f, approver_user_id: e.target.value }))}
            required
          >
            <option value="">— Approver (notifies in-app) —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {memberLabel(m)}
              </option>
            ))}
          </select>
          <input
            className="st-input"
            placeholder="Owner"
            value={form.owner}
            onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
          />
          <select
            className="st-input"
            value={form.outcome}
            onChange={(e) => {
              const outcome = e.target.value as DecisionOutcome;
              setForm((f) => ({
                ...f,
                outcome,
                title:
                  f.title === defaultStageGateDecisionTitle(gateName, f.outcome)
                    ? defaultStageGateDecisionTitle(gateName, outcome)
                    : f.title,
              }));
            }}
          >
            {DECISION_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <input
            className="st-input"
            type="date"
            value={form.decision_date}
            onChange={(e) => setForm((f) => ({ ...f, decision_date: e.target.value }))}
          />
          <input
            className="st-input md:col-span-3"
            placeholder="Decision title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
          <input
            className="st-input"
            type="date"
            title="Required by"
            value={form.required_date}
            onChange={(e) => setForm((f) => ({ ...f, required_date: e.target.value }))}
          />
          <textarea
            className="st-input md:col-span-2"
            placeholder="Options (one per line)"
            rows={2}
            value={form.options}
            onChange={(e) => setForm((f) => ({ ...f, options: e.target.value }))}
          />
          <textarea
            className="st-input md:col-span-2"
            placeholder="Recommendation"
            rows={2}
            value={form.recommendation}
            onChange={(e) => setForm((f) => ({ ...f, recommendation: e.target.value }))}
          />
          <input
            className="st-input"
            type="number"
            placeholder="Schedule impact (days) if delayed"
            value={form.schedule_impact_days}
            onChange={(e) => setForm((f) => ({ ...f, schedule_impact_days: e.target.value }))}
          />
          <input
            className="st-input"
            type="number"
            placeholder="Cost impact ($)"
            value={form.cost_impact}
            onChange={(e) => setForm((f) => ({ ...f, cost_impact: e.target.value }))}
          />
          <textarea
            className="st-input md:col-span-2"
            placeholder="Rationale"
            rows={2}
            value={form.rationale}
            onChange={(e) => setForm((f) => ({ ...f, rationale: e.target.value }))}
          />
          <textarea
            className="st-input md:col-span-2"
            placeholder="Notes / info"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
          <div className="md:col-span-4 flex flex-wrap justify-end gap-2 pt-1">
            <button
              type="button"
              className="st-btn-secondary"
              disabled={save.isPending}
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className="st-btn-primary" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Submit decision"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
