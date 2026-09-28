import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE } from "../fixtures";
import i18n from "@/i18n";
import { PreferenceSyncRoot } from "@/context/PreferenceSyncRoot";
import { STORAGE_KEYS } from "@/utils/storageKeys";

const EMPTY_PREFS = {
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
};

let serverPrefs: Record<string, unknown>;
let patchBodies: Record<string, unknown>[];
let changeLanguage: ReturnType<typeof vi.spyOn>;

function renderRoot() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PreferenceSyncRoot />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  serverPrefs = { ...EMPTY_PREFS };
  patchBodies = [];
  configureApiClient(BASE);
  setAccessToken("test-token");
  changeLanguage = vi.spyOn(i18n, "changeLanguage").mockResolvedValue(i18n.t);
  server.use(
    http.get(`${BASE}/api/v1/me/preferences`, () => HttpResponse.json(serverPrefs)),
    http.patch(`${BASE}/api/v1/me/preferences`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      patchBodies.push(body);
      return HttpResponse.json({ ...serverPrefs, ...body });
    }),
  );
});

afterEach(() => {
  changeLanguage.mockRestore();
  vi.unstubAllEnvs();
  localStorage.clear();
});

function seedLocalValues() {
  localStorage.setItem(STORAGE_KEYS.THEME, "dark");
  localStorage.setItem(STORAGE_KEYS.SUBMIT_KEY, "ctrl+enter");
  localStorage.setItem(STORAGE_KEYS.TIMEZONE, "Europe/Warsaw");
  localStorage.setItem(STORAGE_KEYS.DESKTOP_NOTIFICATIONS, "true");
  localStorage.setItem(STORAGE_KEYS.CONVERT_EMOTICONS, "true");
}

describe("PreferenceSyncRoot in web mode", () => {
  beforeEach(() => vi.stubEnv("VITE_APP_MODE", "web"));

  it("mirrors server booleans and pushes the server locale", async () => {
    serverPrefs = {
      ...EMPTY_PREFS,
      locale: "pl",
      desktopNotifications: true,
      sendTypingIndicator: false,
    };
    renderRoot();

    await waitFor(() => expect(changeLanguage).toHaveBeenCalledWith("pl"));
    expect(localStorage.getItem(STORAGE_KEYS.DESKTOP_NOTIFICATIONS)).toBe("true");
    expect(localStorage.getItem(STORAGE_KEYS.SEND_TYPING_INDICATOR)).toBe("false");
  });

  it("migrates local device values to the server", async () => {
    seedLocalValues();
    renderRoot();

    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(patchBodies[0]).toMatchObject({
      theme: "dark",
      submitKey: "ctrl+enter",
      timezone: "Europe/Warsaw",
      desktopNotifications: true,
      convertEmoticons: true,
    });
  });
});

describe("PreferenceSyncRoot in managed mode", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    localStorage.setItem("devicePrefsSeeded", "true");
  });

  it("ignores server desktopNotifications and locale but mirrors account keys", async () => {
    serverPrefs = {
      ...EMPTY_PREFS,
      locale: "pl",
      desktopNotifications: true,
      sendTypingIndicator: false,
    };
    renderRoot();

    await waitFor(() =>
      expect(localStorage.getItem(STORAGE_KEYS.SEND_TYPING_INDICATOR)).toBe("false"),
    );
    expect(localStorage.getItem(STORAGE_KEYS.DESKTOP_NOTIFICATIONS)).toBeNull();
    expect(changeLanguage).not.toHaveBeenCalled();
  });

  it("migrates only account-scoped keys", async () => {
    seedLocalValues();
    renderRoot();

    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(patchBodies[0]).toEqual({ convertEmoticons: true });
  });
});
