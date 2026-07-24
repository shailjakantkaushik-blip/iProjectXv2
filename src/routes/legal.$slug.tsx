import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchLandingConfig,
  readCachedLandingConfigForPaint,
  DEFAULT_LANDING,
  resolveBrandLogoUrl,
  resolveBrandLogoDims,
  type LandingConfig,
} from "@/lib/landing-config";
import { PageLoading } from "@/components/page-loading";
import { StableBrandLogo } from "@/components/stable-brand-logo";
import { ArrowLeft } from "lucide-react";

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

const HEADING = { fontFamily: "'Sora', system-ui, sans-serif" } as const;
const BODY = { fontFamily: "'DM Sans', system-ui, sans-serif" } as const;

function LegalPending() {
  const cached = typeof window !== "undefined" ? readCachedLandingConfigForPaint() : null;
  const p = cached?.palette ?? DEFAULT_LANDING.palette;
  const theme = cached?.theme ?? "light";
  const bg = theme === "dark" ? p.navy : "#fafbfc";
  return (
    <PageLoading
      label="Loading…"
      style={{ background: bg }}
      className={theme === "dark" ? "text-white" : undefined}
    />
  );
}

function BrandMark({ cfg }: { cfg: LandingConfig }) {
  const logoUrl = resolveBrandLogoUrl(cfg.brand, "landing");
  const dims = resolveBrandLogoDims(cfg.brand, "landing");
  const p = cfg.palette;
  if (logoUrl) {
    return (
      <StableBrandLogo
        src={logoUrl}
        alt={cfg.brand.name}
        heightPx={Math.min(32, dims.heightPx)}
        maxWidthPx={Math.min(160, dims.maxWidthPx)}
      />
    );
  }
  return (
    <span className="text-lg font-bold tracking-tight" style={{ ...HEADING, color: p.textHeading }}>
      {cfg.brand.name}
    </span>
  );
}

/** Strip leading H1 / Last updated so UI header is not duplicated. */
function stripRedundantHeader(md: string): string {
  let s = (md ?? "").trim();
  s = s.replace(/^#\s+[^\n]+\n+/, "");
  s = s.replace(/^\*?Last updated[^\n]*\*?\s*\n+/i, "");
  s = s.replace(/^\*?Last updated[^\n]*\*?\s*\n+/i, "");
  return s.trim();
}

function markdownToHtml(md: string): string {
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/^######\s(.+)$/gm, "<h6>$1</h6>");
  html = html.replace(/^#####\s(.+)$/gm, "<h5>$1</h5>");
  html = html.replace(/^####\s(.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^###\s(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s(.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s(.+)$/gm, "<h2>$1</h2>"); // demote stray H1

  html = html.replace(/^-{3,}$/gm, "<hr/>");
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  html = html.replace(/(?:^- .+$\n?)+/gm, (block) => {
    const items = block
      .trim()
      .split("\n")
      .map((l) => `<li>${l.replace(/^-\s/, "")}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  });

  html = html.replace(/(?:^\d+\.\s.+$\n?)+/gm, (block) => {
    const items = block
      .trim()
      .split("\n")
      .map((l) => `<li>${l.replace(/^\d+\.\s/, "")}</li>`)
      .join("");
    return `<ol>${items}</ol>`;
  });

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
  const pageBg = isDark ? p.navy : "#fafbfc";
  const panelBg = isDark ? p.navyLight : "#ffffff";

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
      <div className="flex min-h-screen flex-col items-center justify-center px-5" style={{ ...BODY, background: pageBg }}>
        <h1 className="text-2xl font-bold" style={{ ...HEADING, color: p.textHeading }}>
          Policy not found
        </h1>
        <p className="mt-2 text-sm" style={{ color: p.textMuted }}>
          This policy may not be published yet or the URL is incorrect.
        </p>
        <Link to="/" className="mt-6 text-sm font-semibold" style={{ color: p.accent }}>
          Return home
        </Link>
      </div>
    );
  }

  const html = markdownToHtml(stripRedundantHeader(policy.body_markdown ?? ""));

  return (
    <div className="min-h-screen antialiased" style={{ ...BODY, background: pageBg, color: p.textBody }}>
      {/* Landing-aligned atmosphere */}
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background: isDark
            ? `radial-gradient(ellipse 70% 40% at 90% 0%, ${p.accent}22 0%, transparent 50%), ${p.navy}`
            : `radial-gradient(ellipse 80% 50% at 100% -10%, ${p.accent}14 0%, transparent 45%),
               radial-gradient(ellipse 50% 40% at 0% 100%, ${p.navy}08 0%, transparent 50%),
               ${pageBg}`,
        }}
      />

      <nav
        className="sticky top-0 z-40 border-b backdrop-blur-xl"
        style={{
          borderColor: p.surface,
          background: isDark ? `${p.navy}f0` : "rgba(255,255,255,0.92)",
        }}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/" className="shrink-0">
              <BrandMark cfg={cfg} />
            </Link>
            <span className="hidden text-sm sm:inline" style={{ color: p.surface }}>
              /
            </span>
            <span className="hidden truncate text-sm font-medium sm:inline" style={{ color: p.textMuted }}>
              {policy.title}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/contact"
              className="text-sm font-semibold transition-opacity hover:opacity-70"
              style={{ color: p.textMuted }}
            >
              Contact
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm font-semibold transition-opacity hover:opacity-70"
              style={{ color: p.textMuted }}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Home
            </Link>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-6 lg:flex lg:gap-12 lg:py-14">
        {allPolicies.length > 0 && (
          <aside className="mb-10 shrink-0 lg:mb-0 lg:w-60">
            <div className="lg:sticky lg:top-24">
              <p
                className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em]"
                style={{ color: p.accent }}
              >
                Policies
              </p>
              {Object.entries(byCategory).map(([cat, items]) => (
                <div key={cat} className="mb-5">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: p.textMuted }}>
                    {cat}
                  </p>
                  <ul className="space-y-0.5">
                    {items.map((pol) => {
                      const active = pol.slug === slug;
                      return (
                        <li key={pol.slug}>
                          <Link
                            to="/legal/$slug"
                            params={{ slug: pol.slug }}
                            className="block rounded-md px-3 py-1.5 text-sm transition-colors"
                            style={{
                              color: active ? p.accent : p.textMuted,
                              background: active ? (isDark ? `${p.accent}22` : `${p.accent}12`) : "transparent",
                              fontWeight: active ? 600 : 400,
                            }}
                          >
                            {pol.title}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </aside>
        )}

        <article className="min-w-0 flex-1">
          <div
            className="overflow-hidden rounded-2xl border"
            style={{
              borderColor: p.surface,
              background: panelBg,
              boxShadow: isDark ? "none" : "0 24px 60px -28px rgba(15,27,61,0.16)",
            }}
          >
            <div
              className="border-b px-6 py-8 sm:px-10"
              style={{
                borderColor: p.surface,
                background: isDark
                  ? `linear-gradient(135deg, ${p.navyLight} 0%, ${p.navy} 100%)`
                  : `linear-gradient(135deg, ${p.navy}08 0%, transparent 60%)`,
              }}
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: p.accent }}>
                {policy.category}
              </p>
              <h1
                className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl"
                style={{ ...HEADING, color: p.textHeading }}
              >
                {policy.title}
              </h1>
              <p className="mt-3 text-xs" style={{ color: p.textMuted }}>
                iProjectX · Last updated{" "}
                {new Date(policy.updated_at).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>

            <div
              className="legal-prose px-6 py-8 sm:px-10 sm:py-10"
              style={{ color: p.textBody }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </article>
      </div>

      <footer
        className="mt-8 border-t px-5 py-8 text-center text-xs sm:px-6"
        style={{ borderColor: p.surface, color: p.textMuted }}
      >
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} iProjectX</span>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <Link to="/legal/privacy-policy" className="hover:opacity-70" style={{ color: p.textMuted }}>
              Privacy
            </Link>
            <Link to="/legal/terms-of-service" className="hover:opacity-70" style={{ color: p.textMuted }}>
              Terms
            </Link>
            <Link to="/legal/cookie-policy" className="hover:opacity-70" style={{ color: p.textMuted }}>
              Cookies
            </Link>
            <Link to="/contact" className="hover:opacity-70" style={{ color: p.textMuted }}>
              Contact
            </Link>
            <Link to="/" className="font-semibold hover:opacity-70" style={{ color: p.accent }}>
              Home
            </Link>
          </div>
        </div>
      </footer>

      <style>{`
        .legal-prose h2 {
          font-size: 1.25rem;
          font-weight: 700;
          margin-top: 2rem;
          margin-bottom: 0.75rem;
          font-family: 'Sora', system-ui, sans-serif;
          color: var(--lp-heading, inherit);
        }
        .legal-prose h3 { font-size: 1.05rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.5rem; }
        .legal-prose h4, .legal-prose h5, .legal-prose h6 { font-weight: 600; margin-top: 1rem; margin-bottom: 0.5rem; }
        .legal-prose p { margin-bottom: 1rem; line-height: 1.75; }
        .legal-prose ul, .legal-prose ol { margin-left: 1.35rem; margin-bottom: 1rem; }
        .legal-prose li { margin-bottom: 0.3rem; line-height: 1.7; }
        .legal-prose ul li { list-style-type: disc; }
        .legal-prose ol li { list-style-type: decimal; }
        .legal-prose strong { font-weight: 600; }
        .legal-prose code {
          font-family: ui-monospace, monospace;
          font-size: 0.875em;
          background: rgba(15,27,61,0.06);
          padding: 0.1em 0.4em;
          border-radius: 3px;
        }
        .legal-prose hr { border: none; border-top: 1px solid currentColor; opacity: 0.15; margin: 1.75rem 0; }
        .legal-prose table { width: 100%; border-collapse: collapse; margin-bottom: 1.25rem; font-size: 0.875rem; }
        .legal-prose th, .legal-prose td {
          padding: 0.55rem 0.75rem;
          border: 1px solid rgba(15,27,61,0.12);
          text-align: left;
        }
        .legal-prose th { font-weight: 600; background: rgba(15,27,61,0.04); }
      `}</style>
    </div>
  );
}
