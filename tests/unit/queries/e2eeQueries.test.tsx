import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createEncryptedConversation, sendEncrypted } from "@/e2ee/conversationSession";
import { useDecryptedMessage, useE2eeSync } from "@/queries/e2eeQueries";
import { FakeDeliveryServer } from "../../mocks/fakeDeliveryServer";
import { identityFor } from "../../mocks/e2eeIdentity";

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

async function pair() {
  const server = new FakeDeliveryServer();
  const alice = identityFor(server, 1, await server.addDevice(1));
  const bob = identityFor(server, 2, await server.addDevice(2));
  const conversation = await createEncryptedConversation(alice, 2);
  return { server, alice, bob, conversation };
}

describe("e2ee queries", () => {
  it("decrypts a message through the session and keys the cache by account and revision", async () => {
    const { server, alice, bob, conversation } = await pair();
    await bob.processWelcomes();
    const sent = await sendEncrypted(alice.session(conversation), "hi");
    const client = new QueryClient();

    const { result } = renderHook(
      () => useDecryptedMessage(bob.session(conversation), server.message(sent.id)),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.data).toEqual({ text: "hi" }));
    const [key] = client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(key).toContain(`${bob.scope.serverOrigin}|2|${bob.deviceId}`);
    expect(JSON.parse(String(key?.[2]))).toEqual(
      expect.arrayContaining([conversation.id, sent.id, 1, 1]),
    );
  });

  it("never serves cached plaintext for changed routing fields", async () => {
    const { server, alice, bob, conversation } = await pair();
    await bob.processWelcomes();
    const sent = await sendEncrypted(alice.session(conversation), "authentic");
    const client = new QueryClient();
    const genuine = server.message(sent.id);
    const forged = { ...genuine, createdBy: { ...genuine.createdBy, id: 2 } } as typeof genuine;

    const { result, rerender } = renderHook(
      ({ message }) => useDecryptedMessage(bob.session(conversation), message),
      { wrapper: wrapper(client), initialProps: { message: genuine } },
    );
    await waitFor(() => expect(result.current.data).toEqual({ text: "authentic" }));
    rerender({ message: forged });

    await waitFor(() => expect(result.current.data).toEqual({ tampered: "author" }));
  });

  it("re-reads an unreadable message once the device joins the group", async () => {
    const { server, alice, bob, conversation } = await pair();
    const sent = await sendEncrypted(alice.session(conversation), "after joining");
    vi.spyOn(bob, "startSync").mockImplementation(() => () => undefined);
    server.dropResponse("fetchWelcomes");
    const client = new QueryClient();

    const { result } = renderHook(
      () => {
        useE2eeSync(bob);
        return useDecryptedMessage(bob.session(conversation), server.message(sent.id));
      },
      { wrapper: wrapper(client) },
    );
    await waitFor(() => expect(result.current.data).toEqual({ unreadable: true }));

    await bob.processWelcomes();

    await waitFor(() => expect(result.current.data).toEqual({ text: "after joining" }));
  });

  it("joins a conversation through the background sync without waiting for an event", async () => {
    const { bob, conversation } = await pair();
    const start = vi.spyOn(bob, "startSync");

    const { unmount } = renderHook(() => useE2eeSync(bob, 60_000), {
      wrapper: wrapper(new QueryClient()),
    });

    await waitFor(async () => expect(await bob.session(conversation).status()).toBe("ready"));
    expect(start).toHaveBeenCalledWith(60_000);
    unmount();
  });
});
