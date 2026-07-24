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
        refetchOnMount: true,
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
    defaultPreload: "intent",
    defaultPreloadStaleTime: 30_000,
    // Avoid flashing a full pending screen on fast navigations.
    defaultPendingMs: 1000,
    defaultPendingComponent: RoutePending,
  });

  return router;
};
