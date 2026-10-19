import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { YoutubeEmbed } from "@/components/chat/YoutubeEmbed";
import { configureApiClient } from "@/api/client";
import { getRemoteContentHosts, setRemoteContentHosts } from "@/utils/remoteContent";

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  configureApiClient("https://server.example.com/api/v1");
  fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify({ title: "Clip" })));
});

afterEach(() => fetchSpy.mockRestore());

describe("YoutubeEmbed", () => {
  it("neither fetches the title nor shows the thumbnail until allowed", () => {
    render(<YoutubeEmbed videoId="abc123" />, { wrapper });

    expect(screen.getByTestId("remote-youtube-placeholder")).toHaveTextContent(
      "Load preview from youtube.com",
    );
    expect(document.querySelector("img")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("the always button adds youtube.com and reveals the card", () => {
    render(<YoutubeEmbed videoId="abc123" />, { wrapper });

    fireEvent.click(screen.getByTestId("remote-youtube-always"));

    expect(getRemoteContentHosts()).toEqual(["youtube.com"]);
    expect(document.querySelector("img")).toHaveAttribute(
      "src",
      "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
    );
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("oembed?url="));
  });

  it("renders the card immediately when youtube.com is already allowed", () => {
    setRemoteContentHosts(["youtube.com"]);
    render(<YoutubeEmbed videoId="abc123" />, { wrapper });
    expect(screen.queryByTestId("remote-youtube-placeholder")).not.toBeInTheDocument();
    expect(document.querySelector("img")).not.toBeNull();
  });
});
