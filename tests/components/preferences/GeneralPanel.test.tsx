import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

beforeEach(() => {
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
});
