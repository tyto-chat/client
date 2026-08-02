import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE } from "../fixtures";
import { CommunityManagerModal } from "@/components/CommunityManagerModal";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <a onClick={onClick}>{children}</a>
  ),
}));

const notifyMock = vi.fn();
vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({ notify: notifyMock }),
}));

function community(id: number, identifier: string, isPrivate = false) {
  return {
    "@id": `/api/communities/${identifier}`,
    id,
    identifier,
    name: identifier,
    isPrivate,
    accentColor: null,
    logo: null,
  };
}

const COMMUNITIES = [
  community(1, "member-town"),
  community(2, "stranger-city"),
  community(3, "secret-base", true),
];

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
  setAccessToken("jwt");
  notifyMock.mockReset();
  server.use(
    http.get(`${BASE}/api/v1/communities`, () => HttpResponse.json(COMMUNITIES)),
    http.get(`${BASE}/api/v1/me/community-memberships`, () =>
      HttpResponse.json([{ communityId: 1, role: "member" }]),
    ),
    http.get(`${BASE}/api/v1/me/pinned-communities`, () => HttpResponse.json([])),
  );
});

describe("CommunityManagerModal membership split", () => {
  it("lists only real memberships under Your communities, even for an admin", async () => {
    render(<CommunityManagerModal onClose={vi.fn()} />, { wrapper: makeWrapper() });

    await userEvent.click(screen.getByTestId("manager-tab-your"));

    expect(await screen.findByText("member-town")).toBeInTheDocument();
    expect(screen.queryByText("stranger-city")).not.toBeInTheDocument();
    expect(screen.queryByText("secret-base")).not.toBeInTheDocument();
  });

  it("lists public non-member communities under Other communities", async () => {
    render(<CommunityManagerModal onClose={vi.fn()} />, { wrapper: makeWrapper() });

    await userEvent.click(screen.getByTestId("manager-tab-other"));

    expect(await screen.findByText("stranger-city")).toBeInTheDocument();
    expect(screen.queryByText("member-town")).not.toBeInTheDocument();
    expect(screen.queryByText("secret-base")).not.toBeInTheDocument();
  });

  it("joins via the 204 endpoint and shows the success toast", async () => {
    server.use(
      http.post(
        `${BASE}/api/v1/communities/stranger-city/members`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );

    render(<CommunityManagerModal onClose={vi.fn()} />, { wrapper: makeWrapper() });

    await userEvent.click(screen.getByTestId("manager-tab-other"));
    await screen.findByText("stranger-city");
    await userEvent.click(screen.getByRole("button", { name: "Join community" }));

    await waitFor(() =>
      expect(notifyMock).toHaveBeenCalledWith(expect.stringContaining("stranger-city"), "success"),
    );
  });
});
