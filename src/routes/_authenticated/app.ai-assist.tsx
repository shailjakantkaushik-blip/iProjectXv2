import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";

export const Route = createFileRoute("/_authenticated/app/ai-assist")({
  component: AiAssistPage,
});

type Msg = { role: "user" | "assistant"; text: string };

function AiAssistPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "Ask about portfolio health, risks, approvals, spend, or what needs attention this week. Answers are generated from live org data (local assist — no external model call).",
    },
  ]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", orgId],
    queryFn: async () => (await supabase.from("projects").select("*")).data ?? [],
    enabled: !!orgId,
  });
  const { data: risks = [] } = useQuery({
    queryKey: ["risks", orgId],
    queryFn: async () => (await supabase.from("risks").select("*")).data ?? [],
    enabled: !!orgId,
  });
  const { data: decisions = [] } = useQuery({
    queryKey: ["decisions", orgId],
    queryFn: async () => (await supabase.from("decisions").select("*")).data ?? [],
    enabled: !!orgId,
  });

  const snapshot = useMemo(() => {
    const red = projects.filter((p: any) => p.rag === "Red").length;
    const amber = projects.filter((p: any) => p.rag === "Amber").length;
    const budget = projects.reduce((s: number, p: any) => s + Number(p.budget || 0), 0);
    const openRisks = risks.filter((r: any) => r.status === "Open" || r.status === "Mitigating").length;
    const criticalRisks = risks.filter((r: any) => Number(r.severity || 0) >= 15).length;
    const pendingDecisions = decisions.filter(
      (d: any) => !d.outcome || d.outcome === "Pending" || d.outcome === "In Review",
    ).length;
    return { red, amber, budget, openRisks, criticalRisks, pendingDecisions, total: projects.length };
  }, [projects, risks, decisions]);

  const answer = (q: string) => {
    const query = q.toLowerCase();
    if (query.includes("risk")) {
      return `There are ${snapshot.openRisks} open/mitigating risks, including ${snapshot.criticalRisks} with severity ≥ 15. Focus mitigation on Red/Amber projects first.`;
    }
    if (query.includes("approv") || query.includes("decision")) {
      return `${snapshot.pendingDecisions} decisions are still Pending or In Review. Use My Work → Approvals inbox to clear the queue.`;
    }
    if (query.includes("budget") || query.includes("spend") || query.includes("financ")) {
      const money = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(snapshot.budget);
      return `Portfolio budget across ${snapshot.total} projects is about ${money}. Check Financials and FY Allocation for forecast vs actual detail.`;
    }
    if (query.includes("rag") || query.includes("health") || query.includes("status")) {
      return `Portfolio health: ${snapshot.red} Red, ${snapshot.amber} Amber, of ${snapshot.total} projects. Executive Dashboard has the full cockpit.`;
    }
    if (query.includes("week") || query.includes("attention") || query.includes("focus")) {
      return `This week: clear ${snapshot.pendingDecisions} pending decisions, review ${snapshot.criticalRisks} critical risks, and triage ${snapshot.red} Red projects.`;
    }
    return `Live snapshot — Projects: ${snapshot.total} · Red: ${snapshot.red} · Amber: ${snapshot.amber} · Open risks: ${snapshot.openRisks} · Decisions awaiting outcome: ${snapshot.pendingDecisions}. Try asking about risks, approvals, budget, or health.`;
  };

  const send = () => {
    const q = input.trim();
    if (!q) return;
    setMessages((m) => [...m, { role: "user", text: q }, { role: "assistant", text: answer(q) }]);
    setInput("");
  };

  return (
    <div>
      <PageHeading
        title="AI Assist"
        subtitle="Portfolio Q&A grounded in your live PMO data"
      />

      <SectionFrame>
        <SectionTitle>Assistant</SectionTitle>
        <div className="mb-3 flex flex-wrap gap-2">
          {[
            "What needs attention this week?",
            "How is portfolio health?",
            "Summarise open risks",
            "Any decisions awaiting approval?",
          ].map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-medium text-foreground hover:border-primary/40"
              onClick={() => {
                setInput(prompt);
                setMessages((m) => [
                  ...m,
                  { role: "user", text: prompt },
                  { role: "assistant", text: answer(prompt) },
                ]);
              }}
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="flex max-h-[28rem] flex-col overflow-hidden rounded-xl border border-border bg-background">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-surface text-foreground"
                  }`}
                >
                  {m.role === "assistant" && (
                    <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Sparkles className="h-3 w-3" /> Assist
                    </div>
                  )}
                  {m.text}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 border-t border-border p-3">
            <input
              className="st-input flex-1"
              placeholder="Ask the portfolio…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <button type="button" className="st-btn-primary" onClick={send}>
              Ask
            </button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Local assist uses live Supabase data in this browser session. External LLM providers can be
          wired later without changing this UX.
        </p>
      </SectionFrame>
    </div>
  );
}
