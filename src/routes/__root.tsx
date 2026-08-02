import { createRootRouteWithContext, Outlet, redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import type { useAuthContext } from "@/context/AuthContext";
import type { ServerInfo } from "@/types/api";
import { fetchAccountDeletionStatus } from "@/api/accountDeletion";
import { queryKeys } from "@/queries/queryKeys";
import { ApiError } from "@/api/client";

export type RouterContext = {
  queryClient: QueryClient;
  auth: ReturnType<typeof useAuthContext>;
  serverInfo: ServerInfo | null;
};

const PENDING_DELETION_PATH = "/account-pending-deletion";

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ context: { auth, queryClient }, location }) => {
    if (!auth.token) return;
    if (location.pathname.startsWith(PENDING_DELETION_PATH)) return;

    let status;
    try {
      status = await queryClient.ensureQueryData({
        queryKey: queryKeys.accountDeletion(),
        queryFn: fetchAccountDeletionStatus,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      throw err;
    }

    if (status.pending) {
      throw redirect({ to: PENDING_DELETION_PATH });
    }
  },
  component: Outlet,
});
