import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE, mockUser } from "../../fixtures";
import { ChatPanel } from "@/components/preferences/ChatPanel";
import { SubmitKeyProvider } from "@/context/SubmitKeyContext";

vi.mock("@/context/AuthContext", () => ({ useAuthContext: () => ({ user: mockUser }) }));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SubmitKeyProvider>{children}</SubmitKeyProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("test-token");
  server.use(
    http.get(`${BASE}/api/v1/me/preferences`, () =>
      HttpResponse.json({ resumeLastLocation: true, updatedAt: "2026-07-20T00:00:00Z" }),
    ),
    http.patch(`${BASE}/api/v1/me/preferences`, async ({ request }) => {
      const patch = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({
        resumeLastLocation: true,
        updatedAt: "2026-07-20T00:00:00Z",
        ...patch,
      });
    }),
  );
});

describe("ChatPanel", () => {
  it("shows the resume-last-location switch checked for a logged-in user", async () => {
    render(<ChatPanel />, { wrapper: makeWrapper() });
    expect(await screen.findByTestId("pref-resume-last-location")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("toggles resume-last-location off when clicked", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    render(<ChatPanel />, { wrapper: makeWrapper() });
    const toggle = await screen.findByTestId("pref-resume-last-location");
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await userEvent.setup().click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });
});
