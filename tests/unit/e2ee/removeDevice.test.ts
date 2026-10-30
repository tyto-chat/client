import { describe, expect, it } from "vitest";
import {
  CommitRejectedError,
  createEncryptedConversation,
  decryptMessage,
  sendEncrypted,
  type E2eeIdentity,
} from "@/e2ee/conversationSession";
import { RemovalIncompleteError, removeDevice } from "@/e2ee/removeDevice";
import type { Conversation } from "@/types/api";
import { FakeDeliveryServer, type FakeDevice } from "../../mocks/fakeDeliveryServer";
import { identityFor } from "../../mocks/e2eeIdentity";
import { createFakeMlsEngine } from "../../mocks/fakeMlsEngine";

const ALICE = 1;
const BOB = 2;
const CAROL = 3;

async function twoDeviceAlice() {
  const server = new FakeDeliveryServer();
  const laptop = await server.addDevice(ALICE);
  const phone = await server.addDevice(ALICE);
  const bobDevice = await server.addDevice(BOB);
  const alice = identityFor(server, ALICE, laptop);
  const alicePhone = identityFor(server, ALICE, phone);
  const bob = identityFor(server, BOB, bobDevice);
  const conversation = await createEncryptedConversation(alice, BOB);
  await alicePhone.processWelcomes();
  await bob.processWelcomes();
  return { server, laptop, phone, alice, alicePhone, bob, conversation };
}

async function read(
  identity: E2eeIdentity,
  conversation: Conversation,
  id: string,
  server: FakeDeliveryServer,
) {
  return decryptMessage(identity.session(conversation), server.message(id));
}

describe("removing one of my devices", () => {
  it("peer_applies_valid_removal", async () => {
    const { server, phone, alice, alicePhone, bob, conversation } = await twoDeviceAlice();

    await removeDevice(alice, phone.credential.deviceId);
    const sent = await sendEncrypted(alice.session(conversation), "after the phone was removed");

    expect(await read(bob, conversation, sent.id, server)).toEqual({
      text: "after the phone was removed",
    });
    expect(await read(alicePhone, conversation, sent.id, server)).toEqual({ unreadable: true });
    const order = server.calls.filter((c) => c.userId === ALICE).map((c) => c.method);
    expect(order.lastIndexOf("submitCommit")).toBeLessThan(order.indexOf("revokeDevice"));
    expect(server.users.get(ALICE)?.revocations.map((r) => r.deviceId)).toEqual([
      phone.credential.deviceId,
    ]);
  });

  it("removed_device_cannot_decrypt_new_messages", async () => {
    const { server, phone, alice, alicePhone, bob, conversation } = await twoDeviceAlice();

    await removeDevice(alice, phone.credential.deviceId);
    const fromBob = await sendEncrypted(bob.session(conversation), "bob after removal");

    expect(await read(alicePhone, conversation, fromBob.id, server)).toEqual({ unreadable: true });
    expect(await read(alice, conversation, fromBob.id, server)).toEqual({
      text: "bob after removal",
    });
  });

  it("remove_commit_from_foreign_device_rejected", async () => {
    const { server, phone, alice, bob, conversation } = await twoDeviceAlice();
    const original = bob.revocations.isRevoked.bind(bob.revocations);
    bob.revocations.isRevoked = async (device) =>
      device.deviceId === phone.credential.deviceId || original(device);

    await sendEncrypted(bob.session(conversation), "bob drops alice's phone");

    const removal = server.conversationOf(conversation.identifier).commits.at(-1);
    expect(removal?.deviceId).toBe(server.users.get(BOB)?.devices[0]?.credential.deviceId);
    const rejected = alice.session(conversation).sync();
    await expect(rejected).rejects.toBeInstanceOf(CommitRejectedError);
    await expect(rejected).rejects.toMatchObject({ reason: "removed_not_authorised" });
  });

  it("malicious_server_readvertises_removed_device_rejected", async () => {
    const { server, phone, alice } = await twoDeviceAlice();
    await removeDevice(alice, phone.credential.deviceId);
    const carol = identityFor(server, CAROL, await server.addDevice(CAROL));
    const { packages } = await phone.engine.createKeyPackages(phone.engine.latest(), 2, 86_400);
    server.users.get(ALICE)?.devices.push({ ...phone, packages });
    const before = server.welcomes.length;

    await createEncryptedConversation(carol, ALICE);

    expect(server.welcomes.length).toBeGreaterThan(before);
    expect(server.welcomes.slice(before).map((w) => w.deviceId)).not.toContain(
      phone.credential.deviceId,
    );
  });

  it("malicious_server_presents_removed_credential_under_new_device_id_rejected", async () => {
    const { server, phone, alice } = await twoDeviceAlice();
    await removeDevice(alice, phone.credential.deviceId);
    const carol = identityFor(server, CAROL, await server.addDevice(CAROL));
    const disguised = { ...phone.credential, deviceId: crypto.randomUUID() };
    const engine = createFakeMlsEngine(disguised);
    const { state } = await engine.generateDevice(disguised);
    const { packages } = await engine.createKeyPackages(state, 2, 86_400);
    const fake: FakeDevice = { credential: disguised, key: phone.key, engine, packages };
    server.users.get(ALICE)?.devices.push(fake);

    await createEncryptedConversation(carol, ALICE);

    expect(server.welcomes.map((w) => w.deviceId)).not.toContain(disguised.deviceId);
  });

  it("removes nothing for a device of another account", async () => {
    const { server, alice, bob, conversation } = await twoDeviceAlice();
    const bobDevice = server.users.get(BOB)?.devices[0]?.credential.deviceId as string;

    await expect(removeDevice(alice, bobDevice)).rejects.toThrow();

    expect(server.conversationOf(conversation.identifier).commits).toHaveLength(1);
    expect(await bob.session(conversation).status()).toBe("ready");
  });

  it("revokes on the server even when one conversation cannot be updated", async () => {
    const { server, phone, alice, conversation } = await twoDeviceAlice();
    const broken = { ...conversation, identifier: "missing", id: 999 };
    const fetchEncrypted = alice.transport.fetchEncryptedConversations.bind(alice.transport);
    alice.transport.fetchEncryptedConversations = async () => [broken, ...(await fetchEncrypted())];

    await expect(removeDevice(alice, phone.credential.deviceId)).rejects.toThrow(
      RemovalIncompleteError,
    );

    expect(server.users.get(ALICE)?.revocations.map((r) => r.deviceId)).toEqual([
      phone.credential.deviceId,
    ]);
    const removals = server.conversationOf(conversation.identifier).commits;
    expect(removals.at(-1)?.deviceId).toBe(alice.deviceId);
  });

  it("revokes on the server even when the conversation list cannot be loaded", async () => {
    const { server, phone, alice } = await twoDeviceAlice();
    alice.transport.fetchEncryptedConversations = async () => {
      throw new TypeError("Failed to fetch");
    };

    await expect(removeDevice(alice, phone.credential.deviceId)).rejects.toThrow(
      RemovalIncompleteError,
    );

    expect(server.users.get(ALICE)?.revocations.map((r) => r.deviceId)).toEqual([
      phone.credential.deviceId,
    ]);
  });
});
