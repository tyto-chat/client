import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE } from "../fixtures";
import { PresenceHistoryChart } from "@/components/PresenceHistoryChart";

const COMMUNITY = "dragon";
const HISTORY_URL = `${BASE}/api/v1/communities/${COMMUNITY}/presence/history`;

const SAMPLES = Array.from({ length: 10 }, (_, i) => ({
  sampledAt: `2026-08-01T${String(i).padStart(2, "0")}:00:00+00:00`,
  membersOnline: i + 1,
  guestsOnline: i % 3,
}));

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
});

describe("PresenceHistoryChart", () => {
  it("renders two polylines from samples", async () => {
    server.use(http.get(HISTORY_URL, () => HttpResponse.json({ samples: SAMPLES })));
    const { container } = render(<PresenceHistoryChart communityIdentifier={COMMUNITY} />, {
      wrapper: makeWrapper(),
    });
    await screen.findByTestId("presence-history-chart");
    expect(container.querySelectorAll("polyline")).toHaveLength(2);
  });

  it("shows empty state without samples", async () => {
    server.use(http.get(HISTORY_URL, () => HttpResponse.json({ samples: [] })));
    render(<PresenceHistoryChart communityIdentifier={COMMUNITY} />, {
      wrapper: makeWrapper(),
    });
    expect(await screen.findByTestId("presence-history-empty")).toBeInTheDocument();
  });

  it("switches range and refetches with the matching days param", async () => {
    const requestedDays: string[] = [];
    server.use(
      http.get(HISTORY_URL, ({ request }) => {
        requestedDays.push(new URL(request.url).searchParams.get("days") ?? "");
        return HttpResponse.json({ samples: SAMPLES });
      }),
    );
    render(<PresenceHistoryChart communityIdentifier={COMMUNITY} />, {
      wrapper: makeWrapper(),
    });
    await screen.findByTestId("presence-history-chart");
    expect(requestedDays).toContain("7");

    fireEvent.click(screen.getByRole("button", { name: "24h" }));
    await waitFor(() => expect(requestedDays).toContain("1"));

    fireEvent.click(screen.getByRole("button", { name: "30d" }));
    await waitFor(() => expect(requestedDays).toContain("30"));
  });

  it("thins to 360 points when samples exceed the cap", async () => {
    const many = Array.from({ length: 500 }, (_, i) => ({
      sampledAt: "2026-08-01T00:00:00+00:00",
      membersOnline: i,
      guestsOnline: i % 5,
    }));
    server.use(http.get(HISTORY_URL, () => HttpResponse.json({ samples: many })));
    const { container } = render(<PresenceHistoryChart communityIdentifier={COMMUNITY} />, {
      wrapper: makeWrapper(),
    });
    await screen.findByTestId("presence-history-chart");
    const polylines = container.querySelectorAll("polyline");
    const membersPolyline = polylines[polylines.length - 1]!;
    const points = membersPolyline.getAttribute("points")!.trim().split(" ");
    expect(points).toHaveLength(360);
  });
});
