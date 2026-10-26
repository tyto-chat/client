import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { vi } from "vitest";
import { BlockedUsersSection } from "@/components/preferences/BlockedUsersSection";

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({ notify: vi.fn() }),
}));

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("test-token");
});

describe("BlockedUsersSection", () => {
  it("lists blocked users with not-in-effect note and unblocks on click", async () => {
    let deleted = false;
    server.use(
      http.get(`${BASE}/api/v1/me/blocks`, () =>
        HttpResponse.json({
          items: [
            {
              userId: 5,
              name: "Alice",
              avatarUrl: null,
              blockedAt: "2026-10-20T12:00:00Z",
              inEffect: true,
            },
            {
              userId: 6,
              name: "Bob",
              avatarUrl: null,
              blockedAt: "2026-10-21T12:00:00Z",
              inEffect: false,
            },
          ],
        }),
      ),
      http.delete(`${BASE}/api/v1/me/blocks/6`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    render(<BlockedUsersSection />, { wrapper: Wrapper });
    const rows = await screen.findAllByTestId("blocked-user-row");
    expect(rows).toHaveLength(2);
    expect(screen.getAllByText(/^Not in effect/)).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Unblock Bob" }));
    expect(screen.getByRole("button", { name: "Unblock Alice" })).toBeInTheDocument();
    await waitFor(() => expect(deleted).toBe(true));
  });

  it("shows the empty state", async () => {
    server.use(http.get(`${BASE}/api/v1/me/blocks`, () => HttpResponse.json({ items: [] })));
    render(<BlockedUsersSection />, { wrapper: Wrapper });
    expect(await screen.findByText("You haven't blocked anyone.")).toBeInTheDocument();
  });

  it("shows an error state instead of the empty state when the fetch fails", async () => {
    server.use(http.get(`${BASE}/api/v1/me/blocks`, () => new HttpResponse(null, { status: 500 })));
    render(<BlockedUsersSection />, { wrapper: Wrapper });
    expect(await screen.findByText(/failed to load/i)).toBeInTheDocument();
    expect(screen.queryByText("You haven't blocked anyone.")).toBeNull();
  });
});
