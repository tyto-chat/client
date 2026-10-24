import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MessageContent } from "@/components/chat/MessageContent";
import { configureApiClient } from "@/api/client";
import {
  _resetSessionHostsForTests,
  getRemoteContentHosts,
  setRemoteContentLevel,
} from "@/utils/remoteContent";

vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return { ...actual, useNavigate: () => vi.fn() };
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

const FOREIGN = "![shot](https://cdn.evil.example/image/42)";
const OWN = "![ours](https://server.example.com/media/x/42)";

beforeEach(() => {
  localStorage.clear();
  _resetSessionHostsForTests();
  configureApiClient("https://server.example.com/api/v1");
});

describe("MessageContent remote images", () => {
  it("gates foreign inline images and keeps own-server ones", () => {
    render(<MessageContent text={`${FOREIGN} ${OWN}`} renderPermalinkPreview={false} />, {
      wrapper,
    });

    expect(screen.getByText("Load image from cdn.evil.example")).toBeInTheDocument();
    expect(screen.getByText("Always load from cdn.evil.example")).toBeInTheDocument();
    const images = Array.from(document.querySelectorAll("img")).map((img) => img.src);
    expect(images).toEqual(["https://server.example.com/media/x/42"]);
  });

  it("loads the image for this session when asked", () => {
    render(<MessageContent text={FOREIGN} renderPermalinkPreview={false} />, { wrapper });

    fireEvent.click(screen.getByText("Load image from cdn.evil.example"));

    expect(document.querySelector('img[src="https://cdn.evil.example/image/42"]')).not.toBeNull();
    expect(getRemoteContentHosts()).toEqual([]);
  });

  it("adds the exact host to the list from the always button", () => {
    render(<MessageContent text={FOREIGN} renderPermalinkPreview={false} />, { wrapper });

    fireEvent.click(screen.getByText("Always load from cdn.evil.example"));

    expect(getRemoteContentHosts()).toEqual(["cdn.evil.example"]);
    expect(document.querySelector('img[src="https://cdn.evil.example/image/42"]')).not.toBeNull();
  });

  it("renders everything under the all level", () => {
    setRemoteContentLevel("all");
    render(<MessageContent text={FOREIGN} renderPermalinkPreview={false} />, { wrapper });
    expect(screen.queryByText(/Load image from/)).not.toBeInTheDocument();
    expect(document.querySelector('img[src="https://cdn.evil.example/image/42"]')).not.toBeNull();
  });
});
