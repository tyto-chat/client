import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

let signedIn = true;
vi.mock("@/api/tokenStore", () => ({ useHasAccessToken: () => signedIn }));
vi.mock("@/api/blocks", () => ({
  fetchBlockedUsers: vi.fn().mockResolvedValue([
    { userId: 2, inEffect: true },
    { userId: 3, inEffect: false },
  ]),
  fetchBlockStatus: vi.fn(),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
}));

import { useBlockedUserIds } from "@/queries/blockQueries";

function setup() {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(() => useBlockedUserIds(), { wrapper });
}

describe("useBlockedUserIds", () => {
  afterEach(() => {
    signedIn = true;
  });

  it("returns only in-effect ids", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.size).toBe(1));
    expect([...result.current]).toEqual([2]);
  });

  it("is empty when signed out", () => {
    signedIn = false;
    const { result } = setup();
    expect(result.current.size).toBe(0);
  });
});
