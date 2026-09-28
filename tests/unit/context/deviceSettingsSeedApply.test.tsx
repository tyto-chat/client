import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { TimezoneProvider, useTimezone } from "@/context/TimezoneContext";
import { SubmitKeyProvider, useSubmitKey } from "@/context/SubmitKeyContext";
import { DEVICE_SETTINGS_SEEDED_EVENT } from "@/platform/deviceSettingsSeed";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import { setAccessToken } from "@/api/tokenStore";
import { configureApiClient } from "@/api/client";
import { PreferenceSyncRoot } from "@/context/PreferenceSyncRoot";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { TEST_BASE_URL as BASE } from "../../fixtures";

function Probe() {
  const { preference } = useTheme();
  const { timezone } = useTimezone();
  const { submitKey } = useSubmitKey();
  return <output data-testid="probe">{`${preference}|${timezone}|${submitKey}`}</output>;
}

beforeEach(() => {
  localStorage.clear();
  setAccessToken(null);
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllEnvs();
});

describe("device settings seed application", () => {
  it("re-reads theme, timezone and submit key when the seed lands", () => {
    localStorage.setItem(STORAGE_KEYS.TIMEZONE, "Asia/Tokyo");
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ThemeProvider>
          <TimezoneProvider>
            <SubmitKeyProvider>
              <Probe />
            </SubmitKeyProvider>
          </TimezoneProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("dark|Asia/Tokyo|enter");

    act(() => {
      localStorage.setItem(STORAGE_KEYS.THEME, "light");
      localStorage.setItem(STORAGE_KEYS.TIMEZONE, "Europe/Warsaw");
      localStorage.setItem(STORAGE_KEYS.SUBMIT_KEY, "ctrl+enter");
      window.dispatchEvent(new Event(DEVICE_SETTINGS_SEEDED_EVENT));
    });

    expect(screen.getByTestId("probe")).toHaveTextContent("light|Europe/Warsaw|ctrl+enter");
  });

  it("applies the first identity's settings to mounted providers without a reload", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    configureApiClient(BASE);
    setAccessToken("test-token");
    server.use(
      http.get(`${BASE}/api/v1/me/preferences`, () =>
        HttpResponse.json({
          theme: "light",
          fontSize: null,
          submitKey: "ctrl+enter",
          locale: null,
          timezone: "Europe/Warsaw",
          sendTypingIndicator: null,
          desktopNotifications: null,
          convertEmoticons: null,
          resumeLastLocation: null,
          sectionCollapse: null,
          updatedAt: "2026-07-20T00:00:00Z",
        }),
      ),
    );

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ThemeProvider>
          <TimezoneProvider>
            <SubmitKeyProvider>
              <PreferenceSyncRoot />
              <Probe />
            </SubmitKeyProvider>
          </TimezoneProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("light|Europe/Warsaw|ctrl+enter"),
    );
    expect(localStorage.getItem(STORAGE_KEYS.THEME)).toBe("light");
  });
});
