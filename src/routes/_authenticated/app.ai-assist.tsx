import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

function AiAssistPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const { canView, isReady } = useAllowedPages();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "I’m iProjectX In-house AI. Ask in plain English — for example which projects are off track, who owns critical risks, how spend compares to budget, or “tell me about <project name>”. I answer only from data your role can already see under RLS and page permissions. Nothing is sent to ChatGPT or any external model.",
    },
  ]);

  const domains = useMemo(() => allowedAssistDomains(canView), [canView, isReady]);
  const accessNote = useMemo(() => deniedDomainMessage(domains), [domains]);

  const allowProjects = domainAllowed("projects", canView);
  const allowRisks = domainAllowed("risks", canView);
  const allowDecisions = domainAllowed("decisions", canView);
  const allowActions = domainAllowed("actions", canView);
  const allowBudget = domains.has("budget");
  const allowBenefits = domains.has("benefits");
  // Load RLS project rows whenever any AI domain needs attribution or finance fields.
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

  const reply = (q: string) =>
    answerPortfolioQuestion(q, bundle, {
      allowedDomains: domains,
      accessNote,
    });

  const send = () => {
    const q = input.trim();
    if (!q) return;
    setMessages((m) => [...m, { role: "user", text: q }, { role: "assistant", text: reply(q) }]);
    setInput("");
  };

  const runPrompt = (prompt: string) => {
    setInput("");
    setMessages((m) => [
      ...m,
      { role: "user", text: prompt },
      { role: "assistant", text: reply(prompt) },
    ]);
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
        title="In-house AI"
        subtitle="Plain-English answers from data your role can see — never leaves your org"
      />

      <SectionFrame>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <SectionTitle>Chat</SectionTitle>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <Lock className="h-3 w-3" />
            In-house · RLS · page ACL
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
              className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-medium text-foreground hover:border-primary/40"
              onClick={() => runPrompt(prompt)}
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
                      <Sparkles className="h-3 w-3" /> In-house AI
                    </div>
                  )}
                  {m.text}
                </div>
              </div>
            ))}
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
                    send();
                  }
                }}
              />
              <button
                type="button"
                className="st-btn-primary st-btn-inline shrink-0 gap-1.5 self-end"
                onClick={send}
                disabled={!input.trim()}
              >
                <Send className="h-3.5 w-3.5" />
                Ask
              </button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Enter to send · Shift+Enter for a new line. Answers use only projects and registers
              your role can view (RLS + page permissions). Nothing is sent to an external model —
              no extra AI egress.
            </p>
          </div>
        </div>
      </SectionFrame>
    </div>
  );
}
