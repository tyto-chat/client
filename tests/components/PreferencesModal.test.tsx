import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE, mockUser } from "../fixtures";
import { PreferencesModal } from "@/components/PreferencesModal";
import { FontSizeProvider } from "@/context/FontSizeContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { TimezoneProvider } from "@/context/TimezoneContext";
import { SubmitKeyProvider } from "@/context/SubmitKeyContext";

vi.mock("@/context/AuthContext", () => ({
  useAuthContext: () => ({ user: mockUser, refreshUser: vi.fn() }),
}));

let voiceEnabled = true;
vi.mock("@/hooks/useVoiceEnabled", () => ({ useVoiceEnabled: () => voiceEnabled }));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <FontSizeProvider>
          <ThemeProvider>
            <TimezoneProvider>
              <SubmitKeyProvider>{children}</SubmitKeyProvider>
            </TimezoneProvider>
          </ThemeProvider>
        </FontSizeProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  voiceEnabled = true;
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
    http.patch(`${BASE}/api/v1/me/preferences`, async ({ request }) => {
      const patch = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({
        resumeLastLocation: true,
        updatedAt: "2026-07-20T00:00:00Z",
        ...patch,
      });
    }),
  );
});

describe("PreferencesModal", () => {
  it("renders all six nav tabs when voice is enabled", async () => {
    render(<PreferencesModal onClose={() => {}} />, { wrapper: makeWrapper() });
    for (const key of ["general", "chat", "notifications", "voice-video", "account", "apikeys"]) {
      expect(await screen.findByTestId(`pref-tab-${key}`)).toBeInTheDocument();
    }
  });

  it("hides the devices group when voice is disabled", async () => {
    voiceEnabled = false;
    render(<PreferencesModal onClose={() => {}} />, { wrapper: makeWrapper() });
    expect(await screen.findByTestId("pref-tab-general")).toBeInTheDocument();
    expect(screen.queryByTestId("pref-tab-voice-video")).not.toBeInTheDocument();
  });

  it("switches to the chat panel when its nav item is clicked", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    render(<PreferencesModal onClose={() => {}} />, { wrapper: makeWrapper() });
    await userEvent.setup().click(await screen.findByTestId("pref-tab-chat"));
    expect(await screen.findByText("Composing")).toBeInTheDocument();
  });
});
