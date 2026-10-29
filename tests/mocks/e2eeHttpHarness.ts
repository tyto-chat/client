import { http, HttpResponse } from "msw";
import { ApiError } from "@/api/client";
import { createEncryptedConversation, type E2eeIdentity } from "@/e2ee/conversationSession";
import { httpE2eeTransport } from "@/e2ee/transport";
import type { Conversation, Message } from "@/types/api";
import { FakeDeliveryServer } from "./fakeDeliveryServer";
import { identityFor } from "./e2eeIdentity";
import { server as mockFetch } from "./server";

export const ME = 1;
export const PEER = 2;

export interface EncryptedHarness {
  delivery: FakeDeliveryServer;
  me: E2eeIdentity;
  peer: E2eeIdentity;
  conversation: Conversation;
  bodies: { method: string; url: string; body: string }[];
}

function asJsonError(error: unknown) {
  if (error instanceof ApiError) {
    return HttpResponse.json(error.body as Record<string, unknown>, { status: error.status });
  }
  throw error;
}

export async function encryptedHarness(base: string): Promise<EncryptedHarness> {
  const delivery = new FakeDeliveryServer();
  const myDevice = await delivery.addDevice(ME);
  const peerDevice = await delivery.addDevice(PEER);
  const mine = delivery.transportFor(ME);
  const me = identityFor(delivery, ME, myDevice, {
    transport: {
      ...mine,
      sendMessage: httpE2eeTransport.sendMessage,
      sendReply: httpE2eeTransport.sendReply,
      editMessage: httpE2eeTransport.editMessage,
      fetchMessage: httpE2eeTransport.fetchMessage,
    },
  });
  const peer = identityFor(delivery, PEER, peerDevice);
  const conversation = await createEncryptedConversation(me, PEER);
  await peer.processWelcomes();
  const bodies: EncryptedHarness["bodies"] = [];
  const record = async (request: Request) => {
    const body = await request.text();
    bodies.push({ method: request.method, url: request.url, body });
    return JSON.parse(body) as { text: string; id?: string; baseRevisionCount?: number };
  };
  const messagesOf = (identifier: string, roots: boolean) =>
    [...delivery.messages.values()].filter(
      (m) => m.conversationIdentifier === identifier && (m.parent === null) === roots,
    );
  const c = conversation.identifier;

  mockFetch.use(
    http.get(`${base}/api/v1/conversations/${c}`, () =>
      HttpResponse.json(delivery.conversationOf(c).conversation),
    ),
    http.get(`${base}/api/v1/conversations/${c}/pages`, () =>
      HttpResponse.json({
        "@type": "Collection",
        "hydra:member": [{ "@id": "p1", pageNumber: 1, messageCount: 1 }],
        totalItems: 1,
      }),
    ),
    http.get(`${base}/api/v1/conversations/${c}/pages/1`, () =>
      HttpResponse.json({
        "@id": `/api/v1/conversations/${c}/pages/1`,
        "@type": "ChannelPage",
        id: 1,
        pageNumber: 1,
        messageCount: messagesOf(c, true).length,
        prevPageId: null,
        nextPageId: null,
        messages: messagesOf(c, true),
      }),
    ),
    http.post(`${base}/api/v1/conversations/${c}/messages`, async ({ request }) => {
      const body = await record(request);
      return HttpResponse.json(await mine.sendMessage(c, body.text, body.id as string), {
        status: 201,
      });
    }),
    http.post(`${base}/api/v1/conversations/${c}/mark-read`, () =>
      HttpResponse.json(delivery.conversationOf(c).conversation),
    ),
    http.get(`${base}/api/v1/messages/:id/thread`, ({ params }) =>
      HttpResponse.json({
        "@type": "Collection",
        "hydra:member": [...delivery.messages.values()].filter(
          (m) => m.parent?.id === String(params.id),
        ),
        totalItems: 0,
      }),
    ),
    http.post(`${base}/api/v1/messages/:id/replies`, async ({ request, params }) => {
      const body = await record(request);
      return HttpResponse.json(
        await mine.sendReply(String(params.id), body.text, body.id as string),
        { status: 201 },
      );
    }),
    http.patch(`${base}/api/v1/messages/:id`, async ({ request, params }) => {
      const body = await record(request);
      try {
        return HttpResponse.json(
          await mine.editMessage(
            `/api/v1/messages/${String(params.id)}`,
            body.text,
            body.baseRevisionCount as number,
          ),
        );
      } catch (error) {
        return asJsonError(error);
      }
    }),
    http.get(`${base}/api/v1/messages/:id`, ({ params }) =>
      HttpResponse.json(delivery.message(String(params.id))),
    ),
  );
  return { delivery, me, peer, conversation, bodies };
}

export function rootsOf(harness: EncryptedHarness): Message[] {
  return [...harness.delivery.messages.values()].filter((m) => m.parent === null);
}
