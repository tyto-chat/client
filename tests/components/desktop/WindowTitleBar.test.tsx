import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { WindowTitleBar } from "@/desktop/WindowTitleBar";
import { setPlatformBridgeForTests } from "@/platform/bridge";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import type { BridgeWindowTheme } from "@/platform/PlatformBridge";

let themes: BridgeWindowTheme[];

function useShell() {
  setPlatformBridgeForTests({
    ...createFakePlatformBridge(),
    bridgeVersion: 2,
    appState: { setBadge: () => undefined, setWindowTheme: (theme) => void themes.push(theme) },
  });
}

function overlay(visible: boolean) {
  Object.defineProperty(navigator, "windowControlsOverlay", {
    configurable: true,
    value: { visible, addEventListener: () => undefined, removeEventListener: () => undefined },
  });
}

function paint(surface: string, fg: string) {
  document.documentElement.style.setProperty("--color-surface", surface);
  document.documentElement.style.setProperty("--color-fg-muted", fg);
}

beforeEach(() => {
  themes = [];
  vi.stubEnv("VITE_APP_MODE", "desktop");
  useShell();
  paint("#1e1f26", "#9aa0ad");
  document.title = "general · Owls";
});

afterEach(() => {
  vi.unstubAllEnvs();
  setPlatformBridgeForTests(null);
  Reflect.deleteProperty(navigator, "windowControlsOverlay");
  document.documentElement.removeAttribute("style");
  document.documentElement.classList.remove("dark");
});

describe("WindowTitleBar", () => {
  it("draws nothing when the system keeps its own title bar", () => {
    render(<WindowTitleBar />);

    expect(screen.queryByTestId("window-titlebar")).toBeNull();
    expect(document.documentElement.style.getPropertyValue("--titlebar-h")).toBe("");
    expect(themes).toEqual([]);
  });

  it("shows where the user is and reserves room for itself", () => {
    overlay(true);
    render(<WindowTitleBar />);

    expect(screen.getByTestId("window-titlebar-title").textContent).toBe("general · Owls");
    expect(document.documentElement.style.getPropertyValue("--titlebar-h")).not.toBe("");
    expect(screen.getByTestId("window-titlebar").querySelector("img")?.getAttribute("src")).toBe(
      "/nebula-logo.svg",
    );
  });

  it("follows the window title", async () => {
    overlay(true);
    render(<WindowTitleBar />);

    act(() => {
      document.title = "Direct messages · Owls";
    });

    await waitFor(() =>
      expect(screen.getByTestId("window-titlebar-title").textContent).toBe(
        "Direct messages · Owls",
      ),
    );
  });

  it("gives the space back when it goes away", () => {
    overlay(true);
    const { unmount } = render(<WindowTitleBar />);

    unmount();

    expect(document.documentElement.style.getPropertyValue("--titlebar-h")).toBe("");
  });

  it("tells the shell which colours the window buttons should use", async () => {
    overlay(true);
    render(<WindowTitleBar />);

    await waitFor(() => expect(themes).toEqual([{ color: "#1e1f26", symbolColor: "#9aa0ad" }]));
  });

  it("tells the shell again when the theme changes", async () => {
    overlay(true);
    render(<WindowTitleBar />);
    await waitFor(() => expect(themes).toHaveLength(1));

    act(() => {
      paint("#f6f7f9", "#5a6175");
      document.documentElement.classList.toggle("dark");
    });

    await waitFor(() =>
      expect(themes.at(-1)).toEqual({ color: "#f6f7f9", symbolColor: "#5a6175" }),
    );
  });

  it("sends nothing when the theme colours are not plain hex values", async () => {
    overlay(true);
    paint("rgb(1 2 3)", "#9aa0ad");
    render(<WindowTitleBar />);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(themes).toEqual([]);
  });
});
