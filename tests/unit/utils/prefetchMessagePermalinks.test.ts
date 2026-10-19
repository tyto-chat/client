import { afterEach, describe, it, expect, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE, mockUser } from "../../fixtures";
import { prefetchMessagePermalinks } from "@/utils/prefetchMessagePermalinks";
import { queryKeys } from "@/queries/queryKeys";
import type { Message } from "@/types/api";
import {
  clearFakeDirectory,
  fakeEndpoint,
  registerFakeDirectory,
} from "../../mocks/serverDirectory";

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
afterEach(clearFakeDirectory);

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

describe("prefetchMessagePermalinks across servers", () => {
  const FOREIGN = "https://b.example";

  it("prefetches a link to an added server under the foreign key through its connection", async () => {
    registerFakeDirectory([fakeEndpoint("ib", FOREIGN)], "ia");
    let auth: string | null = null;
    server.use(
      http.get(`${FOREIGN}/api/v1/messages/${A}`, ({ request }) => {
        auth = request.headers.get("Authorization");
        return HttpResponse.json(msg(A, "over there"));
      }),
    );

    const qc = new QueryClient();
    await prefetchMessagePermalinks(qc, [msg("host", `see ${FOREIGN}/m/${A}`)]);

    expect(qc.getQueryData(queryKeys.foreignMessage(FOREIGN, A))).toBeTruthy();
    expect(qc.getQueryData(queryKeys.message(A))).toBeUndefined();
    expect(auth).toBe("Bearer token-ib");
  });

  it("keeps the same uuid on two servers in two entries", async () => {
    registerFakeDirectory([fakeEndpoint("ib", FOREIGN)], "ia");
    server.use(
      http.get(`${BASE}/api/v1/messages/${A}`, () => HttpResponse.json(msg(A, "here"))),
      http.get(`${FOREIGN}/api/v1/messages/${A}`, () => HttpResponse.json(msg(A, "there"))),
    );

    const qc = new QueryClient();
    const origin = window.location.origin;
    await prefetchMessagePermalinks(qc, [msg("host", `${origin}/m/${A} ${FOREIGN}/m/${A}`)]);

    expect((qc.getQueryData(queryKeys.message(A)) as Message).text).toBe("here");
    expect((qc.getQueryData(queryKeys.foreignMessage(FOREIGN, A)) as Message).text).toBe("there");
  });

  it("does not fetch an unknown host or a lookalike", async () => {
    registerFakeDirectory([fakeEndpoint("ib", FOREIGN)], "ia");
    let called = false;
    server.use(
      http.get("https://stranger.example/api/v1/messages/:id", () => {
        called = true;
        return HttpResponse.json({});
      }),
      http.get("https://b.example.evil.com/api/v1/messages/:id", () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    const qc = new QueryClient();
    await prefetchMessagePermalinks(qc, [
      msg("host", `https://stranger.example/m/${A} https://b.example.evil.com/m/${B}`),
    ]);
    expect(called).toBe(false);
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
  });

  it("swallows a foreign failure", async () => {
    registerFakeDirectory([fakeEndpoint("ib", FOREIGN)], "ia");
    server.use(
      http.get(`${FOREIGN}/api/v1/messages/${A}`, () => new HttpResponse(null, { status: 403 })),
    );
    await expect(
      prefetchMessagePermalinks(new QueryClient(), [msg("host", `${FOREIGN}/m/${A}`)]),
    ).resolves.toBeUndefined();
  });
});
