import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";
import { applyChartTheme } from "@/lib/chart-theme";
import { PlatformThemeProvider } from "@/components/platform-theme-provider";
import { OrgThemeProvider } from "@/components/org-theme-provider";
import { getPlatformThemeBootScript } from "@/lib/platform-theme";
import { getOrgThemeBootScript } from "@/lib/org-theme";
import { getStyleThemeBootScript } from "@/lib/style-theme";
import { StyleThemeProvider } from "@/components/style-theme-provider";
import { LANDING_CONFIG_CACHE_KEY } from "@/lib/landing-config";
import {
  alreadyAutoRecoveredThisSession,
  clearChunkReloadMarker,
  hardReloadToLatest,
  installChunkLoadRecovery,
  isChunkLoadError,
  recentlyReloadedForChunk,
  recoverFromChunkLoadError,
} from "@/lib/chunk-load-recovery";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const chunkError = isChunkLoadError(error);
  const alreadyTried =
    chunkError && (recentlyReloadedForChunk() || alreadyAutoRecoveredThisSession());

  useEffect(() => {
    if (!chunkError || alreadyTried) return;
    // At most one automatic hard reload per tab. Never retry from this effect
    // after the session flag is set — that was causing refresh loops.
    recoverFromChunkLoadError(error);
  }, [chunkError, alreadyTried, error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">
          {chunkError
            ? alreadyTried
              ? "Update ready — one more refresh"
              : "Updating the app"
            : "Something went wrong"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {chunkError
            ? alreadyTried
              ? "A newer version was deployed. Tap Reload now once (we stopped auto-refreshing so the page won’t loop)."
              : "A newer version was just deployed. Reloading to load the latest files…"
            : error.message}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (chunkError) {
                hardReloadToLatest(true);
                return;
              }
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {chunkError ? "Reload now" : "Try again"}
          </button>
          {chunkError ? (
            <a
              href="/"
              className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground"
              onClick={(e) => {
                e.preventDefault();
                clearChunkReloadMarker();
                // Full document navigation avoids reusing a broken SPA chunk graph.
                window.location.assign("/");
              }}
            >
              Go home
            </a>
          ) : (
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground"
            >
              Go home
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: "PMO Enterprise — Portfolio & Project Management" },
      { name: "description", content: "Multi-tenant portfolio and project management platform for enterprise PMOs." },
      { property: "og:title", content: "PMO Enterprise" },
      { property: "og:description", content: "Portfolio and project management for enterprise PMOs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "preload",
        as: "style",
        href: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Sora:wght@500;600;700;800&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Sora:wght@500;600;700;800&display=swap",
      },
      { rel: "preload", as: "image", href: "/brand/iprojectx-mark.webp", type: "image/webp" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  // Blocking boot scripts: apply cached themes before first paint (no colour flash).
  // Order: platform first, then org (org wins on /app).
  const themeBoot = getPlatformThemeBootScript();
  const orgThemeBoot = getOrgThemeBootScript();
  const styleThemeBoot = getStyleThemeBootScript();
  const landingBoot = `(function(){try{if(location.pathname!=="/")return;var raw=localStorage.getItem(${JSON.stringify(LANDING_CONFIG_CACHE_KEY)});if(!raw)return;var cfg=JSON.parse(raw);if(!cfg||!cfg.palette)return;var p=cfg.palette;var dark=cfg.theme==="dark";var bg=dark?p.navy:"#ffffff";document.documentElement.style.backgroundColor=bg;document.documentElement.style.color=p.textBody||"#1e3a5f";}catch(e){}})();`;

  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
        <script dangerouslySetInnerHTML={{ __html: orgThemeBoot }} />
        <script dangerouslySetInnerHTML={{ __html: styleThemeBoot }} />
        <script dangerouslySetInnerHTML={{ __html: landingBoot }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    installChunkLoadRecovery();
    applyChartTheme();
    const handler = () => applyChartTheme();
    window.addEventListener("pmo:chart-theme-change", handler);
    return () => window.removeEventListener("pmo:chart-theme-change", handler);
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PlatformThemeProvider>
          <OrgThemeProvider>
            <StyleThemeProvider>
              <Outlet />
              <Toaster richColors closeButton />
            </StyleThemeProvider>
          </OrgThemeProvider>
        </PlatformThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
