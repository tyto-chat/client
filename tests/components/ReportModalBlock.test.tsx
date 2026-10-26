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
import { ReportModal } from "@/components/ReportModal";

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({ notify: vi.fn() }),
}));

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

let calls: string[] = [];

beforeEach(() => {
  calls = [];
  configureApiClient(BASE);
  setAccessToken("test-token");
  server.use(
    http.get(`${BASE}/api/v1/me/blocks/2`, () =>
      HttpResponse.json({ userId: 2, blocked: false, blockable: true, inEffect: false }),
    ),
    http.get(`${BASE}/api/v1/me/blocks`, () => HttpResponse.json({ items: [] })),
    http.post(`${BASE}/api/v1/reports`, () => {
      calls.push("report");
      return HttpResponse.json({ id: 1 });
    }),
    http.post(`${BASE}/api/v1/me/blocks`, () => {
      calls.push("block");
      return HttpResponse.json({
        userId: 2,
        name: "X",
        avatarUrl: null,
        blockedAt: "2026-10-26T00:00:00Z",
        inEffect: true,
      });
    }),
  );
});

function renderModal() {
  return render(<ReportModal target={{ messageId: "m-1" }} blockUserId={2} onClose={vi.fn()} />, {
    wrapper: Wrapper,
  });
}

describe("ReportModal also-block", () => {
  it("blocks after submit when the box stays checked", async () => {
    renderModal();
    const box = await screen.findByLabelText("Also block this person");
    expect(box).toBeChecked();
    await userEvent.click(screen.getByText("Submit report"));
    await waitFor(() => expect(calls).toEqual(["report", "block"]));
  });

  it("does not block when unchecked", async () => {
    renderModal();
    await userEvent.click(await screen.findByLabelText("Also block this person"));
    await userEvent.click(screen.getByText("Submit report"));
    await waitFor(() => expect(calls).toEqual(["report"]));
  });
});
