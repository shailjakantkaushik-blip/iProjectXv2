import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock, Send, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  ACTIONS_ASSIST_SELECT,
  DECISIONS_ASSIST_SELECT,
  PROJECT_ASSIST_SELECT,
  RISKS_ASSIST_SELECT,
  allowedAssistDomains,
  deniedDomainMessage,
  domainAllowed,
  scopeAssistBundle,
} from "@/lib/assist-access";
import { askInhouseAi, getInhouseAiStatus } from "@/lib/inhouse-ai.functions";
import { answerPortfolioQuestion } from "@/lib/local-portfolio-assist";
import { useAllowedPages } from "@/lib/permissions";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";

export const Route = createFileRoute("/_authenticated/app/ai-assist")({
  component: AiAssistPage,
});

type Msg = { role: "user" | "assistant"; text: string };

const PROMPTS = [
  "What needs attention this week?",
  "Which projects are Red and why should I care?",
  "List critical open risks with owners",
  "How much have we spent versus budget?",
  "What decisions are still awaiting approval?",
  "What’s overdue and who owns it?",
];

const LOCAL_TITLE = "In-house AI";
const APPROVED_TITLE = "Approved Open AI model";

function AiAssistPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const { canView, isReady } = useAllowedPages();
  const askModel = useServerFn(askInhouseAi);
  const statusFn = useServerFn(getInhouseAiStatus);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [modelConfigured, setModelConfigured] = useState(false);
  const [modelDetail, setModelDetail] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "I’m In-house AI. Ask in plain English about portfolio health, risks, approvals, spend, or a project name. I only use data your role can see (RLS + page permissions). Your organisation’s data stays local unless a platform admin enables an approved model for this org.",
    },
  ]);

  const productTitle = modelConfigured ? APPROVED_TITLE : LOCAL_TITLE;

  useEffect(() => {
    let cancelled = false;
    void statusFn()
      .then((s) => {
        if (cancelled) return;
        const on = Boolean(s.configured);
        setModelConfigured(on);
        setModelDetail(on && s.model ? String(s.model) : null);
        setMessages((m) => {
          if (m.length !== 1 || m[0]?.role !== "assistant") return m;
          if (on) {
            return [
              {
                role: "assistant",
                text: `I’m ${APPROVED_TITLE}${s.model ? ` (${s.model})` : ""}. Ask in plain English — answers are grounded in live org data under your RLS and page permissions. A capped context pack is sent only to your organisation’s approved endpoint (enabled by platform admin). If the model is unavailable, I fall back to In-house AI (local).`,
              },
            ];
          }
          return [
            {
              role: "assistant",
              text: `I’m ${LOCAL_TITLE}. Ask in plain English about portfolio health, risks, approvals, spend, or a project name. I only use data your role can see (RLS + page permissions). No data is sent to an external model for this organisation.`,
            },
          ];
        });
      })
      .catch(() => {
        /* local engine still works */
      });
    return () => {
      cancelled = true;
    };
  }, [statusFn]);

  const domains = useMemo(() => allowedAssistDomains(canView), [canView, isReady]);
  const accessNote = useMemo(() => deniedDomainMessage(domains), [domains]);

  const allowProjects = domainAllowed("projects", canView);
  const allowRisks = domainAllowed("risks", canView);
  const allowDecisions = domainAllowed("decisions", canView);
  const allowActions = domainAllowed("actions", canView);
  const allowBudget = domains.has("budget");
  const allowBenefits = domains.has("benefits");
  const needProjects =
    allowProjects || allowRisks || allowDecisions || allowActions || allowBudget || allowBenefits;

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", orgId, "ai-assist", PROJECT_ASSIST_SELECT],
    queryFn: async () =>
      (await supabase.from("projects").select(PROJECT_ASSIST_SELECT)).data ?? [],
    enabled: !!orgId && needProjects,
  });
  const { data: risks = [] } = useQuery({
    queryKey: ["risks", orgId, "ai-assist", RISKS_ASSIST_SELECT],
    queryFn: async () =>
      (await supabase.from("risks").select(RISKS_ASSIST_SELECT)).data ?? [],
    enabled: !!orgId && allowRisks,
  });
  const { data: decisions = [] } = useQuery({
    queryKey: ["decisions", orgId, "ai-assist", DECISIONS_ASSIST_SELECT],
    queryFn: async () =>
      (await supabase.from("decisions").select(DECISIONS_ASSIST_SELECT)).data ?? [],
    enabled: !!orgId && allowDecisions,
  });
  const { data: actions = [] } = useQuery({
    queryKey: ["actions", orgId, "ai-assist", ACTIONS_ASSIST_SELECT],
    queryFn: async () =>
      (await supabase.from("actions").select(ACTIONS_ASSIST_SELECT)).data ?? [],
    enabled: !!orgId && allowActions,
  });

  const bundle = useMemo(() => {
    if (!orgId) {
      return { projects: [], risks: [], decisions: [], actions: [] };
    }
    return scopeAssistBundle(
      {
        projects: projects as any[],
        risks: (allowRisks ? risks : []) as any[],
        decisions: (allowDecisions ? decisions : []) as any[],
        actions: (allowActions ? actions : []) as any[],
      },
      { orgId, domains },
    );
  }, [
    orgId,
    projects,
    risks,
    decisions,
    actions,
    domains,
    allowRisks,
    allowDecisions,
    allowActions,
  ]);

  const localReply = (q: string) =>
    answerPortfolioQuestion(q, bundle, {
      allowedDomains: domains,
      accessNote,
    });

  const answer = async (q: string): Promise<string> => {
    const fallback = localReply(q);
    if (!modelConfigured) return fallback;

    try {
      const res = await askModel({ data: { question: q } });
      if (res.ok && res.answer) {
        const note = accessNote ? `\n\n${accessNote}` : "";
        return `${res.answer}${note}`;
      }
      if (res.reason === "model_error") {
        return `${fallback}\n\n(${APPROVED_TITLE} temporarily unavailable — answered with ${LOCAL_TITLE}.)`;
      }
      return fallback;
    } catch {
      return `${fallback}\n\n(${APPROVED_TITLE} unavailable — answered with ${LOCAL_TITLE}.)`;
    }
  };

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setBusy(true);
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    try {
      const text = await answer(q);
      setMessages((m) => [...m, { role: "assistant", text }]);
    } finally {
      setBusy(false);
    }
  };

  const runPrompt = async (prompt: string) => {
    if (busy) return;
    setBusy(true);
    setInput("");
    setMessages((m) => [...m, { role: "user", text: prompt }]);
    try {
      const text = await answer(prompt);
      setMessages((m) => [...m, { role: "assistant", text }]);
    } finally {
      setBusy(false);
    }
  };

  const visiblePrompts = PROMPTS.filter((p) => {
    const lower = p.toLowerCase();
    if (lower.includes("risk") && !allowRisks) return false;
    if (lower.includes("budget") && !domains.has("budget")) return false;
    if (lower.includes("decision") && !allowDecisions) return false;
    if (lower.includes("overdue") && !allowActions) return false;
    return true;
  });

  return (
    <div>
      <PageHeading
        title={productTitle}
        subtitle={
          modelConfigured
            ? "Approved model for this organisation — grounded under RLS & page permissions"
            : "Private local answers from data your role can see — never leaves your org"
        }
      />

      <SectionFrame>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <SectionTitle>Chat</SectionTitle>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <Lock className="h-3 w-3" />
            {modelConfigured
              ? `${APPROVED_TITLE}${modelDetail ? ` · ${modelDetail}` : ""}`
              : `${LOCAL_TITLE} · local · no model egress`}
          </span>
        </div>

        {accessNote ? (
          <p className="mb-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            {accessNote}
          </p>
        ) : null}

        <div className="mb-3 flex flex-wrap gap-2">
          {visiblePrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={busy}
              className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-medium text-foreground hover:border-primary/40 disabled:opacity-50"
              onClick={() => void runPrompt(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="flex min-h-[22rem] max-h-[36rem] flex-col overflow-hidden rounded-xl border border-border bg-background sm:min-h-[26rem]">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-surface text-foreground"
                  }`}
                >
                  {m.role === "assistant" && (
                    <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Sparkles className="h-3 w-3" /> {productTitle}
                    </div>
                  )}
                  {m.text}
                </div>
              </div>
            ))}
            {busy ? (
              <div className="text-[11px] text-muted-foreground">Thinking…</div>
            ) : null}
          </div>

          <div className="border-t border-border p-3">
            <div className="flex items-end gap-2">
              <textarea
                className="st-input min-h-[5.5rem] flex-1 resize-y py-2.5 leading-relaxed"
                rows={3}
                placeholder='Try: “Which amber projects are overspending?” or “Tell me about <project name>”'
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button
                type="button"
                className="st-btn-primary st-btn-inline shrink-0 gap-1.5 self-end"
                onClick={() => void send()}
                disabled={!input.trim() || busy}
              >
                <Send className="h-3.5 w-3.5" />
                Ask
              </button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Enter to send · Shift+Enter for a new line.
              {modelConfigured
                ? ` Using ${APPROVED_TITLE} for this organisation (platform opt-in). Context stays on your approved endpoint — not public ChatGPT.`
                : ` Using ${LOCAL_TITLE}. No model egress for this organisation.`}
            </p>
          </div>
        </div>
      </SectionFrame>
    </div>
  );
}
