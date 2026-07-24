import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
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
import { EoiForm } from "@/components/eoi-form";
import { Mail, MapPin, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/contact")({
  loader: async () => ({ cfg: await fetchLandingConfig() }),
  pendingMs: 0,
  pendingComponent: ContactPending,
  component: ContactPage,
  head: () => ({ meta: [{ title: "Contact us — iProjectX" }] }),
});

const HEADING = { fontFamily: "'Sora', system-ui, sans-serif" } as const;
const BODY = { fontFamily: "'DM Sans', system-ui, sans-serif" } as const;

function ContactPending() {
  const cached = typeof window !== "undefined" ? readCachedLandingConfigForPaint() : null;
  const p = cached?.palette ?? DEFAULT_LANDING.palette;
  const theme = cached?.theme ?? "light";
  return (
    <PageLoading
      label="Loading…"
      style={{ background: theme === "dark" ? p.navy : "#fafbfc" }}
      className={theme === "dark" ? "text-white" : undefined}
    />
  );
}

function BrandMark({ cfg }: { cfg: LandingConfig }) {
  const logoUrl = resolveBrandLogoUrl(cfg.brand, "landing");
  const dims = resolveBrandLogoDims(cfg.brand, "landing");
  const p = cfg.palette;
  if (logoUrl) {
    return <StableBrandLogo src={logoUrl} alt={cfg.brand.name} heightPx={dims.heightPx} maxWidthPx={dims.maxWidthPx} />;
  }
  return (
    <span className="text-xl font-bold tracking-tight" style={{ ...HEADING, color: p.textHeading }}>
      {cfg.brand.name}
    </span>
  );
}

function ContactPage() {
  const { cfg } = Route.useLoaderData();
  const p = cfg.palette;
  const isDark = cfg.theme === "dark";
  const pageBg = isDark ? p.navy : "#fafbfc";

  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.documentElement.style.scrollBehavior = "";
    };
  }, []);

  return (
    <div className="min-h-screen antialiased" style={{ ...BODY, background: pageBg, color: p.textBody }}>
      <nav
        className="sticky top-0 z-40 border-b backdrop-blur-xl"
        style={{
          borderColor: p.surface,
          background: isDark ? `${p.navy}f0` : "rgba(255,255,255,0.92)",
        }}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6">
          <Link to="/">
            <BrandMark cfg={cfg} />
          </Link>
          <div className="flex items-center gap-6">
            <Link to="/" className="text-sm font-semibold transition-opacity hover:opacity-70" style={{ color: p.textMuted }}>
              Home
            </Link>
            <Link to="/auth" className="text-sm font-semibold transition-opacity hover:opacity-70" style={{ color: p.textMuted }}>
              Sign in
            </Link>
          </div>
        </div>
      </nav>

      <header className="relative overflow-hidden" style={{ background: p.navy, color: p.textOnDark }}>
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 70% 50% at 80% 10%, ${p.accent}33 0%, transparent 55%),
              linear-gradient(165deg, ${p.navy} 0%, ${p.navyLight} 100%)
            `,
          }}
        />
        <div className="relative mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-20">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: p.accent }}>
            iProjectX
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl" style={HEADING}>
            Contact us
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed opacity-85">
            Talk to our team about portfolio governance, onboarding, or partnership. Prefer a guided conversation?
            Submit an expression of interest and we will follow up.
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-6 lg:grid-cols-12 lg:gap-12">
        <div className="space-y-8 lg:col-span-5">
          <div>
            <h2 className="text-lg font-bold" style={{ ...HEADING, color: p.textHeading }}>
              Reach the team
            </h2>
            <ul className="mt-5 space-y-4">
              <li className="flex gap-3">
                <Mail className="mt-0.5 h-5 w-5 shrink-0" style={{ color: p.accent }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: p.textHeading }}>
                    General
                  </p>
                  <a href="mailto:hello@iprojectx.com" className="text-sm hover:underline" style={{ color: p.textMuted }}>
                    hello@iprojectx.com
                  </a>
                </div>
              </li>
              <li className="flex gap-3">
                <MessageSquare className="mt-0.5 h-5 w-5 shrink-0" style={{ color: p.accent }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: p.textHeading }}>
                    Support
                  </p>
                  <a href="mailto:support@iprojectx.com" className="text-sm hover:underline" style={{ color: p.textMuted }}>
                    support@iprojectx.com
                  </a>
                </div>
              </li>
              <li className="flex gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0" style={{ color: p.accent }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: p.textHeading }}>
                    Privacy & security
                  </p>
                  <a href="mailto:privacy@iprojectx.com" className="text-sm hover:underline" style={{ color: p.textMuted }}>
                    privacy@iprojectx.com
                  </a>
                  <span className="mx-1" style={{ color: p.textMuted }}>
                    ·
                  </span>
                  <a href="mailto:security@iprojectx.com" className="text-sm hover:underline" style={{ color: p.textMuted }}>
                    security@iprojectx.com
                  </a>
                </div>
              </li>
            </ul>
          </div>

          <div
            className="rounded-xl border p-5"
            style={{
              borderColor: p.surface,
              background: isDark ? p.navyLight : "#ffffff",
            }}
          >
            <p className="text-sm leading-relaxed" style={{ color: p.textMuted }}>
              Looking for legal documents? Visit our{" "}
              <Link to="/legal/privacy-policy" className="font-semibold hover:underline" style={{ color: p.accent }}>
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link to="/legal/terms-of-service" className="font-semibold hover:underline" style={{ color: p.accent }}>
                Terms of Service
              </Link>
              .
            </p>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div
            className="rounded-2xl border p-6 sm:p-8"
            style={{
              borderColor: p.surface,
              background: isDark ? p.navyLight : "#ffffff",
              boxShadow: isDark ? "none" : "0 24px 60px -28px rgba(15,27,61,0.18)",
            }}
          >
            <EoiForm cfg={cfg} source="contact" />
          </div>
        </div>
      </main>

      <footer
        className="border-t px-5 py-8 text-center text-xs sm:px-6"
        style={{ borderColor: p.surface, color: p.textMuted }}
      >
        © {new Date().getFullYear()} iProjectX ·{" "}
        <Link to="/" style={{ color: p.accent }}>
          Home
        </Link>
      </footer>
    </div>
  );
}
