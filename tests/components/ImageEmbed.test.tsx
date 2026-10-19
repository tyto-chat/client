import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { TEST_BASE_URL as BASE } from "../fixtures";
import { ImageEmbed } from "@/components/chat/ImageEmbed";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import {
  _resetSessionHostsForTests,
  getRemoteContentHosts,
  setRemoteContentHosts,
  setRemoteContentLevel,
} from "@/utils/remoteContent";

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  localStorage.clear();
  _resetSessionHostsForTests();
  setAccessToken(null);
  configureApiClient("https://server.example.com/api/v1");
});

describe("ImageEmbed", () => {
  it("renders a stranger's image only after the viewer asks for it", () => {
    render(<ImageEmbed url="https://evil.example/a.png" />, { wrapper });
    const placeholder = screen.getByTestId("remote-image-placeholder");
    expect(placeholder).toHaveTextContent("Load image from evil.example");
    expect(document.querySelector("img")).toBeNull();

    fireEvent.click(placeholder);

    expect(document.querySelector("img")).toHaveAttribute("src", "https://evil.example/a.png");
  });

  it("adds the top domain to the always-load list from the second button", () => {
    render(<ImageEmbed url="https://i.imgur.com/a.png" />, { wrapper });
    const always = screen.getByTestId("remote-image-always");
    expect(always).toHaveTextContent("Always load from imgur.com");

    fireEvent.click(always);

    expect(getRemoteContentHosts()).toEqual(["imgur.com"]);
    expect(document.querySelector("img")).toHaveAttribute("src", "https://i.imgur.com/a.png");
  });

  it("syncs the always-load choice to the server when signed in", async () => {
    configureApiClient(BASE);
    setAccessToken("test-token");
    const patches: unknown[] = [];
    server.use(
      http.patch(`${BASE}/api/v1/me/preferences`, async ({ request }) => {
        patches.push(await request.json());
        return HttpResponse.json({ updatedAt: "2026-10-19T00:00:00Z" });
      }),
    );
    render(<ImageEmbed url="https://i.imgur.com/a.png" />, { wrapper });

    fireEvent.click(screen.getByTestId("remote-image-always"));

    await waitFor(() => expect(patches).toEqual([{ remoteContentHosts: ["imgur.com"] }]));
  });

  it("loads images from added hosts and the own server immediately", () => {
    setRemoteContentHosts(["imgur.com"]);
    render(<ImageEmbed url="https://i.imgur.com/a.png" />, { wrapper });
    expect(document.querySelector("img")).toHaveAttribute("src", "https://i.imgur.com/a.png");
  });

  it("reveals already rendered images when the policy loosens", () => {
    render(<ImageEmbed url="https://i.imgur.com/a.png" />, { wrapper });
    expect(screen.getByTestId("remote-image-placeholder")).toBeInTheDocument();
    act(() => setRemoteContentLevel("all"));
    expect(document.querySelector("img")).toHaveAttribute("src", "https://i.imgur.com/a.png");
  });
});
