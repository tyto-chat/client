/* eslint-disable react-refresh/only-export-components */
import { useQueryClient } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "@/routeTree.gen";
import { AuthProvider, useAuthContext } from "@/context/AuthContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { PreferenceSyncRoot } from "@/context/PreferenceSyncRoot";
import { useServerInfo } from "@/hooks/useServerInfo";

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
  return <RouterProvider router={router} context={{ queryClient, auth, serverInfo }} />;
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
