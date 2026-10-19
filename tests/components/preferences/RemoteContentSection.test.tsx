import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE, mockUser } from "../../fixtures";
import { RemoteContentSection } from "@/components/preferences/RemoteContentSection";
import { getRemoteContentHosts, getRemoteContentLevel } from "@/utils/remoteContent";

vi.mock("@/context/AuthContext", () => ({ useAuthContext: () => ({ user: mockUser }) }));

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const patches: Record<string, unknown>[] = [];

beforeEach(() => {
  localStorage.clear();
  patches.length = 0;
  configureApiClient(BASE);
  setAccessToken("test-token");
  server.use(
    http.patch(`${BASE}/api/v1/me/preferences`, async ({ request }) => {
      const patch = (await request.json()) as Record<string, unknown>;
      patches.push(patch);
      return HttpResponse.json({ updatedAt: "2026-10-19T00:00:00Z", ...patch });
    }),
  );
});

describe("RemoteContentSection", () => {
  it("switches the level locally and on the server", async () => {
    render(<RemoteContentSection />, { wrapper: makeWrapper() });

    fireEvent.click(screen.getByTestId("remote-content-all"));

    expect(getRemoteContentLevel()).toBe("all");
    await waitFor(() => expect(patches).toContainEqual({ remoteContent: "all" }));
    expect(screen.queryByLabelText("Add site…")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("remote-content-custom"));
    expect(screen.getByLabelText("Add site…")).toBeInTheDocument();
  });

  it("rejects input that is not a host and ignores duplicates", async () => {
    render(<RemoteContentSection />, { wrapper: makeWrapper() });
    const input = screen.getByLabelText("Add site…");
    const form = input.closest("form")!;

    fireEvent.change(input, { target: { value: "not a host" } });
    fireEvent.submit(form);
    expect(getRemoteContentHosts()).toEqual([]);
    expect(screen.queryByLabelText(/^Remove /)).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "imgur.com" } });
    fireEvent.submit(form);
    fireEvent.change(input, { target: { value: "https://i.imgur.com/x" } });
    fireEvent.submit(form);
    expect(getRemoteContentHosts()).toEqual(["imgur.com", "i.imgur.com"]);
    fireEvent.change(input, { target: { value: "IMGUR.com" } });
    fireEvent.submit(form);
    expect(getRemoteContentHosts()).toEqual(["imgur.com", "i.imgur.com"]);
    await waitFor(() => expect(patches.length).toBe(2));
  });

  it("adds and removes hosts", async () => {
    render(<RemoteContentSection />, { wrapper: makeWrapper() });

    fireEvent.change(screen.getByLabelText("Add site…"), {
      target: { value: "https://www.CDN.example.net/x" },
    });
    fireEvent.submit(screen.getByLabelText("Add site…").closest("form")!);

    expect(getRemoteContentHosts()).toEqual(["cdn.example.net"]);
    await waitFor(() =>
      expect(patches).toContainEqual({ remoteContentHosts: ["cdn.example.net"] }),
    );

    fireEvent.click(screen.getByLabelText("Remove cdn.example.net"));
    expect(getRemoteContentHosts()).toEqual([]);
  });
});
