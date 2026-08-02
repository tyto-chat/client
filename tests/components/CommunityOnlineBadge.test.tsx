import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE, mockUser } from "../fixtures";
import { CommunityOnlineBadge } from "@/components/CommunityOnlineBadge";

const COMMUNITY = "dragon";
const SUMMARY_URL = `${BASE}/api/v1/communities/${COMMUNITY}/presence/summary`;

let authUser: typeof mockUser | null = mockUser;

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authUser }),
}));

function mockSummary(onlineCount: number, guestsOnline: number) {
  server.use(http.get(SUMMARY_URL, () => HttpResponse.json({ onlineCount, guestsOnline })));
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("test-token");
  authUser = mockUser;
});

describe("CommunityOnlineBadge guests", () => {
  it("renders guest count when guests online (authed button variant)", async () => {
    mockSummary(12, 3);
    render(<CommunityOnlineBadge communityIdentifier={COMMUNITY} />, {
      wrapper: makeWrapper(),
    });
    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByTestId("community-online-badge")).toHaveAttribute(
      "title",
      "12 member online · 3 guests browsing",
    );
  });

  it("renders no guest section when zero guests (authed button variant)", async () => {
    mockSummary(12, 0);
    render(<CommunityOnlineBadge communityIdentifier={COMMUNITY} />, {
      wrapper: makeWrapper(),
    });
    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByTestId("community-online-badge").querySelector("svg")).toBeNull();
    expect(screen.getByTestId("community-online-badge")).toHaveAttribute(
      "title",
      "12 member online",
    );
  });

  it("renders guest count when guests online (anonymous span variant)", async () => {
    authUser = null;
    mockSummary(7, 2);
    render(<CommunityOnlineBadge communityIdentifier={COMMUNITY} />, {
      wrapper: makeWrapper(),
    });
    expect(await screen.findByText("7")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByTestId("community-online-badge")).toHaveAttribute(
      "title",
      "7 member online · 2 guests browsing",
    );
  });

  it("renders no guest section when zero guests (anonymous span variant)", async () => {
    authUser = null;
    mockSummary(7, 0);
    render(<CommunityOnlineBadge communityIdentifier={COMMUNITY} />, {
      wrapper: makeWrapper(),
    });
    expect(await screen.findByText("7")).toBeInTheDocument();
    expect(screen.getByTestId("community-online-badge").querySelector("svg")).toBeNull();
    expect(screen.getByTestId("community-online-badge")).toHaveAttribute(
      "title",
      "7 member online",
    );
  });
  it("renders guests-only state without the member dot", async () => {
    authUser = null;
    mockSummary(0, 4);
    render(<CommunityOnlineBadge communityIdentifier={COMMUNITY} />, {
      wrapper: makeWrapper(),
    });
    expect(await screen.findByText("4")).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.getByTestId("community-online-badge")).toHaveAttribute(
      "title",
      "4 guests browsing",
    );
  });
});
