import {
  Component,
  useEffect,
  useRef,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import {
  alreadyAutoRecoveredThisSession,
  clearChunkReloadMarker,
  hardReloadToLatest,
  isChunkLoadError,
  recentlyReloadedForChunk,
  recoverFromChunkLoadError,
} from "@/lib/chunk-load-recovery";

/** Missing DB objects / expired session — not a stale JS bundle. */
export function isUnavailablePageError(error: unknown): boolean {
  if (isChunkLoadError(error)) return false;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String((error as { message?: unknown } | null)?.message ?? error ?? "");

  return (
    /relation .+ does not exist/i.test(message) ||
    /Could not find the table/i.test(message) ||
    /schema cache/i.test(message) ||
    /JWT expired/i.test(message)
  );
}

function errorCopy(error: Error, chunkError: boolean, alreadyTried: boolean) {
  if (chunkError) {
    return {
      title: alreadyTried ? "Update ready — one more refresh" : "Updating the app",
      body: alreadyTried
        ? "A newer version was deployed. Tap Reload now once (we stopped auto-refreshing so the page won’t loop)."
        : "A newer version was just deployed. Reloading to load the latest files…",
    };
  }
  if (isUnavailablePageError(error)) {
    return {
      title: "Data not available",
      body: "This page couldn’t load its data. It may not be set up yet for this organisation, or the database is still catching up after a change. Try again, or go back to the workspace.",
    };
  }
  return {
    title: "Something went wrong",
    body: error.message || "An unexpected error occurred on this page.",
  };
}

type RouteErrorViewProps = {
  error: Error;
  reset: () => void;
  /** Keep chrome (sidebar) — use inside AppShell. */
  embedded?: boolean;
};

/**
 * Shared route error UI. Always offers workspace escape hatches that reset the
 * boundary — SPA Links alone do not clear React error boundaries.
 */
export function RouteErrorView({ error, reset, embedded = false }: RouteErrorViewProps) {
  const router = useRouter();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const chunkError = isChunkLoadError(error);
  const alreadyTried =
    chunkError && (recentlyReloadedForChunk() || alreadyAutoRecoveredThisSession());
  const copy = errorCopy(error, chunkError, alreadyTried);

  // Auto-recover stale deploy chunks once.
  useEffect(() => {
    if (!chunkError || alreadyTried) return;
    recoverFromChunkLoadError(error);
  }, [chunkError, alreadyTried, error]);

  // Leaving the broken URL must clear the boundary — otherwise Back / nav Links
  // change the address bar but keep showing this error screen.
  const pathAtError = useRef(pathname);
  useEffect(() => {
    if (pathname === pathAtError.current) return;
    pathAtError.current = pathname;
    reset();
  }, [pathname, reset]);

  const goWorkspace = () => {
    reset();
    void router.invalidate();
    void navigate({ to: "/app", replace: true }).catch(() => {
      window.location.assign("/app");
    });
  };

  const goBack = () => {
    reset();
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    goWorkspace();
  };

  const retry = () => {
    if (chunkError) {
      hardReloadToLatest(true);
      return;
    }
    // Public sign-in must not stay on a dead SPA state — hard-load /auth.
    if (pathname === "/auth" || pathname.startsWith("/auth?")) {
      window.location.replace("/auth" + window.location.search);
      return;
    }
    void router.invalidate();
    reset();
  };

  return (
    <div
      className={
        embedded
          ? "flex min-h-[min(50vh,24rem)] items-center justify-center px-4 py-12"
          : "flex min-h-screen items-center justify-center bg-background px-4"
      }
      role="alert"
    >
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">{copy.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {chunkError ? "Reload now" : "Try again"}
          </button>
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground"
          >
            Go back
          </button>
          {chunkError ? (
            <a
              href="/app"
              className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground"
              onClick={(e) => {
                e.preventDefault();
                clearChunkReloadMarker();
                window.location.assign("/app");
              }}
            >
              Workspace
            </a>
          ) : (
            <button
              type="button"
              onClick={goWorkspace}
              className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground"
            >
              Workspace
            </button>
          )}
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground"
            onClick={() => reset()}
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}

/** TanStack Router `errorComponent` / `defaultErrorComponent`. */
export function RouterErrorComponent({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return <RouteErrorView error={error} reset={reset} embedded />;
}

type BoundaryProps = {
  children: ReactNode;
  /** Remount/reset when this changes (usually pathname). */
  resetKey: string;
  embedded?: boolean;
};

type BoundaryState = { error: Error | null };

/**
 * Local error boundary around Outlet content. `resetKey` (pathname) remounts so
 * navigating away always recovers the shell — browser Back included.
 */
export class RouteContentErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Route content error:", error, info.componentStack);
  }

  componentDidUpdate(prev: BoundaryProps) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <RouteErrorView
          error={this.state.error}
          reset={() => this.setState({ error: null })}
          embedded={this.props.embedded !== false}
        />
      );
    }
    return this.props.children;
  }
}
