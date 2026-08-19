import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { compareUnified, fetchUnifiedConversations } from "@/desktop/unifiedDms";
import type { UnifiedConversation } from "@/desktop/unifiedDms";
import {
  ConnectionRegistry,
  type RegistrySnapshot,
} from "@/desktop/connections/ConnectionRegistry";
import type { ConnectionSnapshot } from "@/desktop/connections/IdentityConnection";
import type { ServerContext } from "@/desktop/connections/identityFetch";
import type { Conversation } from "@/types/api";

const ORIGIN_A = "https://alpha.example";
const ORIGIN_B = "https://beta.example";

function conversation(overrides: Partial<Conversation>): Conversation {
  return {
    "@id": "/api/conversations/c1",
    "@type": "Conversation",
    id: 1,
    identifier: "c1",
    members: [],
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    lastMessageAt: "2026-08-01T00:00:00Z",
    unreadCount: 0,
    ...overrides,
  };
}

function unified(overrides: Partial<UnifiedConversation>): UnifiedConversation {
  return {
    identityId: "ia",
    serverName: "Alpha",
    conversation: conversation({}),
    ...overrides,
  };
}

function connectionSnapshot(overrides: Partial<ConnectionSnapshot>): ConnectionSnapshot {
  return {
    identityId: "ia",
    status: "healthy",
    serverName: "Alpha",
    origin: ORIGIN_A,
    userId: 1,
    communities: [],
    unreadCounts: {},
    conversationActivityAt: null,
    error: null,
    ...overrides,
  };
}

function makeRegistryStub(
  connections: ConnectionSnapshot[],
  handles: Record<string, { ctx: ServerContext }>,
): ConnectionRegistry {
  const snapshot: RegistrySnapshot = {
    connections,
    activeIdentityId: connections[0]?.identityId ?? null,
  };
  return {
    getSnapshot: () => snapshot,
    getConnection: (id: string) => {
      const handle = handles[id];
      if (!handle) return undefined;
      return { serverContext: () => handle.ctx } as never;
    },
  } as unknown as ConnectionRegistry;
}

describe("compareUnified", () => {
  it("puts unread conversations before read ones", () => {
    const read = unified({
      identityId: "ia",
      conversation: conversation({ identifier: "read", unreadCount: 0 }),
    });
    const unread = unified({
      identityId: "ib",
      conversation: conversation({ identifier: "unread", unreadCount: 3 }),
    });

    const sorted = [read, unread].sort(compareUnified);

    expect(sorted.map((u) => u.conversation.identifier)).toEqual(["unread", "read"]);
  });

  it("orders by lastMessageAt descending within the same unread bucket", () => {
    const older = unified({
      identityId: "ia",
      conversation: conversation({
        identifier: "older",
        unreadCount: 0,
        lastMessageAt: "2026-08-01T00:00:00Z",
      }),
    });
    const newer = unified({
      identityId: "ib",
      conversation: conversation({
        identifier: "newer",
        unreadCount: 0,
        lastMessageAt: "2026-08-10T00:00:00Z",
      }),
    });

    const sorted = [older, newer].sort(compareUnified);

    expect(sorted.map((u) => u.conversation.identifier)).toEqual(["newer", "older"]);
  });

  it("interleaves cross-identity results: unread-first then recency, ignoring identityId", () => {
    const items = [
      unified({
        identityId: "ia",
        conversation: conversation({
          identifier: "a-read-old",
          unreadCount: 0,
          lastMessageAt: "2026-08-01T00:00:00Z",
        }),
      }),
      unified({
        identityId: "ib",
        conversation: conversation({
          identifier: "b-unread-old",
          unreadCount: 1,
          lastMessageAt: "2026-08-02T00:00:00Z",
        }),
      }),
      unified({
        identityId: "ia",
        conversation: conversation({
          identifier: "a-unread-new",
          unreadCount: 2,
          lastMessageAt: "2026-08-15T00:00:00Z",
        }),
      }),
      unified({
        identityId: "ib",
        conversation: conversation({
          identifier: "b-read-new",
          unreadCount: 0,
          lastMessageAt: "2026-08-16T00:00:00Z",
        }),
      }),
    ];

    const sorted = [...items].sort(compareUnified);

    expect(sorted.map((u) => u.conversation.identifier)).toEqual([
      "a-unread-new",
      "b-unread-old",
      "b-read-new",
      "a-read-old",
    ]);
  });

  it("treats a null lastMessageAt as oldest", () => {
    const withDate = unified({
      conversation: conversation({
        identifier: "dated",
        unreadCount: 0,
        lastMessageAt: "2026-08-01T00:00:00Z",
      }),
    });
    const withoutDate = unified({
      conversation: conversation({ identifier: "undated", unreadCount: 0, lastMessageAt: null }),
    });

    const sorted = [withoutDate, withDate].sort(compareUnified);

    expect(sorted.map((u) => u.conversation.identifier)).toEqual(["dated", "undated"]);
  });
});

describe("fetchUnifiedConversations", () => {
  it("hits each healthy origin once, skips unhealthy identities, and tags rows with identityId/serverName", async () => {
    let aHits = 0;
    let bHits = 0;
    server.use(
      http.get(`${ORIGIN_A}/api/v1/conversations`, () => {
        aHits += 1;
        return HttpResponse.json([conversation({ identifier: "a1", unreadCount: 0 })]);
      }),
      http.get(`${ORIGIN_B}/api/v1/conversations`, () => {
        bHits += 1;
        return HttpResponse.json({
          "hydra:member": [conversation({ identifier: "b1", unreadCount: 1 })],
        });
      }),
    );

    const registry = makeRegistryStub(
      [
        connectionSnapshot({ identityId: "ia", serverName: "Alpha", origin: ORIGIN_A }),
        connectionSnapshot({ identityId: "ib", serverName: "Beta", origin: ORIGIN_B }),
        connectionSnapshot({ identityId: "ic", serverName: "Gamma", status: "unreachable" }),
      ],
      {
        ia: { ctx: { origin: ORIGIN_A, apiVersion: "v1", getToken: () => "tok-a" } },
        ib: { ctx: { origin: ORIGIN_B, apiVersion: "v1", getToken: () => "tok-b" } },
      },
    );

    const result = await fetchUnifiedConversations(registry);

    expect(aHits).toBe(1);
    expect(bHits).toBe(1);
    expect(result).toHaveLength(2);
    expect(result.find((u) => u.conversation.identifier === "a1")).toMatchObject({
      identityId: "ia",
      serverName: "Alpha",
    });
    expect(result.find((u) => u.conversation.identifier === "b1")).toMatchObject({
      identityId: "ib",
      serverName: "Beta",
    });
  });

  it("returns an empty list when there are no healthy connections", async () => {
    const registry = makeRegistryStub(
      [connectionSnapshot({ identityId: "ia", status: "unreachable" })],
      {},
    );

    const result = await fetchUnifiedConversations(registry);

    expect(result).toEqual([]);
  });

  it("swallows a per-identity fetch failure and still returns the other identity's rows", async () => {
    server.use(
      http.get(`${ORIGIN_A}/api/v1/conversations`, () => HttpResponse.error()),
      http.get(`${ORIGIN_B}/api/v1/conversations`, () =>
        HttpResponse.json([conversation({ identifier: "b1" })]),
      ),
    );

    const registry = makeRegistryStub(
      [
        connectionSnapshot({ identityId: "ia", serverName: "Alpha", origin: ORIGIN_A }),
        connectionSnapshot({ identityId: "ib", serverName: "Beta", origin: ORIGIN_B }),
      ],
      {
        ia: { ctx: { origin: ORIGIN_A, apiVersion: "v1", getToken: () => "tok-a" } },
        ib: { ctx: { origin: ORIGIN_B, apiVersion: "v1", getToken: () => "tok-b" } },
      },
    );

    const result = await fetchUnifiedConversations(registry);

    expect(result.map((u) => u.conversation.identifier)).toEqual(["b1"]);
  });
});
