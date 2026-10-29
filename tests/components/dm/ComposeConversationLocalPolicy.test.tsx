import { afterEach, describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { ComposeConversation } from "@/components/dm/ComposeConversation";
import { E2eeProvider } from "@/e2ee/E2eeContext";
import type { E2eeIdentity } from "@/e2ee/conversationSession";
import type { PreflightOutcome } from "@/api/conversations";
import { LocalSecurityState } from "@/e2ee/localSecurityState";
import { PinStore } from "@/e2ee/pinStore";
import { plainWriteRefusal, setActiveSecurity } from "@/e2ee/admission";
import type { KeyStore, KeyStoreScope } from "@/e2ee/keyStore";
import type { Conversation } from "@/types/api";
import { memoryKeyStoreFactory } from "../../mocks/memoryKeyStore";

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: unknown) => opts,
  useNavigate: () => mockNavigate,
}));
const notifyMock = vi.fn();
vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({ notify: notifyMock }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock("@/context/TimezoneContext", () => ({ useTimezone: () => ({ timezone: "UTC" }) }));
vi.mock("@/components/MobileTopBar", () => ({ MobileTopBar: () => null }));
const serverInfo = vi.hoisted(() => ({ mode: "enabled" as string }));
vi.mock("@/hooks/useServerInfo", () => ({
  useServerInfo: () => ({ encryptedDmsMode: serverInfo.mode }),
}));
const sends = vi.hoisted(() => ({ last: null as Promise<unknown> | null }));
vi.mock("@/components/chat/MessagePane", () => ({
  MessagePane: ({
    onSend,
    footer,
    writeLocked,
  }: {
    onSend: (text: string) => void;
    footer?: ReactNode;
    writeLocked?: boolean;
  }) => (
    <>
      {footer}
      <span data-testid="pane-locked">{writeLocked ? "locked" : "open"}</span>
      <button
        onClick={() => {
          sends.last = Promise.resolve(onSend("hello there"));
          sends.last.catch(() => undefined);
        }}
      >
        send-stub
      </button>
    </>
  ),
}));

let preflightCalls: string[] = [];
let createCalls: unknown[] = [];

function preflightReply(outcome: PreflightOutcome, extra: Record<string, unknown> = {}) {
  return HttpResponse.json({
    outcome,
    reason: null,
    refusingUserIds: [],
    unreachableUserIds: [],
    existingIdentifier: null,
    ...extra,
  });
}

function usePreflight(...replies: Array<() => Response>) {
  let call = 0;
  server.use(
    http.get(`${BASE}/api/v1/conversations/preflight`, ({ request }) => {
      preflightCalls.push(new URL(request.url).search);
      const reply = replies[Math.min(call, replies.length - 1)] as () => Response;
      call += 1;
      return reply();
    }),
  );
}

function renderCompose(
  options: {
    identity?: E2eeIdentity | null;
    capable?: boolean;
    to?: number;
    security?: LocalSecurityState | null;
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <E2eeProvider
        identity={options.identity ?? null}
        security={options.security ?? null}
        capable={options.capable ?? true}
      >
        <ComposeConversation initialRecipientId={options.to ?? null} />
      </E2eeProvider>
    </QueryClientProvider>,
  );
}

async function pickBora() {
  await userEvent.click(await screen.findByTestId("picker-chip-2"));
}

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("jwt");
  mockNavigate.mockReset();
  notifyMock.mockReset();
  serverInfo.mode = "enabled";
  preflightCalls = [];
  createCalls = [];
  server.use(
    http.get(`${BASE}/api/v1/me/invitable-users`, () =>
      HttpResponse.json({
        items: [
          { id: 2, name: "Bora", avatarUrl: null },
          { id: 3, name: "Cleo", avatarUrl: null },
        ],
      }),
    ),
    http.post(`${BASE}/api/v1/conversations`, async ({ request }) => {
      createCalls.push(await request.json());
      return HttpResponse.json({
        "@id": "/api/v1/conversations/plain-1",
        id: 77,
        identifier: "plain-1",
      });
    }),
    http.post(`${BASE}/api/v1/conversations/plain-1/messages`, () =>
      HttpResponse.json({ "@id": "/api/v1/messages/m1" }, { status: 201 }),
    ),
  );
});

const scope: KeyStoreScope = { serverOrigin: BASE, serverUserId: 1, profileId: "p" };
let store: KeyStore;

beforeEach(() => {
  store = memoryKeyStoreFactory()();
});

afterEach(() => setActiveSecurity(null));

async function pin(userId: number) {
  await new PinStore(store, scope).pin(userId, new Uint8Array(32).fill(userId), 1);
}

describe("local policy in compose", () => {
  it("plain_conversation_accepted_via_fallback_dialog_stays_usable", async () => {
    usePreflight(() => preflightReply("plain_fallback", { unreachableUserIds: [2] }));
    const security = await LocalSecurityState.open(store, scope);
    renderCompose({ security });
    await pickBora();
    await screen.findByTestId("e2ee-plain-inline");

    await userEvent.click(screen.getByText("send-stub"));
    await userEvent.click(await screen.findByTestId("e2ee-plain-fallback-confirm"));

    await waitFor(() => expect(security.snapshot().acceptedPlainConversations.has(77)).toBe(true));
    await pin(2);
    await security.refreshPins();
    const created = { id: 77, identifier: "plain-1", members: [{ userId: 1 }, { userId: 2 }] };
    expect(plainWriteRefusal(created as unknown as Conversation, security.snapshot())).toBe(null);
  });

  it("a pinned peer reported unreachable blocks instead of offering plain", async () => {
    usePreflight(() => preflightReply("plain_fallback", { unreachableUserIds: [2] }));
    await pin(2);
    renderCompose({ security: await LocalSecurityState.open(store, scope) });
    await pickBora();

    expect(await screen.findByTestId("e2ee-creation-blocked")).toHaveTextContent(
      "Nothing was sent unencrypted",
    );
    expect(screen.queryByTestId("e2ee-plain-inline")).toBeNull();
    await userEvent.click(screen.getByText("send-stub"));
    expect(screen.queryByTestId("e2ee-plain-fallback-dialog")).toBeNull();
    expect(createCalls).toEqual([]);
  });

  it("a pinned peer in a group blocks before asking the server", async () => {
    usePreflight(() => preflightReply("plain"));
    await pin(3);
    renderCompose({ security: await LocalSecurityState.open(store, scope) });
    await pickBora();
    await waitFor(() => expect(preflightCalls).toHaveLength(1));

    await userEvent.click(await screen.findByTestId("picker-chip-3"));

    expect(await screen.findByTestId("e2ee-creation-blocked")).toHaveTextContent(
      "encrypted group conversations are not available yet",
    );
    expect(preflightCalls).toHaveLength(1);
    expect(screen.getByTestId("pane-locked")).toHaveTextContent("locked");
  });

  it("own refusal blocks a plain outcome even when the server allows it", async () => {
    usePreflight(() => preflightReply("plain", { reason: "operator_disabled" }));
    serverInfo.mode = "disabled";
    const security = await LocalSecurityState.open(store, scope);
    await security.turnRefusalOn([]);
    renderCompose({ security });
    await pickBora();

    expect(await screen.findByTestId("e2ee-creation-blocked")).toHaveTextContent(
      "You only accept end-to-end encrypted direct messages, and Bora cannot take part in one yet.",
    );
    await userEvent.click(screen.getByText("send-stub"));
    expect(createCalls).toEqual([]);
  });
});
