import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchLandingConfig,
  readCachedLandingConfigForPaint,
  DEFAULT_LANDING,
} from "@/lib/landing-config";
import { PageLoading } from "@/components/page-loading";
import { ArrowLeft, Home } from "lucide-react";

export const Route = createFileRoute("/legal/$slug")({
  loader: async ({ params }) => {
    const [{ data: policy, error }, cfg] = await Promise.all([
      (supabase as any)
        .from("legal_policies")
        .select("slug,title,category,body_markdown,updated_at")
        .eq("slug", params.slug)
        .eq("published", true)
        .maybeSingle(),
      fetchLandingConfig(),
    ]);
    if (error) throw error;
    return { policy, cfg };
  },
  pendingMs: 0,
  pendingComponent: LegalPending,
  component: LegalPolicyPage,
  head: ({ loaderData }) => ({
    meta: loaderData?.policy
      ? [{ title: `${loaderData.policy.title} — iProjectX` }]
      : [{ title: "Legal — iProjectX" }],
  }),
});

function LegalPending() {
  const cached = typeof window !== "undefined" ? readCachedLandingConfigForPaint() : null;
  const p = cached?.palette ?? DEFAULT_LANDING.palette;
  const theme = cached?.theme ?? "light";
  const bg = theme === "dark" ? p.navy : "#ffffff";
  return (
    <PageLoading
      label="Loading…"
      style={{ background: bg }}
      className={theme === "dark" ? "text-white" : undefined}
    />
  );
}

function markdownToHtml(md: string): string {
  // Very lightweight markdown renderer — enough for policy documents
  // (headings, bold, italic, tables, lists, code, horizontal rules)
  let html = md
    // Escape HTML chars
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Headings
  html = html.replace(/^######\s(.+)$/gm, "<h6>$1</h6>");
  html = html.replace(/^#####\s(.+)$/gm, "<h5>$1</h5>");
  html = html.replace(/^####\s(.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^###\s(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s(.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s(.+)$/gm, "<h1>$1</h1>");

  // Horizontal rule
  html = html.replace(/^-{3,}$/gm, "<hr/>");

  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Unordered list lines (collect consecutive)
  html = html.replace(/(?:^- .+$\n?)+/gm, (block) => {
    const items = block
      .trim()
      .split("\n")
      .map((l) => `<li>${l.replace(/^-\s/, "")}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  });

  // Ordered list lines
  html = html.replace(/(?:^\d+\.\s.+$\n?)+/gm, (block) => {
    const items = block
      .trim()
      .split("\n")
      .map((l) => `<li>${l.replace(/^\d+\.\s/, "")}</li>`)
      .join("");
    return `<ol>${items}</ol>`;
  });

  // Simple table detection (| col | col |)
  html = html.replace(/(?:^\|.+\|$\n?)+/gm, (block) => {
    const lines = block.trim().split("\n");
    const rows = lines.filter((l) => !l.match(/^\|[-| :]+\|$/));
    const tableRows = rows
      .map((row, i) => {
        const cells = row
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((cell) => cell.trim());
        const tag = i === 0 ? "th" : "td";
        return `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join("")}</tr>`;
      })
      .join("");
    return `<table>${tableRows}</table>`;
  });

  // Paragraphs — wrap non-block lines in <p>
  html = html
    .split(/\n{2,}/)
    .map((block) => {
      block = block.trim();
      if (!block) return "";
      if (/^<(h[1-6]|ul|ol|li|table|hr|pre|blockquote)/.test(block)) return block;
      return `<p>${block.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("\n");

  return html;
}

function LegalPolicyPage() {
  const { policy, cfg } = Route.useLoaderData();
  const p = cfg.palette;
  const isDark = cfg.theme === "dark";
  const bg = isDark ? p.navy : "#fafbfc";

  // Fetch all published policies for sidebar nav
  const { data: allPolicies = [] } = useQuery({
    queryKey: ["published_policies_nav"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("legal_policies")
        .select("slug,title,category,sort_order")
        .eq("published", true)
        .order("category")
        .order("sort_order");
      return (data ?? []) as { slug: string; title: string; category: string; sort_order: number }[];
    },
  });

  const byCategory: Record<string, typeof allPolicies> = {};
  for (const pol of allPolicies) {
    if (!byCategory[pol.category]) byCategory[pol.category] = [];
    byCategory[pol.category].push(pol);
  }

  const { slug } = Route.useParams();

  if (!policy) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center"
        style={{ background: bg }}
      >
        <h1
          className="text-2xl font-bold"
          style={{ color: p.textHeading, fontFamily: "'Sora', system-ui, sans-serif" }}
        >
          Policy not found
        </h1>
        <p className="mt-2 text-sm" style={{ color: p.textMuted }}>
          This policy may not be published yet or the URL is incorrect.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-2 text-sm font-semibold"
          style={{ color: p.accent }}
        >
          <Home className="h-4 w-4" /> Return home
        </Link>
      </div>
    );
  }

  const html = markdownToHtml(policy.body_markdown ?? "");

  return (
    <div className="min-h-screen antialiased" style={{ background: bg }}>
      {/* Top nav bar */}
      <nav
        className="sticky top-0 z-40 border-b backdrop-blur-xl"
        style={{
          borderColor: p.surface,
          background: isDark ? `${p.navy}f0` : "rgba(255,255,255,0.92)",
        }}
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-5 sm:px-6">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm font-semibold transition-opacity hover:opacity-70"
            style={{ color: p.textMuted }}
          >
            <ArrowLeft className="h-4 w-4" />
            {cfg.brand.name}
          </Link>
          <span style={{ color: p.surface }}>›</span>
          <span className="text-sm font-medium" style={{ color: p.textHeading }}>
            {policy.title}
          </span>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-6 lg:flex lg:gap-10">
        {/* Sidebar */}
        {allPolicies.length > 0 && (
          <aside className="mb-8 shrink-0 lg:mb-0 lg:w-56">
            <div className="lg:sticky lg:top-24">
              {Object.entries(byCategory).map(([cat, items]) => (
                <div key={cat} className="mb-5">
                  <p
                    className="mb-1.5 text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: p.textMuted }}
                  >
                    {cat}
                  </p>
                  <ul className="space-y-0.5">
                    {items.map((pol) => (
                      <li key={pol.slug}>
                        <Link
                          to="/legal/$slug"
                          params={{ slug: pol.slug }}
                          className="block rounded-md px-3 py-1.5 text-sm transition-colors"
                          style={{
                            color: pol.slug === slug ? p.accent : p.textMuted,
                            background:
                              pol.slug === slug
                                ? isDark
                                  ? `${p.accent}22`
                                  : `${p.accent}12`
                                : "transparent",
                            fontWeight: pol.slug === slug ? 600 : 400,
                          }}
                        >
                          {pol.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* Content */}
        <article className="min-w-0 flex-1">
          <div
            className="mb-6 border-b pb-6"
            style={{ borderColor: p.surface }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: p.accent }}>
              {policy.category}
            </p>
            <h1
              className="mt-2 text-3xl font-bold tracking-tight"
              style={{
                color: p.textHeading,
                fontFamily: "'Sora', system-ui, sans-serif",
              }}
            >
              {policy.title}
            </h1>
            <p className="mt-2 text-xs" style={{ color: p.textMuted }}>
              Last updated{" "}
              {new Date(policy.updated_at).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>

          <div
            className="legal-prose max-w-prose"
            style={{ color: p.textBody }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </article>
      </div>

      {/* Footer */}
      <footer
        className="mt-16 border-t px-5 py-8 text-center text-xs sm:px-6"
        style={{ borderColor: p.surface, color: p.textMuted }}
      >
        {cfg.footer.text || `© ${new Date().getFullYear()} ${cfg.brand.name}`} ·{" "}
        <Link to="/" style={{ color: p.accent }}>
          Home
        </Link>{" "}
        ·{" "}
        <Link to="/legal/privacy-policy" style={{ color: p.accent }}>
          Privacy
        </Link>{" "}
        ·{" "}
        <Link to="/legal/terms-of-service" style={{ color: p.accent }}>
          Terms
        </Link>
      </footer>

      <style>{`
        .legal-prose h1 { font-size: 1.875rem; font-weight: 700; margin-top: 2rem; margin-bottom: 1rem; font-family: 'Sora', system-ui, sans-serif; }
        .legal-prose h2 { font-size: 1.375rem; font-weight: 700; margin-top: 2rem; margin-bottom: 0.75rem; font-family: 'Sora', system-ui, sans-serif; }
        .legal-prose h3 { font-size: 1.125rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.5rem; }
        .legal-prose h4, .legal-prose h5, .legal-prose h6 { font-weight: 600; margin-top: 1rem; margin-bottom: 0.5rem; }
        .legal-prose p { margin-bottom: 1rem; line-height: 1.75; }
        .legal-prose ul, .legal-prose ol { margin-left: 1.5rem; margin-bottom: 1rem; }
        .legal-prose li { margin-bottom: 0.25rem; line-height: 1.7; }
        .legal-prose ul li { list-style-type: disc; }
        .legal-prose ol li { list-style-type: decimal; }
        .legal-prose strong { font-weight: 600; }
        .legal-prose code { font-family: monospace; font-size: 0.875em; background: rgba(0,0,0,0.06); padding: 0.1em 0.4em; border-radius: 3px; }
        .legal-prose hr { border: none; border-top: 1px solid currentColor; opacity: 0.2; margin: 1.5rem 0; }
        .legal-prose table { width: 100%; border-collapse: collapse; margin-bottom: 1.25rem; font-size: 0.875rem; }
        .legal-prose th, .legal-prose td { padding: 0.5rem 0.75rem; border: 1px solid rgba(0,0,0,0.12); text-align: left; }
        .legal-prose th { font-weight: 600; background: rgba(0,0,0,0.04); }
      `}</style>
    </div>
  );
}
