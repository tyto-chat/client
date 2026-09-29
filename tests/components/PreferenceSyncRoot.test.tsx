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
    localStorage.setItem(STORAGE_KEYS.DEVICE_PREFS_SEEDED, "true");
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

describe("device settings seed", () => {
  const SERVER_DEVICE_PREFS = {
    ...EMPTY_PREFS,
    theme: "light",
    submitKey: "ctrl+enter",
    timezone: "Europe/Warsaw",
    locale: "pl",
    desktopNotifications: true,
  };

  function stubNavigatorLanguages(languages: string[]) {
    vi.spyOn(window.navigator, "languages", "get").mockReturnValue(languages);
  }

  beforeEach(() => {
    stubNavigatorLanguages(["en-US"]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("copies the first identity's device settings once in managed mode", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    localStorage.setItem(STORAGE_KEYS.THEME, "dark");
    localStorage.setItem("tyto_language", "en");
    serverPrefs = { ...SERVER_DEVICE_PREFS };
    const seeded = vi.fn();
    window.addEventListener("tyto:device-settings-seeded", seeded);

    renderRoot();

    await waitFor(() =>
      expect(localStorage.getItem(STORAGE_KEYS.DEVICE_PREFS_SEEDED)).toBe("true"),
    );
    expect(localStorage.getItem(STORAGE_KEYS.THEME)).toBe("light");
    expect(localStorage.getItem(STORAGE_KEYS.SUBMIT_KEY)).toBe("ctrl+enter");
    expect(localStorage.getItem(STORAGE_KEYS.TIMEZONE)).toBe("Europe/Warsaw");
    expect(localStorage.getItem(STORAGE_KEYS.DESKTOP_NOTIFICATIONS)).toBe("true");
    expect(changeLanguage).toHaveBeenCalledWith("pl");
    expect(seeded).toHaveBeenCalledTimes(1);
    window.removeEventListener("tyto:device-settings-seeded", seeded);
  });

  it("treats the language i18next auto-detected as unset for mixed browser language lists", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    vi.restoreAllMocks();
    changeLanguage = vi.spyOn(i18n, "changeLanguage").mockResolvedValue(i18n.t);
    stubNavigatorLanguages(["pl-PL", "en"]);
    localStorage.setItem("tyto_language", "en");
    serverPrefs = { ...EMPTY_PREFS, locale: "de" };

    renderRoot();

    await waitFor(() => expect(changeLanguage).toHaveBeenCalledWith("de"));
  });

  it("never overwrites a value the user already chose on this device", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    localStorage.setItem(STORAGE_KEYS.THEME, "system");
    localStorage.setItem(STORAGE_KEYS.SUBMIT_KEY, "none");
    localStorage.setItem(STORAGE_KEYS.TIMEZONE, "Asia/Tokyo");
    localStorage.setItem(STORAGE_KEYS.DESKTOP_NOTIFICATIONS, "false");
    localStorage.setItem("tyto_language", "de");
    serverPrefs = { ...SERVER_DEVICE_PREFS };

    renderRoot();

    await waitFor(() =>
      expect(localStorage.getItem(STORAGE_KEYS.DEVICE_PREFS_SEEDED)).toBe("true"),
    );
    expect(localStorage.getItem(STORAGE_KEYS.THEME)).toBe("system");
    expect(localStorage.getItem(STORAGE_KEYS.SUBMIT_KEY)).toBe("none");
    expect(localStorage.getItem(STORAGE_KEYS.TIMEZONE)).toBe("Asia/Tokyo");
    expect(localStorage.getItem(STORAGE_KEYS.DESKTOP_NOTIFICATIONS)).toBe("false");
    expect(changeLanguage).not.toHaveBeenCalled();
  });

  it("does not seed again once the flag is set", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    localStorage.setItem(STORAGE_KEYS.DEVICE_PREFS_SEEDED, "true");
    localStorage.setItem(STORAGE_KEYS.SEND_TYPING_INDICATOR, "true");
    serverPrefs = { ...SERVER_DEVICE_PREFS, sendTypingIndicator: false };

    renderRoot();

    await waitFor(() =>
      expect(localStorage.getItem(STORAGE_KEYS.SEND_TYPING_INDICATOR)).toBe("false"),
    );
    expect(localStorage.getItem(STORAGE_KEYS.THEME)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.TIMEZONE)).toBeNull();
  });

  it("leaves the flag unset when no identity is signed in", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    setAccessToken(null);
    serverPrefs = { ...SERVER_DEVICE_PREFS };

    renderRoot();
    await new Promise((r) => setTimeout(r, 50));

    expect(localStorage.getItem(STORAGE_KEYS.DEVICE_PREFS_SEEDED)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.TIMEZONE)).toBeNull();
  });

  it("never seeds in web mode", async () => {
    vi.stubEnv("VITE_APP_MODE", "web");
    localStorage.setItem(STORAGE_KEYS.PREFS_MIGRATED, "true");
    serverPrefs = { ...SERVER_DEVICE_PREFS, sendTypingIndicator: false };

    renderRoot();

    await waitFor(() =>
      expect(localStorage.getItem(STORAGE_KEYS.SEND_TYPING_INDICATOR)).toBe("false"),
    );
    expect(localStorage.getItem(STORAGE_KEYS.DEVICE_PREFS_SEEDED)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.TIMEZONE)).toBeNull();
  });
});
