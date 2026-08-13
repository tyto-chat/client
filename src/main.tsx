/* eslint-disable react-refresh/only-export-components */
import { StrictMode } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import "@/styles/app.css";
import { AppShell, router } from "@/appShell";
import { ThemeProvider } from "@/context/ThemeContext";
import { FontSizeProvider } from "@/context/FontSizeContext";
import { TimezoneProvider } from "@/context/TimezoneContext";
import { SubmitKeyProvider } from "@/context/SubmitKeyContext";
import { configureApiClient } from "@/api/client";
import { beginAuthRestore } from "@/api/tokenStore";
import { fetchServerInfo } from "@/api/serverInfo";
import { resolveServerInfoUrl } from "@/utils/serverInfoUrl";
import { i18nReady } from "@/i18n";
import { negotiateApiVersion, getApiVersion } from "@/api/apiVersion";
import { VersionMismatchScreen } from "@/components/VersionMismatchScreen";
import { getAppMode } from "@/platform/appMode";
import { DesktopApp } from "@/desktop/DesktopApp";
import { createAppQueryClient } from "@/queryClientFactory";

const queryClient = createAppQueryClient(router);

function Providers({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <FontSizeProvider>
            <TimezoneProvider>
              <SubmitKeyProvider>{children}</SubmitKeyProvider>
            </TimezoneProvider>
          </FontSizeProvider>
        </ThemeProvider>
        {import.meta.env.VITE_QUERY_DEVTOOLS === "true" && (
          <ReactQueryDevtools initialIsOpen={false} />
        )}
      </QueryClientProvider>
    </StrictMode>
  );
}

(async () => {
  if (getAppMode() === "desktop") {
    await i18nReady;
    createRoot(document.getElementById("root")!).render(
      <Providers>
        <DesktopApp />
      </Providers>,
    );
    return;
  }

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
    <Providers>
      <AppShell />
    </Providers>,
  );
})();
