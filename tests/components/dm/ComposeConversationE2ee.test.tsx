import { describe, it, expect, beforeEach, vi } from "vitest";
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
import { encryptedHarness, PEER } from "../../mocks/e2eeHttpHarness";

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
  options: { identity?: E2eeIdentity | null; capable?: boolean; to?: number } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <E2eeProvider identity={options.identity ?? null} capable={options.capable ?? true}>
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
      return HttpResponse.json({ "@id": "/api/v1/conversations/plain-1", identifier: "plain-1" });
    }),
    http.post(`${BASE}/api/v1/conversations/plain-1/messages`, () =>
      HttpResponse.json({ "@id": "/api/v1/messages/m1" }, { status: 201 }),
    ),
  );
});

describe("compose outcome preview", () => {
  it("outcome_comes_from_preflight_before_any_create", async () => {
    usePreflight(() => preflightReply("plain_fallback", { unreachableUserIds: [2] }));
    renderCompose();

    await pickBora();

    await waitFor(() => expect(preflightCalls).toHaveLength(1));
    expect(decodeURIComponent(preflightCalls[0] ?? "")).toContain("memberUserIds[]=2");
    expect(await screen.findByTestId("e2ee-plain-inline")).toBeInTheDocument();
    expect(createCalls).toEqual([]);
  });

  it("outcome_encrypted_when_everyone_reachable_no_plain_option", async () => {
    const harness = await encryptedHarness(BASE);
    usePreflight(() => preflightReply("encrypted"));
    renderCompose({ identity: harness.me });

    await pickBora();
    expect(await screen.findByTestId("e2ee-outcome-encrypted")).toBeInTheDocument();
    expect(screen.queryByTestId("e2ee-plain-inline")).toBeNull();
    await userEvent.click(screen.getByText("send-stub"));

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith({
        to: "/dm/$conversationId",
        params: { conversationId: harness.conversation.identifier },
      }),
    );
    expect(createCalls).toEqual([]);
    expect(screen.queryByTestId("e2ee-plain-fallback-dialog")).toBeNull();
    const sent = harness.bodies.find((b) => b.method === "POST");
    expect(JSON.parse(sent?.body ?? "{}").text).toMatch(/^e2ee:1:/);
    expect(sent?.body).not.toContain("hello there");
    expect(harness.delivery.users.get(PEER)).toBeDefined();
  });

  it("outcome_plain_fallback_requires_confirm_and_names_user", async () => {
    usePreflight(() => preflightReply("plain_fallback", { unreachableUserIds: [2] }));
    renderCompose();
    await pickBora();
    await screen.findByTestId("e2ee-plain-inline");

    await userEvent.click(screen.getByText("send-stub"));

    expect(await screen.findByTestId("e2ee-plain-fallback-dialog")).toHaveTextContent("Bora");
    expect(createCalls).toEqual([]);
    await userEvent.click(screen.getByTestId("e2ee-plain-fallback-confirm"));
    await waitFor(() => expect(createCalls).toEqual([{ memberUserIds: [2] }]));
  });

  it("cancelling the plain warning keeps the draft", async () => {
    usePreflight(() => preflightReply("plain_fallback", { unreachableUserIds: [2] }));
    renderCompose();
    await pickBora();
    await screen.findByTestId("e2ee-plain-inline");

    await userEvent.click(screen.getByText("send-stub"));
    await screen.findByTestId("e2ee-plain-fallback-dialog");
    await userEvent.click(screen.getByText("Cancel"));

    await expect(sends.last).rejects.toBeDefined();
    expect(createCalls).toEqual([]);
  });

  it("create_error_reruns_preflight_and_shows_outcome", async () => {
    usePreflight(
      () => preflightReply("plain", { reason: "operator_disabled" }),
      () =>
        preflightReply("blocked", {
          reason: "participant_refuses",
          refusingUserIds: [2],
          unreachableUserIds: [2],
        }),
    );
    serverInfo.mode = "disabled";
    server.use(
      http.post(`${BASE}/api/v1/conversations`, () =>
        HttpResponse.json({ error: "Bora only accepts encrypted DMs." }, { status: 422 }),
      ),
    );
    renderCompose();
    await pickBora();
    await waitFor(() => expect(preflightCalls).toHaveLength(1));

    await userEvent.click(screen.getByText("send-stub"));

    expect(await screen.findByTestId("e2ee-creation-blocked")).toHaveTextContent(
      "Bora only accepts end-to-end encrypted direct messages",
    );
    expect(notifyMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("pane-locked")).toHaveTextContent("locked");
  });

  it("group_compose_plain_with_warning_when_enabled", async () => {
    usePreflight(() => preflightReply("plain"));
    renderCompose();
    await pickBora();
    await userEvent.click(await screen.findByTestId("picker-chip-3"));
    await screen.findByTestId("e2ee-plain-inline");

    await userEvent.click(screen.getByText("send-stub"));

    expect(await screen.findByTestId("e2ee-plain-fallback-dialog")).toHaveTextContent(
      "Group conversations are not end-to-end encrypted",
    );
  });

  it("compose_hidden_on_web_when_required", async () => {
    serverInfo.mode = "required";
    usePreflight(() => preflightReply("encrypted"));
    renderCompose({ capable: false });
    await pickBora();

    expect(await screen.findByTestId("e2ee-creation-blocked")).toHaveTextContent(
      "Open the tyto.chat desktop app",
    );
    expect(screen.getByTestId("pane-locked")).toHaveTextContent("locked");
    await userEvent.click(screen.getByText("send-stub"));
    expect(createCalls).toEqual([]);
  });

  it("preselected recipient from the profile runs the preview and creates nothing", async () => {
    usePreflight(() => preflightReply("encrypted"));
    server.use(
      http.get(`${BASE}/api/v1/users/2`, () =>
        HttpResponse.json({ id: 2, profile: { name: "Bora", avatar: null } }),
      ),
    );
    renderCompose({ to: 2, capable: false });

    expect(await screen.findByText("Bora")).toBeInTheDocument();
    await waitFor(() => expect(preflightCalls).toHaveLength(1));
    expect(createCalls).toEqual([]);
  });
});
