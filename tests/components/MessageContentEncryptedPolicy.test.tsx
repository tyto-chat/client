import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MessageContent } from "@/components/chat/MessageContent";
import { configureApiClient } from "@/api/client";
import { prefetchMessagePermalinks } from "@/utils/prefetchMessagePermalinks";
import { setRemoteContentLevel } from "@/utils/remoteContent";
import type { Message } from "@/types/api";

vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return { ...actual, useNavigate: () => vi.fn() };
});

const ORIGIN = "https://server.example.com";
const PERMALINK = `${ORIGIN}/m/0b6c7d2e-9f1a-4c3b-8d5e-6f7a8b9c0d1e`;
const BODY = [
  "watch https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "see https://images.example.org/cat.png",
  `quote ${PERMALINK}`,
  '<img src="https://tracker.example.net/pixel.gif">',
].join("\n\n");

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  localStorage.clear();
  client = new QueryClient();
  configureApiClient(`${ORIGIN}/api/v1`);
  setRemoteContentLevel("all");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MessageContent rendering policy", () => {
  it("encrypted_render_mounts_no_youtube_image_or_permalink_embed", () => {
    const { container } = render(<MessageContent text={BODY} renderPolicy="encrypted" />, {
      wrapper,
    });

    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelector('[data-testid^="message-quote"]')).toBeNull();
    expect(
      client
        .getQueryCache()
        .getAll()
        .filter((q) => q.state.fetchStatus !== "idle" || q.state.data !== undefined),
    ).toHaveLength(0);
  });

  it("encrypted_render_sends_no_content_derived_requests", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const xhrOpen = vi.spyOn(XMLHttpRequest.prototype, "open");
    const srcSetter = vi.spyOn(HTMLImageElement.prototype, "src", "set");
    const createElement = vi.spyOn(document, "createElement");

    render(<MessageContent text={BODY} renderPolicy="encrypted" />, { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrOpen).not.toHaveBeenCalled();
    expect(srcSetter).not.toHaveBeenCalled();
    expect(createElement.mock.calls.some(([tag]) => String(tag).toLowerCase() === "iframe")).toBe(
      false,
    );
  });

  it("encrypted_render_skips_permalink_prefetch", async () => {
    const message = {
      "@id": "/api/v1/messages/x",
      id: "x",
      text: "e2ee:1:eyJnIjoxfQ",
    } as unknown as Message;

    await prefetchMessagePermalinks(client, [message]);

    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it("plain_render_unchanged", () => {
    const { container } = render(<MessageContent text={BODY} />, { wrapper });

    expect(container.querySelectorAll("img").length).toBeGreaterThan(0);
  });
});
