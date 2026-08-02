import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import nodeConsole from "node:console";

const src = readFileSync("public/embed.js", "utf8");

const UUID = "3b2c10a4-9f5e-4c1a-8d2b-1f3e4a5b6c7d";
const ORIGIN = "https://tyto.example";

function setupDom() {
  document.body.innerHTML = "";
  const blockquote = document.createElement("blockquote");
  blockquote.className = "tyto-embed";
  blockquote.setAttribute("data-tyto-message", UUID);
  document.body.appendChild(blockquote);

  const script = document.createElement("script");
  script.src = `${ORIGIN}/embed.js`;
  document.body.appendChild(script);

  return { blockquote, script };
}

function runEmbedScript() {
  new Function(src)();
  if (document.readyState === "loading") {
    document.dispatchEvent(new Event("DOMContentLoaded"));
  }
}

describe("public/embed.js", () => {
  // happy-dom logs a NotSupportedError for every <iframe src> even with
  // disableIframePageLoading — unlike scripts, the iframe path ignores
  // handleDisabledFileLoadingAsSuccess. It logs via the raw Node console it
  // captured at environment setup (before vitest swaps in its interceptor),
  // so the filter must patch node:console, not the global wrapper.
  const realError = nodeConsole.error;
  beforeAll(() => {
    nodeConsole.error = (...args: unknown[]) => {
      if (String(args[0]).includes("Failed to load iframe page")) return;
      realError(...args);
    };
  });
  afterAll(() => {
    nodeConsole.error = realError;
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    delete (window as unknown as { __tytoEmbedLoaded?: boolean }).__tytoEmbedLoaded;
  });

  it("resolves origin via the querySelector fallback (no document.currentScript in this eval context)", () => {
    setupDom();
    expect(document.currentScript).toBeNull();
  });

  it("replaces a blockquote.tyto-embed with an iframe pointed at /embed/m/{uuid}", () => {
    setupDom();
    runEmbedScript();

    expect(document.querySelector("blockquote.tyto-embed")).toBeNull();
    const iframe = document.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toBe(`${ORIGIN}/embed/m/${UUID}`);
  });

  it("is idempotent: running the IIFE a second time does not duplicate iframes", () => {
    setupDom();
    runEmbedScript();
    runEmbedScript();

    expect(document.querySelectorAll("iframe").length).toBe(1);
  });

  it("sets iframe height from a matching tyto-embed-height message, sanity-clamped", () => {
    setupDom();
    runEmbedScript();
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "tyto-embed-height", uuid: UUID, height: 420 },
        origin: ORIGIN,
        source: iframe.contentWindow,
      }),
    );

    expect(iframe.style.height).toBe("420px");
  });

  it("ignores a height message from a foreign origin", () => {
    setupDom();
    runEmbedScript();
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    const before = iframe.style.height;

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "tyto-embed-height", uuid: UUID, height: 420 },
        origin: "https://evil.example",
        source: iframe.contentWindow,
      }),
    );

    expect(iframe.style.height).toBe(before);
  });

  it("ignores a height message from a mismatched source window", () => {
    setupDom();
    runEmbedScript();
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    const before = iframe.style.height;

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "tyto-embed-height", uuid: UUID, height: 420 },
        origin: ORIGIN,
        source: window,
      }),
    );

    expect(iframe.style.height).toBe(before);
  });

  it("ignores a height message for a different uuid", () => {
    setupDom();
    runEmbedScript();
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    const before = iframe.style.height;

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "tyto-embed-height", uuid: "not-the-uuid", height: 999 },
        origin: ORIGIN,
        source: iframe.contentWindow,
      }),
    );

    expect(iframe.style.height).toBe(before);
    expect(iframe.style.height).not.toBe("999px");
  });

  it("ignores an out-of-range height", () => {
    setupDom();
    runEmbedScript();
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    const before = iframe.style.height;

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "tyto-embed-height", uuid: UUID, height: 999999 },
        origin: ORIGIN,
        source: iframe.contentWindow,
      }),
    );

    expect(iframe.style.height).toBe(before);
  });
});
