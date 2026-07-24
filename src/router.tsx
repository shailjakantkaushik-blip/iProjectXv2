import { QueryClient, keepPreviousData } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { RoutePending } from "@/components/page-loading";
import { queryRetryDelay } from "@/lib/query";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Longer stale window + scoped live-sync keeps UI snappy.
        staleTime: 60_000,
        gcTime: 15 * 60_000,
        retry: 2,
        retryDelay: queryRetryDelay,
        // Tab focus was causing full refetch waves across open dashboards.
        // Live-sync covers cross-user edits; reconnect still refreshes.
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        // Cached data is good enough within staleTime; live-sync covers edits.
        refetchOnMount: false,
        networkMode: "online",
        // Keep prior data on screen while background refetch runs.
        placeholderData: keepPreviousData,
      },
      mutations: {
        networkMode: "online",
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Desktop sidebar hover was prefetching many route chunks while the user
    // only glanced at nav — mobile has no persistent hover, so it felt faster.
    // Navigate still loads on click; intent preload is opt-in via Link props.
    defaultPreload: false,
    defaultPreloadDelay: 0,
    defaultPreloadStaleTime: 30_000,
    // Avoid flashing a full pending screen on fast navigations.
    defaultPendingMs: 1000,
    defaultPendingComponent: RoutePending,
  });

  return router;
};
