/* eslint-disable react-refresh/only-export-components */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import "@/styles/app.css";
import { routeTree } from "@/routeTree.gen";
import { AuthProvider, useAuthContext } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { FontSizeProvider } from "@/context/FontSizeContext";
import { TimezoneProvider } from "@/context/TimezoneContext";
import { SubmitKeyProvider } from "@/context/SubmitKeyContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { PreferenceSyncRoot } from "@/context/PreferenceSyncRoot";
import { ApiError, configureApiClient } from "@/api/client";
import { beginAuthRestore } from "@/api/tokenStore";
import { fetchServerInfo } from "@/api/serverInfo";
import { resolveServerInfoUrl } from "@/utils/serverInfoUrl";
import { useServerInfo } from "@/hooks/useServerInfo";
import { i18nReady } from "@/i18n";
import { StaleTime } from "@/queries/staleTimes";
import { negotiateApiVersion, getApiVersion } from "@/api/apiVersion";
import { VersionMismatchScreen } from "@/components/VersionMismatchScreen";

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (error instanceof ApiError && error.status === 404 && !query.meta?.noGlobalRedirect) {
        router.navigate({ to: "/" });
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: StaleTime.medium,
    },
  },
});

const router = createRouter({
  routeTree,
  context: {
    queryClient,
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
  const auth = useAuthContext();
  const serverInfo = useServerInfo();
  return <RouterProvider router={router} context={{ queryClient, auth, serverInfo }} />;
}

(async () => {
  const serverInfoUrl = resolveServerInfoUrl();
  let origin: string | null = null;
  try {
    origin = serverInfoUrl ? new URL(serverInfoUrl).origin : null;
  } catch {
    origin = null;
  }

  let mismatch: "server-older" | "server-newer" | null = null;
  if (origin) {
    try {
      const negotiation = await negotiateApiVersion(origin);
      if (!negotiation.ok) mismatch = negotiation.direction;
    } catch {
      /* ignore */
    }
  }

  if (mismatch) {
    await i18nReady;
    createRoot(document.getElementById("root")!).render(
      <VersionMismatchScreen direction={mismatch} />,
    );
    return;
  }

  const [serverInfo] = await Promise.all([
    origin
      ? fetchServerInfo(`${origin}/api/${getApiVersion()}/server-info`).catch(() => null)
      : Promise.resolve(null),
    i18nReady,
  ]);
  if (serverInfo) configureApiClient(serverInfo.apiUrl);

  beginAuthRestore();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <FontSizeProvider>
            <TimezoneProvider>
              <SubmitKeyProvider>
                <AuthProvider>
                  <NotificationProvider>
                    <PreferenceSyncRoot />
                    <InnerApp />
                  </NotificationProvider>
                </AuthProvider>
              </SubmitKeyProvider>
            </TimezoneProvider>
          </FontSizeProvider>
        </ThemeProvider>
        {import.meta.env.VITE_QUERY_DEVTOOLS === "true" && (
          <ReactQueryDevtools initialIsOpen={false} />
        )}
      </QueryClientProvider>
    </StrictMode>,
  );
})();
