import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import i18n from "@/i18n";
import { TrayLabelsSync } from "@/desktop/TrayLabelsSync";
import { setPlatformBridgeForTests } from "@/platform/bridge";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import type { BridgeTrayLabels } from "@/platform/PlatformBridge";

let sent: BridgeTrayLabels[];

function useShell(withLabels = true) {
  setPlatformBridgeForTests({
    ...createFakePlatformBridge(),
    bridgeVersion: 2,
    appState: withLabels
      ? { setBadge: () => undefined, setTrayLabels: (labels) => void sent.push(labels) }
      : { setBadge: () => undefined },
  });
}

beforeEach(() => {
  sent = [];
  vi.stubEnv("VITE_APP_MODE", "desktop");
  useShell();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  setPlatformBridgeForTests(null);
  await i18n.changeLanguage("en");
});

describe("TrayLabelsSync", () => {
  it("sends every tray label in the app's language", async () => {
    render(<TrayLabelsSync />);

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      open: "Open tyto",
      snooze30: "For 30 minutes",
      presenceDnd: "Do not disturb",
      quit: "Quit",
    });
    expect(Object.keys(sent[0]!)).toHaveLength(17);
    for (const label of Object.values(sent[0]!)) expect(label).not.toMatch(/^tray_/);
  });

  it("sends them again when the language changes", async () => {
    render(<TrayLabelsSync />);
    await waitFor(() => expect(sent).toHaveLength(1));

    await act(async () => {
      await i18n.changeLanguage("pl");
    });

    await waitFor(() => expect(sent.at(-1)?.quit).toBe("Zakończ"));
    expect(sent.at(-1)?.open).toBe("Otwórz tyto");
  });

  it.each(["de", "fr", "es", "it", "nl", "pt", "tr", "uk"])(
    "has real translations for %s, not the English text",
    async (language) => {
      render(<TrayLabelsSync />);
      await act(async () => {
        await i18n.changeLanguage(language);
      });

      await waitFor(() => expect(sent.at(-1)?.quit).not.toBe("Quit"));
      const labels = sent.at(-1)!;
      expect(labels.leaveCall).not.toBe("Leave call");
      expect(labels.snooze).not.toBe("Snooze notifications");
      for (const label of Object.values(labels)) expect(label).not.toMatch(/^tray_/);
    },
  );

  it("does nothing with a shell that does not take tray labels", async () => {
    useShell(false);
    render(<TrayLabelsSync />);
    await new Promise((r) => setTimeout(r, 100));
    expect(sent).toEqual([]);
  });

  it("does nothing in web mode", async () => {
    vi.stubEnv("VITE_APP_MODE", "web");
    render(<TrayLabelsSync />);
    await new Promise((r) => setTimeout(r, 100));
    expect(sent).toEqual([]);
  });
});
