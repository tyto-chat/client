/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "@/routeTree.gen";
import { AuthProvider, useAuthContext } from "@/context/AuthContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { PreferenceSyncRoot } from "@/context/PreferenceSyncRoot";
import { useServerInfo } from "@/hooks/useServerInfo";
import { AppSkeleton } from "@/components/ui/Skeleton";
import { FadeOutOverlay } from "@/components/ui/FadeOutOverlay";

export const router = createRouter({
  routeTree,
  context: {
    queryClient: undefined!,
    auth: undefined!,
    serverInfo: undefined!,
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function InnerApp() {
  const queryClient = useQueryClient();
  const auth = useAuthContext();
  const serverInfo = useServerInfo();
  const [initialLoadDone, setInitialLoadDone] = useState(
    () => router.state.status === "idle" && router.state.matches.length > 0,
  );

  useEffect(() => {
    if (initialLoadDone) return undefined;
    if (router.state.status === "idle" && router.state.matches.length > 0) {
      queueMicrotask(() => setInitialLoadDone(true));
      return undefined;
    }
    const unsubscribe = router.subscribe("onResolved", () => {
      unsubscribe();
      setInitialLoadDone(true);
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <RouterProvider router={router} context={{ queryClient, auth, serverInfo }} />
      <FadeOutOverlay show={!initialLoadDone} className="fixed inset-0 z-50">
        <AppSkeleton />
      </FadeOutOverlay>
    </>
  );
}

export function AppShell() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <PreferenceSyncRoot />
        <InnerApp />
      </NotificationProvider>
    </AuthProvider>
  );
}
