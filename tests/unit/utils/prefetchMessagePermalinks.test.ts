import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE, mockUser } from "../../fixtures";
import { prefetchMessagePermalinks } from "@/utils/prefetchMessagePermalinks";
import { queryKeys } from "@/queries/queryKeys";
import type { Message } from "@/types/api";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

function msg(id: string, text: string): Message {
  return {
    "@id": `/api/messages/${id}`,
    "@type": "Message",
    id,
    text,
    isDeleted: false,
    edited: false,
    kind: "standard",
    createdAt: "2026-05-20T10:00:00Z",
    createdBy: mockUser,
    reactions: null,
    pageNumber: 1,
  };
}

beforeEach(() => configureApiClient(BASE));

describe("prefetchMessagePermalinks", () => {
  it("is a no-op when there are no permalinks", async () => {
    const qc = new QueryClient();
    await prefetchMessagePermalinks(qc, [msg("a", "hello, no links here")]);
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
  });

  it("prefetches every unique uuid into the message cache", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/api/v1/messages/${A}`, () => {
        calls++;
        return HttpResponse.json(msg(A, "linked"));
      }),
      http.get(`${BASE}/api/v1/messages/${B}`, () => {
        calls++;
        return HttpResponse.json(msg(B, "linked"));
      }),
    );

    const qc = new QueryClient();
    const origin = window.location.origin;
    const body = msg(
      "host",
      `see ${origin}/m/${A} and ${origin}/m/${B} and again ${origin}/m/${A}`,
    );
    await prefetchMessagePermalinks(qc, [body]);

    expect(calls).toBe(2); // dedup
    expect(qc.getQueryData(queryKeys.message(A))).toBeTruthy();
    expect(qc.getQueryData(queryKeys.message(B))).toBeTruthy();
  });

  it("swallows fetch errors (404s leave cache empty, don't throw)", async () => {
    server.use(
      http.get(`${BASE}/api/v1/messages/${A}`, () => new HttpResponse(null, { status: 404 })),
    );

    const qc = new QueryClient();
    const origin = window.location.origin;
    await expect(
      prefetchMessagePermalinks(qc, [msg("host", `link ${origin}/m/${A}`)]),
    ).resolves.toBeUndefined();
  });
});
