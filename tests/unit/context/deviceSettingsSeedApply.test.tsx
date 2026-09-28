import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { TimezoneProvider, useTimezone } from "@/context/TimezoneContext";
import { SubmitKeyProvider, useSubmitKey } from "@/context/SubmitKeyContext";
import { DEVICE_SETTINGS_SEEDED_EVENT } from "@/platform/deviceSettingsSeed";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import { setAccessToken } from "@/api/tokenStore";

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

afterEach(() => localStorage.clear());

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
});
