import { QueryClient, keepPreviousData } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { RoutePending } from "@/components/page-loading";
import { queryRetryDelay } from "@/lib/query";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 45_000,
        gcTime: 10 * 60_000,
        retry: 3,
        retryDelay: queryRetryDelay,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        networkMode: "online",
        // Keep prior data visible while a background refetch runs — avoids blank flashes.
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
    defaultPreloadStaleTime: 30_000,
    defaultPendingMs: 0,
    defaultPendingComponent: RoutePending,
  });

  return router;
};
