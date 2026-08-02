import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authRestored, getAccessToken } from "@/api/tokenStore";
import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ConversationsSidebar } from "@/components/ConversationsSidebar";
import { markAllDmNotificationsRead } from "@/api/notifications";
import { queryKeys } from "@/queries/queryKeys";

export const Route = createFileRoute("/_app/dm")({
  beforeLoad: async () => {
    await authRestored();
    if (!getAccessToken()) {
      throw redirect({ to: "/login" });
    }
  },
  component: DmLayout,
});

function DmLayout() {
  const queryClient = useQueryClient();
  const markRead = useMutation({
    mutationFn: markAllDmNotificationsRead,
    onSuccess: () => {
      queryClient.setQueryData<{ counts: Record<string, number> }>(
        queryKeys.notificationUnreadCounts(),
        (old) => ({ counts: { ...(old?.counts ?? {}), dm: 0 } }),
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.dmNotifications() });
    },
  });

  useEffect(() => {
    markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-1 overflow-hidden">
      <ConversationsSidebar />
      <Outlet />
    </div>
  );
}
