import { QueryClient, keepPreviousData } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { RoutePending } from "@/components/page-loading";
import { queryRetryDelay } from "@/lib/query";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Fresh enough to feel snappy; long enough to avoid refetch storms.
        staleTime: 30_000,
        gcTime: 15 * 60_000,
        retry: 3,
        retryDelay: queryRetryDelay,
        // Safety net when live-sync misses an edit — refetch quietly if stale.
        refetchOnWindowFocus: true,
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
