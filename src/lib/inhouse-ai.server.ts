import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACTIONS_ASSIST_SELECT,
  DECISIONS_ASSIST_SELECT,
  PROJECT_ASSIST_SELECT,
  RISKS_ASSIST_SELECT,
  allowedAssistDomains,
  domainAllowed,
  scopeAssistBundle,
  type AssistDomain,
} from "@/lib/assist-access";
import {
  INHOUSE_AI_SYSTEM_PROMPT,
  buildAssistContextPack,
} from "@/lib/inhouse-ai-context";
import type { AssistBundle } from "@/lib/local-portfolio-assist";
import { resolveCanViewPage } from "@/lib/permissions";

export type InhouseAiConfig = {
  enabled: boolean;
  configured: boolean;
  baseUrl: string | null;
  model: string | null;
  hasApiKey: boolean;
  label: string;
};

function envFlag(name: string): boolean {
  const v = (process.env[name] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Approved OpenAI-compatible endpoint (Azure OpenAI, Ollama, vLLM, private gateway). */
export function getInhouseAiConfig(): InhouseAiConfig {
  const baseUrl = (process.env.INHOUSE_AI_BASE_URL || "").trim().replace(/\/$/, "") || null;
  const model = (process.env.INHOUSE_AI_MODEL || "").trim() || null;
  const apiKey = (process.env.INHOUSE_AI_API_KEY || "").trim();
  const label = (process.env.INHOUSE_AI_LABEL || "Approved in-house model").trim();
  // Enabled when explicitly on, or when base+model are set (ops convenience).
  const explicit = process.env.INHOUSE_AI_ENABLED;
  const enabled =
    explicit == null || explicit === ""
      ? Boolean(baseUrl && model)
      : envFlag("INHOUSE_AI_ENABLED");
  const configured = Boolean(enabled && baseUrl && model);
  return {
    enabled,
    configured,
    baseUrl,
    model,
    hasApiKey: Boolean(apiKey),
    label,
  };
}

function chatCompletionsUrl(baseUrl: string): string {
  let url = baseUrl.includes("/chat/completions")
    ? baseUrl
    : `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const apiVersion = (process.env.INHOUSE_AI_API_VERSION || "").trim();
  if (apiVersion && !/[?&]api-version=/i.test(url)) {
    url += `${url.includes("?") ? "&" : "?"}api-version=${encodeURIComponent(apiVersion)}`;
  }
  return url;
}

export async function callApprovedModel(opts: {
  question: string;
  contextPack: string;
}): Promise<string> {
  const cfg = getInhouseAiConfig();
  if (!cfg.configured || !cfg.baseUrl || !cfg.model) {
    throw new Error("Approved in-house model is not configured");
  }

  const apiKey = (process.env.INHOUSE_AI_API_KEY || "").trim();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  // Azure OpenAI often wants api-key header as well
  if (apiKey && /openai\.azure\.com/i.test(cfg.baseUrl)) {
    headers["api-key"] = apiKey;
  }

  const maxTokens = Math.min(
    1200,
    Math.max(200, Number(process.env.INHOUSE_AI_MAX_TOKENS || 800) || 800),
  );

  const controller = new AbortController();
  const timeoutMs = Math.min(
    60_000,
    Math.max(5_000, Number(process.env.INHOUSE_AI_TIMEOUT_MS || 25_000) || 25_000),
  );
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(chatCompletionsUrl(cfg.baseUrl), {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: INHOUSE_AI_SYSTEM_PROMPT },
          {
            role: "user",
            content: `${opts.contextPack}\n\nQUESTION:\n${opts.question}\n\nAnswer using only the context above.`,
          },
        ],
      }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(
        `Approved model HTTP ${resp.status}${body ? `: ${body.slice(0, 180)}` : ""}`,
      );
    }

    const json = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("Approved model returned an empty answer");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function loadUserRoles(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("user_roles")
    .select("role,org_id")
    .eq("user_id", userId);
  const roles = (data ?? [])
    .filter((r: any) => r.org_id == null || r.org_id === orgId)
    .map((r: any) => String(r.role));
  return [...new Set(roles)];
}

async function loadPagePermissionRows(supabase: SupabaseClient, orgId: string) {
  const { data } = await (supabase as any)
    .from("role_table_permissions")
    .select("role,table_name,can_view")
    .eq("org_id", orgId);
  return (data ?? []) as Array<{ role: string; table_name: string; can_view: boolean }>;
}

/** Load RLS-scoped assist bundle for the authenticated user and apply page ACL. */
export async function loadScopedAssistBundleForUser(opts: {
  supabase: SupabaseClient;
  userId: string;
  orgId: string;
}): Promise<{ bundle: AssistBundle; domains: Set<AssistDomain> }> {
  const { supabase, userId, orgId } = opts;
  const roles = await loadUserRoles(supabase, userId, orgId);
  const rows = await loadPagePermissionRows(supabase, orgId);
  const canView = (path: string) => resolveCanViewPage(path, roles, rows);
  const domains = allowedAssistDomains(canView);

  const needProjects =
    domainAllowed("projects", canView) ||
    domainAllowed("risks", canView) ||
    domainAllowed("decisions", canView) ||
    domainAllowed("actions", canView) ||
    domains.has("budget") ||
    domains.has("benefits");

  const [projectsRes, risksRes, decisionsRes, actionsRes] = await Promise.all([
    needProjects
      ? supabase.from("projects").select(PROJECT_ASSIST_SELECT)
      : Promise.resolve({ data: [] as any[] }),
    domainAllowed("risks", canView)
      ? supabase.from("risks").select(RISKS_ASSIST_SELECT)
      : Promise.resolve({ data: [] as any[] }),
    domainAllowed("decisions", canView)
      ? supabase.from("decisions").select(DECISIONS_ASSIST_SELECT)
      : Promise.resolve({ data: [] as any[] }),
    domainAllowed("actions", canView)
      ? supabase.from("actions").select(ACTIONS_ASSIST_SELECT)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const bundle = scopeAssistBundle(
    {
      projects: (projectsRes.data ?? []) as any[],
      risks: (risksRes.data ?? []) as any[],
      decisions: (decisionsRes.data ?? []) as any[],
      actions: (actionsRes.data ?? []) as any[],
    },
    { orgId, domains },
  );

  return { bundle, domains };
}

export function contextPackForBundle(bundle: AssistBundle): string {
  return buildAssistContextPack(bundle);
}
