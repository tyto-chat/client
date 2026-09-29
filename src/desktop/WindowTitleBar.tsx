import { useEffect, useState } from "react";
import { isManagedIdentityMode } from "@/platform/appMode";
import { getPlatformBridge } from "@/platform/bridge";
import type { BridgeWindowTheme } from "@/platform/PlatformBridge";

const BAR_HEIGHT = "env(titlebar-area-height, 32px)";
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

interface WindowControlsOverlay {
  visible: boolean;
}

function hasOwnWindowButtons(): boolean {
  if (!isManagedIdentityMode()) return false;
  const overlay = (navigator as Navigator & { windowControlsOverlay?: WindowControlsOverlay })
    .windowControlsOverlay;
  return overlay?.visible === true;
}

function readTheme(): BridgeWindowTheme | null {
  const styles = getComputedStyle(document.documentElement);
  const color = styles.getPropertyValue("--color-surface").trim();
  const symbolColor = styles.getPropertyValue("--color-fg-muted").trim();
  return HEX_COLOR.test(color) && HEX_COLOR.test(symbolColor) ? { color, symbolColor } : null;
}

function sendTheme(): void {
  const theme = readTheme();
  if (!theme) return;
  try {
    getPlatformBridge().appState?.setWindowTheme?.(theme);
  } catch {
    return;
  }
}

export function WindowTitleBar() {
  const [active] = useState(hasOwnWindowButtons);
  return active ? <ActiveTitleBar /> : null;
}

function ActiveTitleBar() {
  const [title, setTitle] = useState(() => document.title);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--titlebar-h", BAR_HEIGHT);
    return () => {
      root.style.removeProperty("--titlebar-h");
    };
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => setTitle(document.title));
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    sendTheme();
    const observer = new MutationObserver(sendTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <div data-testid="window-titlebar" className="window-titlebar">
      <img src="/nebula-logo.svg" alt="" className="window-titlebar-mark" />
      <span data-testid="window-titlebar-title" className="window-titlebar-title">
        {title}
      </span>
    </div>
  );
}
