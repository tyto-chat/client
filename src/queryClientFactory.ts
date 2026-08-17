import { QueryCache, QueryClient } from "@tanstack/react-query";
import type { AnyRouter } from "@tanstack/react-router";
import { ApiError } from "@/api/client";
import { StaleTime } from "@/queries/staleTimes";

export function createAppQueryClient(router: AnyRouter): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (error instanceof ApiError && error.status === 404 && !query.meta?.noGlobalRedirect) {
          void router.navigate({ to: "/" });
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: StaleTime.medium,
      },
    },
  });
}
