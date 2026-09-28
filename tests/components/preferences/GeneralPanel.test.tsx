import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE, mockUser } from "../../fixtures";
import { GeneralPanel } from "@/components/preferences/GeneralPanel";
import { FontSizeProvider } from "@/context/FontSizeContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { TimezoneProvider } from "@/context/TimezoneContext";

vi.mock("@/context/AuthContext", () => ({ useAuthContext: () => ({ user: mockUser }) }));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <FontSizeProvider>
          <ThemeProvider>
            <TimezoneProvider>{children}</TimezoneProvider>
          </ThemeProvider>
        </FontSizeProvider>
      </QueryClientProvider>
    );
  };
}

let patchBodies: unknown[];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

beforeEach(() => {
  patchBodies = [];
  server.use(
    http.patch(`${BASE}/api/v1/me/preferences`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      patchBodies.push(body);
      return HttpResponse.json({ updatedAt: "2026-07-20T00:00:00Z", ...body });
    }),
  );
  configureApiClient(BASE);
  setAccessToken("test-token");
  server.use(
    http.get(`${BASE}/api/v1/me/preferences`, () =>
      HttpResponse.json({
        theme: null,
        fontSize: null,
        submitKey: null,
        locale: null,
        timezone: null,
        sendTypingIndicator: null,
        desktopNotifications: null,
        convertEmoticons: null,
        resumeLastLocation: null,
        sectionCollapse: null,
        updatedAt: "2026-07-20T00:00:00Z",
      }),
    ),
  );
});

describe("GeneralPanel", () => {
  it("renders appearance and language sections", () => {
    render(<GeneralPanel />, { wrapper: makeWrapper() });
    expect(screen.getByText("Theme")).toBeInTheDocument();
    expect(screen.getByTestId("lang-pl")).toBeInTheDocument();
  });

  it("changes language and saves the locale to the server in web mode", async () => {
    vi.stubEnv("VITE_APP_MODE", "web");
    const changeLanguage = vi.spyOn(i18n, "changeLanguage").mockResolvedValue(i18n.t);
    render(<GeneralPanel />, { wrapper: makeWrapper() });

    await userEvent.setup().click(screen.getByTestId("lang-pl"));

    expect(changeLanguage).toHaveBeenCalledWith("pl");
    await waitFor(() => expect(patchBodies).toEqual([{ locale: "pl" }]));
  });

  it("changes language locally without a server write in managed mode", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    const changeLanguage = vi.spyOn(i18n, "changeLanguage").mockResolvedValue(i18n.t);
    render(<GeneralPanel />, { wrapper: makeWrapper() });

    await userEvent.setup().click(screen.getByTestId("lang-pl"));
    await new Promise((r) => setTimeout(r, 50));

    expect(changeLanguage).toHaveBeenCalledWith("pl");
    expect(patchBodies).toEqual([]);
  });
});
